#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { URL } = require('url');

const port = Number(process.env.PORT || 8081);
const authToken = (process.env.EXEC_BRIDGE_TOKEN || '').trim();
const maxBodyBytes = Number(process.env.EXEC_BRIDGE_MAX_BODY_BYTES || 65536);
const defaultTimeoutMs = Number(process.env.EXEC_BRIDGE_DEFAULT_TIMEOUT_MS || 30000);
const maxTimeoutMs = Number(process.env.EXEC_BRIDGE_MAX_TIMEOUT_MS || 300000);
const maxOutputBytes = Number(process.env.EXEC_BRIDGE_MAX_OUTPUT_BYTES || 1048576);

const runningExecs = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function validateConfig() {
  if (!authToken) {
    throw new Error('EXEC_BRIDGE_TOKEN is required');
  }
  if (authToken.length < 16 || /^change-me/i.test(authToken)) {
    throw new Error('EXEC_BRIDGE_TOKEN must be strong');
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  if (!Number.isFinite(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error('EXEC_BRIDGE_MAX_BODY_BYTES must be a positive number');
  }
  if (!Number.isFinite(defaultTimeoutMs) || defaultTimeoutMs <= 0) {
    throw new Error('EXEC_BRIDGE_DEFAULT_TIMEOUT_MS must be a positive number');
  }
  if (!Number.isFinite(maxTimeoutMs) || maxTimeoutMs <= 0) {
    throw new Error('EXEC_BRIDGE_MAX_TIMEOUT_MS must be a positive number');
  }
  if (defaultTimeoutMs > maxTimeoutMs) {
    throw new Error('EXEC_BRIDGE_DEFAULT_TIMEOUT_MS cannot be greater than EXEC_BRIDGE_MAX_TIMEOUT_MS');
  }
  if (!Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new Error('EXEC_BRIDGE_MAX_OUTPUT_BYTES must be a positive number');
  }
}

function checkAuth(req) {
  return req.headers.authorization === `Bearer ${authToken}`;
}

function createJob(id, timeoutMs) {
  const now = new Date().toISOString();
  return {
    id,
    status: 'queued',
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    child: null,
    containerId: null,
    command: null,
    exitCode: null,
    signal: null,
    cancelled: false,
    timeout: false,
    timeoutMs,
    stdout: '',
    stderr: '',
    error: null,
    timeoutHandle: null,
  };
}

function jobResponse(job) {
  return {
    ok: job.status === 'finished' && !job.cancelled && !job.timeout && job.exitCode === 0,
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    containerId: job.containerId,
    command: job.command,
    exitCode: job.exitCode,
    signal: job.signal,
    cancelled: job.cancelled,
    timeout: job.timeout,
    timeoutMs: job.timeoutMs,
    stdout: job.stdout,
    stderr: job.stderr,
    error: job.error,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let body = '';
    req.setEncoding('utf8');

    req.on('data', (chunk) => {
      total += Buffer.byteLength(chunk);
      if (total > maxBodyBytes) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });

    req.on('error', (error) => {
      reject(Object.assign(error, { statusCode: 400 }));
    });
  });
}

function runDocker(args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`docker command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxOutputBytes) {
        stdout += chunk.toString('utf8');
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < maxOutputBytes) {
        stderr += chunk.toString('utf8');
      }
    });

    child.on('error', (error) => {
      clearTimeout(killTimer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ code: code === null ? 1 : code, stdout, stderr });
    });
  });
}

async function resolveContainerId(target) {
  if (!target || typeof target !== 'object') {
    throw Object.assign(new Error('target is required'), { statusCode: 400 });
  }

  if (typeof target.container === 'string' && target.container.trim()) {
    const id = target.container.trim();
    const result = await runDocker(['inspect', '--format', '{{.Id}}', id]);
    if (result.code !== 0) {
      throw Object.assign(new Error(`container '${id}' not found`), { statusCode: 404 });
    }
    return result.stdout.trim();
  }

  if (typeof target.service === 'string' && target.service.trim()) {
    const service = target.service.trim();
    const args = ['ps', '-q', '--filter', `label=com.docker.compose.service=${service}`];
    if (typeof target.project === 'string' && target.project.trim()) {
      args.push('--filter', `label=com.docker.compose.project=${target.project.trim()}`);
    }

    const result = await runDocker(args);
    if (result.code !== 0) {
      throw Object.assign(new Error(`docker ps failed: ${result.stderr || 'unknown error'}`), { statusCode: 502 });
    }

    const ids = result.stdout
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      throw Object.assign(new Error('no container found for requested compose target'), { statusCode: 404 });
    }
    if (ids.length > 1) {
      throw Object.assign(new Error('multiple containers found for requested compose target'), { statusCode: 409 });
    }
    return ids[0];
  }

  throw Object.assign(new Error('target must include either { container } or { service, project? }'), { statusCode: 400 });
}

async function inspectContainer(id) {
  const result = await runDocker(['inspect', '--format', '{{.Name}}', id]);
  if (result.code !== 0) {
    return { id };
  }
  return {
    id,
    name: result.stdout.trim().replace(/^\//, ''),
  };
}

function parseExecCommand(payload) {
  if (!payload || typeof payload !== 'object') {
    throw Object.assign(new Error('request body is required'), { statusCode: 400 });
  }

  if (Array.isArray(payload.command) && payload.command.length > 0) {
    const args = payload.command.map((part) => String(part));
    return { argv: args, raw: args.join(' ') };
  }

  if (typeof payload.command === 'string' && payload.command.trim()) {
    const command = payload.command.trim();
    return { argv: ['sh', '-lc', command], raw: command };
  }

  throw Object.assign(new Error('command must be a non-empty array or string'), { statusCode: 400 });
}

async function handleResolve(req, res) {
  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const containerId = await resolveContainerId(body.target || body);
    const details = await inspectContainer(containerId);
    sendJson(res, 200, { ok: true, target: details });
  } catch (error) {
    sendJson(res, error.statusCode || 502, { error: error.message || 'resolve failed' });
  }
}

async function executeJob(job, body) {
  try {
    if (job.cancelled) {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      return;
    }

    const target = body.target || body;
    const containerId = await resolveContainerId(target);
    const command = parseExecCommand(body);
    const args = ['exec'];
    if (body.tty === true) {
      args.push('-t');
    }
    args.push(containerId, ...command.argv);

    job.containerId = containerId;
    job.command = command.raw;
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    job.child = child;

    child.stdout.on('data', (chunk) => {
      if (job.stdout.length < maxOutputBytes) {
        job.stdout += chunk.toString('utf8');
      }
    });

    child.stderr.on('data', (chunk) => {
      if (job.stderr.length < maxOutputBytes) {
        job.stderr += chunk.toString('utf8');
      }
    });

    job.timeoutHandle = setTimeout(() => {
      job.cancelled = true;
      job.timeout = true;
      child.kill('SIGKILL');
    }, job.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(job.timeoutHandle);
      job.child = null;
      job.status = 'failed';
      job.error = error.message || 'docker exec failed';
      job.finishedAt = new Date().toISOString();
    });

    child.on('close', (code, signal) => {
      clearTimeout(job.timeoutHandle);
      job.child = null;
      job.exitCode = code;
      job.signal = signal || null;
      if (job.cancelled) {
        job.status = 'cancelled';
      } else {
        job.status = 'finished';
      }
      job.finishedAt = new Date().toISOString();
    });
  } catch (error) {
    job.child = null;
    job.status = 'failed';
    job.error = error.message || 'exec failed';
    job.finishedAt = new Date().toISOString();
  }
}

async function handleExec(req, res) {
  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const timeoutMs = Math.max(1, Math.min(Number(body.timeoutMs || defaultTimeoutMs), maxTimeoutMs));
    parseExecCommand(body);
    const id = randomUUID();
    const job = createJob(id, timeoutMs);
    runningExecs.set(id, job);
    executeJob(job, body);
    sendJson(res, 202, { ok: true, id, status: job.status });
  } catch (error) {
    sendJson(res, error.statusCode || 502, { error: error.message || 'exec failed' });
  }
}

async function handleExecStatus(req, res, execId) {
  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const job = runningExecs.get(execId);
  if (!job) {
    sendJson(res, 404, { error: 'execution not found' });
    return;
  }

  sendJson(res, 200, jobResponse(job));
}

async function handleCancel(req, res, execId) {
  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const state = runningExecs.get(execId);
  if (!state) {
    sendJson(res, 404, { error: 'execution not found' });
    return;
  }

  if (state.status === 'finished' || state.status === 'failed' || state.status === 'cancelled') {
    sendJson(res, 409, { error: 'execution already completed', id: execId, status: state.status });
    return;
  }

  state.cancelled = true;
  if (state.child) {
    state.child.kill('SIGTERM');
    setTimeout(() => {
      const active = runningExecs.get(execId);
      if (active && active.child) {
        active.child.kill('SIGKILL');
      }
    }, 1500);
  } else {
    state.status = 'cancelled';
    state.finishedAt = new Date().toISOString();
  }

  sendJson(res, 202, { ok: true, id: execId, cancelled: true });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true, running: runningExecs.size });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/resolve') {
      await handleResolve(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/exec') {
      await handleExec(req, res);
      return;
    }

    if (req.method === 'GET' && /^\/v1\/exec\/[a-f0-9-]+$/i.test(url.pathname)) {
      const execId = url.pathname.split('/')[3];
      await handleExecStatus(req, res, execId);
      return;
    }

    if (req.method === 'POST' && /^\/v1\/exec\/[a-f0-9-]+\/cancel$/i.test(url.pathname)) {
      const execId = url.pathname.split('/')[3];
      await handleCancel(req, res, execId);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Unexpected error' });
  }
});

validateConfig();

server.listen(port, '0.0.0.0', () => {
  console.log(`exec-bridge listening on ${port}`);
});
