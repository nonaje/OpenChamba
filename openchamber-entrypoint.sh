#!/usr/bin/env bash
set -euo pipefail

python3 --version >/dev/null 2>&1 || {
  printf '%s\n' "FATAL: python3 is required in the OpenChamber runtime image." >&2
  exit 1
}

node -e "const major = Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('FATAL: Node.js 20+ is required, found ' + process.versions.node); process.exit(1); }" >/dev/null 2>&1 || {
  printf '%s\n' "FATAL: Node.js 20+ is required in the OpenChamber runtime image." >&2
  exit 1
}

npm --version >/dev/null 2>&1 || {
  printf '%s\n' "FATAL: npm is required in the OpenChamber runtime image." >&2
  exit 1
}

OPENCHAMBER_PORT=${OPENCHAMBER_PORT:-3000}
OPENCHAMBER_HOST=${OPENCHAMBER_HOST:-0.0.0.0}
OPENCHAMBER_DATA_DIR=${OPENCHAMBER_DATA_DIR:-${HOME}/.config/openchamber}
OPENCODE_SERVER_PORT=${OPENCODE_SERVER_PORT:-${OPENCODE_PORT:-${OPENCHAMBER_OPENCODE_PORT:-4096}}}

if [[ -z "${OPENCODE_HOST:-}" ]]; then
  OPENCODE_HOST="http://opencode:${OPENCODE_SERVER_PORT}"
elif [[ ! "${OPENCODE_HOST}" =~ ^https?:// ]]; then
  printf '%s\n' "WARN: OPENCODE_HOST must be an absolute URL (http/https). Falling back to http://opencode:${OPENCODE_SERVER_PORT}" >&2
  OPENCODE_HOST="http://opencode:${OPENCODE_SERVER_PORT}"
fi

export OPENCHAMBER_PORT OPENCHAMBER_HOST OPENCHAMBER_DATA_DIR OPENCODE_SERVER_PORT OPENCODE_HOST

dirs=(
  "/workspace/projects"
  "${OPENCHAMBER_DATA_DIR}"
  "${HOME}/.config/opencode"
  "${HOME}/.local/share/openchamber"
  "${HOME}/.local/share/opencode"
  "${HOME}/.local/state/openchamber"
  "${HOME}/.cache/openchamber"
)

for dir in "${dirs[@]}"; do
  mkdir -p "$dir"
done

# shellcheck source=entrypoint-common.sh
source "$(dirname "$0")/entrypoint-common.sh"
setup_ssh

if [[ -n "${OPENCHAMBER_EXTERNAL_RESTART_URL:-}" ]]; then
  node /usr/local/bin/patch-openchamber-external-restart.js
fi

if [[ "$#" -gt 0 ]]; then
  exec "$@"
fi

run_dir="${OPENCHAMBER_DATA_DIR}/run"
logs_dir="${OPENCHAMBER_DATA_DIR}/logs"
pid_file="${run_dir}/openchamber-${OPENCHAMBER_PORT}.pid"
instance_file="${run_dir}/openchamber-${OPENCHAMBER_PORT}.json"
log_file="${logs_dir}/openchamber-${OPENCHAMBER_PORT}.log"
tail_pid=""
server_pid=""

cleanup() {
  if [[ -n "$tail_pid" ]]; then
    kill "$tail_pid" 2>/dev/null || true
  fi
  openchamber stop --port "$OPENCHAMBER_PORT" >/dev/null 2>&1 || true
}

trap cleanup INT TERM

mkdir -p "$run_dir" "$logs_dir"

if [[ -s "$pid_file" ]]; then
  server_pid=$(tr -d '[:space:]' < "$pid_file")
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    printf '%s\n' "OpenChamber already running on port $OPENCHAMBER_PORT (PID: $server_pid); attaching to logs."
  else
    rm -f "$pid_file" "$instance_file"
    server_pid=""
  fi
fi

if [[ -z "$server_pid" ]]; then
  openchamber serve --port "$OPENCHAMBER_PORT"
fi

for _ in $(seq 1 50); do
  if [[ -s "$pid_file" ]]; then
    break
  fi
  sleep 0.2
done

if [[ ! -s "$pid_file" ]]; then
  printf '%s\n' "FATAL: OpenChamber did not create a PID file at $pid_file." >&2
  exit 1
fi

server_pid=${server_pid:-$(tr -d '[:space:]' < "$pid_file")}
tail -n 0 -F "$log_file" &
tail_pid=$!

while kill -0 "$server_pid" 2>/dev/null; do
  sleep 1
done

kill "$tail_pid" 2>/dev/null || true
wait "$tail_pid" 2>/dev/null || true
exit 1
