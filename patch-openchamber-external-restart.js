#!/usr/bin/env node

const fs = require('fs');

const serverFile = process.env.OPENCHAMBER_SERVER_FILE || '/usr/local/lib/node_modules/@openchamber/web/server/index.js';
const helperMarker = '/* open-chamba external restart patch */';

const helperBlock = `${helperMarker}
async function restartExternalOpenCodeViaBridge() {
  const restartUrl = typeof process.env.OPENCHAMBER_EXTERNAL_RESTART_URL === 'string'
    ? process.env.OPENCHAMBER_EXTERNAL_RESTART_URL.trim()
    : '';
  if (!restartUrl) {
    return false;
  }

  const headers = {};
  const timeoutMs = Number(process.env.OPENCHAMBER_EXTERNAL_RESTART_TIMEOUT_MS || 15000);
  const token = typeof process.env.OPENCHAMBER_EXTERNAL_RESTART_TOKEN === 'string'
    ? process.env.OPENCHAMBER_EXTERNAL_RESTART_TOKEN.trim()
    : '';
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('OPENCHAMBER_EXTERNAL_RESTART_TIMEOUT_MS must be a positive number');
  }
  if (token) {
    headers.Authorization = \`Bearer \${token}\`;
  }

  console.log(\`Requesting external OpenCode restart via \${restartUrl}...\`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(\`External OpenCode restart request timed out after \${timeoutMs}ms\`));
  }, timeoutMs);

  let response;
  try {
    response = await fetch(restartUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let details = '';
    try {
      details = (await response.text()).trim();
    } catch {
    }
    throw new Error(
      details
        ? \`External OpenCode restart failed (\${response.status}): \${details}\`
        : \`External OpenCode restart failed with status \${response.status}\`
    );
  }

  return true;
}

`;

const branchBefore = `    // For external OpenCode servers, re-probe instead of kill + respawn\n    if (isExternalOpenCode) {\n      console.log('Re-probing external OpenCode server...');\n      const probePort = openCodePort || ENV_CONFIGURED_OPENCODE_PORT || 4096;\n      const probeOrigin = openCodeBaseUrl ?? ENV_CONFIGURED_OPENCODE_HOST?.origin;\n      const healthy = await probeExternalOpenCode(probePort, probeOrigin);\n      if (healthy) {\n        console.log(\`External OpenCode server on port \${probePort} is healthy\`);\n        setOpenCodePort(probePort);\n        isOpenCodeReady = true;\n        lastOpenCodeError = null;\n        openCodeNotReadySince = 0;\n        syncToHmrState();\n      } else {\n        lastOpenCodeError = \`External OpenCode server on port \${probePort} is not responding\`;\n        console.error(lastOpenCodeError);\n        throw new Error(lastOpenCodeError);\n      }\n\n      if (expressApp) {\n        setupProxy(expressApp);\n        ensureOpenCodeApiPrefix();\n      }\n      return;\n    }`;

const branchAfter = `    // For external OpenCode servers, optionally restart via bridge and then re-probe\n    if (isExternalOpenCode) {\n      await restartExternalOpenCodeViaBridge();\n      console.log('Re-probing external OpenCode server...');\n      const probePort = openCodePort || ENV_CONFIGURED_OPENCODE_PORT || 4096;\n      const probeOrigin = openCodeBaseUrl ?? ENV_CONFIGURED_OPENCODE_HOST?.origin;\n      const healthy = await probeExternalOpenCode(probePort, probeOrigin);\n      if (healthy) {\n        console.log(\`External OpenCode server on port \${probePort} is healthy\`);\n        setOpenCodePort(probePort);\n        isOpenCodeReady = true;\n        lastOpenCodeError = null;\n        openCodeNotReadySince = 0;\n        syncToHmrState();\n      } else {\n        lastOpenCodeError = \`External OpenCode server on port \${probePort} is not responding\`;\n        console.error(lastOpenCodeError);\n        throw new Error(lastOpenCodeError);\n      }\n\n      if (expressApp) {\n        setupProxy(expressApp);\n        ensureOpenCodeApiPrefix();\n      }\n      return;\n    }`;

const restartAnchor = 'async function restartOpenCode() {';

if (!fs.existsSync(serverFile)) {
  console.error(`OpenChamber server bundle not found at ${serverFile}`);
  process.exit(1);
}

const source = fs.readFileSync(serverFile, 'utf8');
if (source.includes(helperMarker)) {
  process.exit(0);
}

if (!source.includes(restartAnchor)) {
  console.error(`Could not find restart anchor in ${serverFile}`);
  process.exit(1);
}

if (!source.includes(branchBefore)) {
  console.error(`Could not find external restart branch in ${serverFile}`);
  process.exit(1);
}

const patched = source
  .replace(restartAnchor, `${helperBlock}${restartAnchor}`)
  .replace(branchBefore, branchAfter);

fs.writeFileSync(serverFile, patched);
