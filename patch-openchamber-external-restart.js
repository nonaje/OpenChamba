#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const serverRoot =
  process.env.OPENCHAMBER_SERVER_ROOT ||
  '/usr/local/lib/node_modules/@openchamber/web/server';

const lifecycleFile = path.join(serverRoot, 'lib/opencode/lifecycle.js');

const lifecycleHelperMarker = '/* open-chamba external restart bridge patch */';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Required OpenChamber file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writePatchedFile(filePath, content) {
  fs.writeFileSync(filePath, content);
}

function patchLifecycle(source) {
  let patched = source;

  if (!patched.includes(lifecycleHelperMarker)) {
    const helperAnchor = '  const waitForOpenCodePort = async (timeoutMs = 15000) => {';
    if (!patched.includes(helperAnchor)) {
      fail(`Could not find lifecycle helper anchor in ${lifecycleFile}`);
    }

    const helperBlock = `  ${lifecycleHelperMarker}\n  const restartExternalOpenCodeViaBridge = async () => {\n    const restartUrl = typeof process.env.OPENCHAMBER_EXTERNAL_RESTART_URL === 'string'\n      ? process.env.OPENCHAMBER_EXTERNAL_RESTART_URL.trim()\n      : '';\n    if (!restartUrl) {\n      return false;\n    }\n\n    const timeoutMs = Number(process.env.OPENCHAMBER_EXTERNAL_RESTART_TIMEOUT_MS || 15000);\n    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {\n      throw new Error('OPENCHAMBER_EXTERNAL_RESTART_TIMEOUT_MS must be a positive number');\n    }\n\n    const token = typeof process.env.OPENCHAMBER_EXTERNAL_RESTART_TOKEN === 'string'\n      ? process.env.OPENCHAMBER_EXTERNAL_RESTART_TOKEN.trim()\n      : '';\n    const headers = {};\n    if (token) {\n      headers.Authorization = \`Bearer \${token}\`;\n    }\n\n    console.log(\`Requesting external OpenCode restart via \${restartUrl}...\`);\n    const controller = new AbortController();\n    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);\n\n    let response;\n    try {\n      response = await fetch(restartUrl, {\n        method: 'POST',\n        headers,\n        signal: controller.signal,\n      });\n    } catch (error) {\n      if (error?.name === 'AbortError') {\n        throw new Error(\`External OpenCode restart request timed out after \${timeoutMs}ms\`);\n      }\n      throw error;\n    } finally {\n      clearTimeout(timeoutId);\n    }\n\n    if (response.status === 409) {\n      console.log('External OpenCode restart already in progress; waiting for probe.');\n      return true;\n    }\n\n    if (!response.ok) {\n      let details = '';\n      try {\n        details = (await response.text()).trim();\n      } catch {\n      }\n      throw new Error(\n        details\n          ? \`External OpenCode restart failed (\${response.status}): \${details}\`\n          : \`External OpenCode restart failed with status \${response.status}\`\n      );\n    }\n\n    return true;\n  };\n\n`;
    patched = patched.replace(helperAnchor, `${helperBlock}${helperAnchor}`);
  }

  const restartCallBefore = "      if (state.isExternalOpenCode) {\n        console.log('Re-probing external OpenCode server...');";
  const restartCallAfter = "      if (state.isExternalOpenCode) {\n        await restartExternalOpenCodeViaBridge();\n        console.log('Re-probing external OpenCode server...');";
  if (patched.includes(restartCallBefore)) {
    patched = patched.replace(restartCallBefore, restartCallAfter);
  } else if (!patched.includes(restartCallAfter)) {
    fail(`Could not patch external restart branch in ${lifecycleFile}`);
  }

  return patched;
}

const lifecycleSource = readRequiredFile(lifecycleFile);
const patchedLifecycle = patchLifecycle(lifecycleSource);

writePatchedFile(lifecycleFile, patchedLifecycle);
