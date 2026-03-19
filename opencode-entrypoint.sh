#!/usr/bin/env bash
set -euo pipefail

dirs=(
  "/workspace/projects"
  "${HOME}/.config/opencode"
  "${HOME}/.local/share/opencode"
  "${HOME}/.local/state/opencode"
  "${HOME}/.cache/opencode"
)

for dir in "${dirs[@]}"; do
  mkdir -p "$dir"
done

# shellcheck source=entrypoint-common.sh
source "$(dirname "$0")/entrypoint-common.sh"
setup_ssh

node <<'EOF'
const fs = require('fs');
const path = require('path');

const defaultsDir = '/usr/local/share/opencode-defaults';
const configDir = path.join(process.env.HOME, '.config', 'opencode');
const configPath = path.join(configDir, 'opencode.json');
const defaultsPath = path.join(defaultsDir, 'opencode.json');

fs.mkdirSync(configDir, { recursive: true });

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const defaults = readJson(defaultsPath);
const current = readJson(configPath);
const merged = { ...defaults, ...current };
merged.server = { ...(defaults.server || {}), ...(current.server || {}) };
merged.plugin = Array.from(new Set([...(defaults.plugin || []), ...(current.plugin || [])]));
if (typeof merged.server.port !== 'number') {
  merged.server.port = Number(process.env.OPENCODE_SERVER_PORT || 4096);
}

fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));

const optionalFiles = ['oh-my-opencode-slim.json'];
for (const file of optionalFiles) {
  const source = path.join(defaultsDir, file);
  const destination = path.join(configDir, file);
  if (fs.existsSync(source) && !fs.existsSync(destination)) {
    fs.copyFileSync(source, destination);
  }
}
EOF

OPENCODE_SERVER_PORT=${OPENCODE_SERVER_PORT:-4096}
OPENCODE_HOST=${OPENCODE_HOST:-0.0.0.0}

if [[ "$#" -eq 0 ]]; then
  set -- opencode serve --port "$OPENCODE_SERVER_PORT" --hostname "$OPENCODE_HOST"
fi

exec "$@"
