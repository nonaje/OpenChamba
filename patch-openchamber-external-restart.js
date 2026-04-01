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

const restartAnchor = 'async function restartOpenCode() {';
const externalBranchMatcher = /(\n[ \t]*)if \(isExternalOpenCode\) \{\n([\s\S]*?)\n\1\}/;

function patchExternalRestartBranch(source) {
  const match = source.match(externalBranchMatcher);
  if (!match) {
    return null;
  }

  const indent = match[1];
  const blockBody = match[2];

  if (!blockBody.includes('probeExternalOpenCode')) {
    return null;
  }

  if (blockBody.includes('restartExternalOpenCodeViaBridge();')) {
    return source;
  }

  const replacement = `${indent}if (isExternalOpenCode) {\n${indent}  await restartExternalOpenCodeViaBridge();${blockBody ? `\n${blockBody}` : ''}\n${indent}}`;
  return source.replace(externalBranchMatcher, `\n${replacement}`);
}

if (!fs.existsSync(serverFile)) {
  console.error(`OpenChamber server bundle not found at ${serverFile}`);
  process.exit(1);
}

const source = fs.readFileSync(serverFile, 'utf8');
if (source.includes(helperMarker)) {
  process.exit(0);
}

let patched = patchExternalRestartBranch(source);

if (!patched) {
  console.warn(`Could not find a compatible external restart branch in ${serverFile}; skipping patch.`);
  process.exit(0);
}

if (!patched.includes(helperMarker)) {
  if (patched.includes(restartAnchor)) {
    patched = patched.replace(restartAnchor, `${helperBlock}${restartAnchor}`);
  } else {
    patched = `${helperBlock}${patched}`;
  }
}

fs.writeFileSync(serverFile, patched);
