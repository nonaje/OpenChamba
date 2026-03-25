#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/../.." && pwd)

tmp_root=$(mktemp -d)
dev_case_root=""
dev_env_file=""
prod_case_root=""
prod_env_file=""
prod_network=""

cleanup() {
  if [[ -n "$dev_case_root" && -n "$dev_env_file" ]]; then
    docker compose \
      --project-directory "$dev_case_root" \
      --env-file "$dev_env_file" \
      -f "${dev_case_root}/docker-compose.yml" \
      -f "${dev_case_root}/docker-compose.dev.yml" \
      down -v --remove-orphans >/dev/null 2>&1 || true
  fi

  if [[ -n "$prod_case_root" && -n "$prod_env_file" ]]; then
    docker compose \
      --project-directory "$prod_case_root" \
      --env-file "$prod_env_file" \
      -f "${prod_case_root}/docker-compose.yml" \
      -f "${prod_case_root}/docker-compose.prod.yml" \
      down -v --remove-orphans >/dev/null 2>&1 || true
  fi

  if [[ -n "$prod_network" ]]; then
    docker network rm "$prod_network" >/dev/null 2>&1 || true
  fi

  rm -rf "$tmp_root"
}

trap cleanup EXIT

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'ok - %s\n' "$1"
}

skip() {
  printf 'skip - %s\n' "$1"
  exit 0
}

copy_case_repo() {
  local case_root="$1"

  mkdir -p "$case_root"
  cp \
    "${repo_root}/Dockerfile.opencode" \
    "${repo_root}/Dockerfile.openchamber" \
    "${repo_root}/docker-compose.yml" \
    "${repo_root}/docker-compose.dev.yml" \
    "${repo_root}/docker-compose.prod.yml" \
    "${repo_root}/entrypoint-common.sh" \
    "${repo_root}/init-data-dirs.sh" \
    "${repo_root}/opencode-entrypoint.sh" \
    "${repo_root}/openchamber-entrypoint.sh" \
    "$case_root/"

  chmod +x \
    "${case_root}/init-data-dirs.sh" \
    "${case_root}/opencode-entrypoint.sh" \
    "${case_root}/openchamber-entrypoint.sh" \
    "${case_root}/entrypoint-common.sh"
}

compose_case() {
  local case_root="$1"
  local env_file="$2"
  local override_file="$3"
  shift 3

  docker compose \
    --project-directory "$case_root" \
    --env-file "$env_file" \
    -f "${case_root}/docker-compose.yml" \
    -f "$override_file" \
    "$@"
}

assert_running_services() {
  local case_root="$1"
  local env_file="$2"
  local override_file="$3"
  local services

  services=$(compose_case "$case_root" "$env_file" "$override_file" ps --services --status running)
  grep -Fxq 'opencode' <<<"$services" || fail "opencode is not running"
  grep -Fxq 'openchamber' <<<"$services" || fail "openchamber is not running"
}

if ! docker compose version >/dev/null 2>&1; then
  skip "docker compose not available; live startup smoke not run"
fi

if [[ "${RUN_LIVE_SMOKE:-0}" != "1" ]]; then
  skip "live startup smoke disabled; set RUN_LIVE_SMOKE=1 to enable it"
fi

dev_case_root="${tmp_root}/live-dev"
dev_env_file="${dev_case_root}/.env.live.dev"
copy_case_repo "$dev_case_root"
cat >"$dev_env_file" <<'EOF'
HOST_PROJECTS_DIR=./live-dev-projects
OPENCODE_BIND_ADDRESS=127.0.0.1
OPENCODE_SERVER_PORT=44097
OPENCODE_AUX_SERVER_PORT=11456
OPENCODE_HOST=0.0.0.0
OPENCODE_DISABLE_AUTOUPDATE=true
OPENCHAMBER_BIND_ADDRESS=127.0.0.1
OPENCHAMBER_PORT=33001
OPENCHAMBER_HOST=0.0.0.0
OPENCHAMBER_DATA_DIR=/home/openchamber/.config/openchamber
OPENCODE_SKIP_START=true
OPENCHAMBER_UI_PASSWORD=
NODE_ENV=development
EOF
(
  cd "$dev_case_root"
  ./init-data-dirs.sh --env-file .env.live.dev >/dev/null
)
compose_case "$dev_case_root" "$dev_env_file" "${dev_case_root}/docker-compose.dev.yml" up -d --build --wait
assert_running_services "$dev_case_root" "$dev_env_file" "${dev_case_root}/docker-compose.dev.yml"
pass "dev stack reaches running state with custom env overrides"

prod_case_root="${tmp_root}/live-prod"
prod_env_file="${prod_case_root}/.env.live.prod"
prod_network="openchamba-live-traefik"
copy_case_repo "$prod_case_root"
docker network create "$prod_network" >/dev/null 2>&1 || true
cat >"$prod_env_file" <<EOF
HOST_PROJECTS_DIR=./live-prod-projects
OPENCODE_SERVER_PORT=4096
OPENCODE_HOST=0.0.0.0
OPENCODE_DISABLE_AUTOUPDATE=true
OPENCODE_AUX_SERVER_PORT=1455
OPENCHAMBER_PORT=3000
OPENCHAMBER_HOST=0.0.0.0
OPENCHAMBER_DATA_DIR=/home/openchamber/.config/openchamber
OPENCODE_SKIP_START=true
OPENCHAMBER_UI_PASSWORD=live-smoke-password
OPENCHAMBER_DOMAIN=live.example.test
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERTRESOLVER=localresolver
TRAEFIK_DOCKER_NETWORK=${prod_network}
NODE_ENV=production
EOF
(
  cd "$prod_case_root"
  ./init-data-dirs.sh --env-file .env.live.prod >/dev/null
)
compose_case "$prod_case_root" "$prod_env_file" "${prod_case_root}/docker-compose.prod.yml" up -d --build --wait
assert_running_services "$prod_case_root" "$prod_env_file" "${prod_case_root}/docker-compose.prod.yml"

prod_container_id=$(compose_case "$prod_case_root" "$prod_env_file" "${prod_case_root}/docker-compose.prod.yml" ps -q openchamber)
prod_networks=$(docker inspect "$prod_container_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}')
grep -Fxq 'openchamba-prod' <<<"$prod_networks" || fail "openchamber is missing openchamba-prod network"
grep -Fxq "$prod_network" <<<"$prod_networks" || fail "openchamber is missing ${prod_network} network"
pass "prod stack reaches running state and attaches required networks"
