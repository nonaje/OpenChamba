#!/usr/bin/env node

const http = require('http');
const net = require('net');
const { URL } = require('url');

const port = Number(process.env.PORT || 8080);
const dockerSocketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const targetService = (process.env.TARGET_SERVICE || 'opencode').trim();
const targetProject = (process.env.TARGET_COMPOSE_PROJECT || '').trim();
const targetHost = (process.env.TARGET_HOST || targetService).trim();
const targetPort = Number(process.env.TARGET_PORT || 4096);
const authToken = (process.env.RESTART_BRIDGE_TOKEN || '').trim();
const restartTimeoutMs = Number(process.env.RESTART_TIMEOUT_MS || 90000);
const pollIntervalMs = Number(process.env.RESTART_POLL_INTERVAL_MS || 1000);

let restartInFlight = false;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function checkAuth(req) {
  if (!authToken) {
    return true;
  }
  const header = req.headers.authorization || '';
  return header === `Bearer ${authToken}`;
}

function dockerRequest(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      socketPath: dockerSocketPath,
      path,
      method,
      headers: {
        Host: 'docker',
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 500,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listContainers() {
  const response = await dockerRequest('GET', '/containers/json?all=1');
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Docker container listing failed with status ${response.statusCode}`);
  }
  return JSON.parse(response.body);
}

async function inspectContainer(containerId) {
  const response = await dockerRequest('GET', `/containers/${containerId}/json`);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Docker inspect failed with status ${response.statusCode}`);
  }
  return JSON.parse(response.body);
}

async function restartContainer(containerId) {
  const response = await dockerRequest('POST', `/containers/${containerId}/restart?t=10`);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Docker restart failed with status ${response.statusCode}`);
  }
}

async function findTargetContainer() {
  const containers = await listContainers();
  const matches = containers.filter((container) => {
    const labels = container.Labels || {};
    if (labels['com.docker.compose.service'] !== targetService) {
      return false;
    }
    if (targetProject && labels['com.docker.compose.project'] !== targetProject) {
      return false;
    }
    return true;
  });

  if (matches.length === 0) {
    throw new Error(`No container found for service '${targetService}'${targetProject ? ` in project '${targetProject}'` : ''}`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple containers found for service '${targetService}'${targetProject ? ` in project '${targetProject}'` : ''}`);
  }
  return matches[0];
}

function tcpProbe(host, portToProbe, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: portToProbe });
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));
  });
}

async function waitForHealthy(containerId) {
  const deadline = Date.now() + restartTimeoutMs;
  while (Date.now() < deadline) {
    const details = await inspectContainer(containerId);
    const state = details.State || {};
    const health = state.Health || null;
    const healthy = health ? health.Status === 'healthy' : await tcpProbe(targetHost, targetPort, 1500);
    if (state.Running && healthy) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for '${targetService}' to become healthy`);
}

async function handleRestart(req, res) {
  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (restartInFlight) {
    sendJson(res, 409, { error: 'Restart already in progress' });
    return;
  }

  restartInFlight = true;
  try {
    await readRequestBody(req);
    const container = await findTargetContainer();
    await restartContainer(container.Id);
    await waitForHealthy(container.Id);
    sendJson(res, 200, { ok: true, service: targetService });
  } catch (error) {
    sendJson(res, 502, { error: error.message || 'Restart failed' });
  } finally {
    restartInFlight = false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/restart/opencode') {
      await handleRestart(req, res);
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Unexpected error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`restart-bridge listening on ${port}`);
});
