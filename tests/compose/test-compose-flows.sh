#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/../.." && pwd)

tmp_root=$(mktemp -d)
trap 'rm -rf "${tmp_root}"' EXIT

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

assert_contains() {
  local file_path="$1"
  local expected="$2"

  if ! grep -Fq -- "$expected" "$file_path"; then
    fail "expected '${expected}' in ${file_path}"
  fi
}

assert_not_contains() {
  local file_path="$1"
  local unexpected="$2"

  if grep -Fq -- "$unexpected" "$file_path"; then
    fail "did not expect '${unexpected}' in ${file_path}"
  fi
}

assert_matches() {
  local file_path="$1"
  local pattern="$2"

  if ! grep -Eq -- "$pattern" "$file_path"; then
    fail "expected pattern '${pattern}' in ${file_path}"
  fi
}

compose_config() {
  local env_file="$1"
  local override_file="$2"
  local output_file="$3"

  docker compose \
    --project-directory "$repo_root" \
    --env-file "$env_file" \
    -f "${repo_root}/docker-compose.yml" \
    -f "$override_file" \
    config >"$output_file"
}

if ! docker compose version >/dev/null 2>&1; then
  skip "docker compose not available; config smoke tests not run"
fi

dev_env_file="${tmp_root}/dev.env"
dev_output_file="${tmp_root}/dev-config.yml"
dev_projects_source="${repo_root}/custom-dev-projects"
cat >"$dev_env_file" <<'EOF'
HOST_PROJECTS_DIR=./custom-dev-projects
OPENCODE_BIND_ADDRESS=127.0.0.2
OPENCODE_SERVER_PORT=44096
OPENCODE_AUX_SERVER_PORT=11455
OPENCODE_HOST=0.0.0.0
OPENCODE_DISABLE_AUTOUPDATE=true
OPENCHAMBER_BIND_ADDRESS=127.0.0.3
OPENCHAMBER_PORT=33000
OPENCHAMBER_HOST=0.0.0.0
OPENCHAMBER_DATA_DIR=/home/openchamber/.config/openchamber
OPENCODE_SKIP_START=true
OPENCHAMBER_UI_PASSWORD=
NODE_ENV=development
EOF
compose_config "$dev_env_file" "${repo_root}/docker-compose.dev.yml" "$dev_output_file"
assert_contains "$dev_output_file" 'name: openchamba-dev'
assert_contains "$dev_output_file" 'host_ip: 127.0.0.2'
assert_contains "$dev_output_file" 'host_ip: 127.0.0.3'
assert_contains "$dev_output_file" 'published: "44096"'
assert_contains "$dev_output_file" 'published: "11455"'
assert_contains "$dev_output_file" 'published: "33000"'
assert_contains "$dev_output_file" "source: ${dev_projects_source}"
assert_matches "$dev_output_file" 'host\.docker\.internal[[:space:]"]*[:=][[:space:]"]*host-gateway|host-gateway[[:space:]"]*[:=][[:space:]"]*host\.docker\.internal'
pass "dev config respects custom env overrides"

prod_env_file="${tmp_root}/prod.env"
prod_output_file="${tmp_root}/prod-config.yml"
cat >"$prod_env_file" <<'EOF'
HOST_PROJECTS_DIR=/tmp/openchamba-prod-projects
OPENCODE_SERVER_PORT=4096
OPENCODE_HOST=0.0.0.0
OPENCODE_DISABLE_AUTOUPDATE=true
OPENCODE_AUX_SERVER_PORT=1455
OPENCHAMBER_PORT=3000
OPENCHAMBER_HOST=0.0.0.0
OPENCHAMBER_DATA_DIR=/home/openchamber/.config/openchamber
OPENCODE_SKIP_START=true
OPENCHAMBER_UI_PASSWORD=test-password
OPENCHAMBER_DOMAIN=agents.example.test
TRAEFIK_ENTRYPOINT=edge
TRAEFIK_CERTRESOLVER=stagingresolver
TRAEFIK_DOCKER_NETWORK=custom-traefik-network
NODE_ENV=production
EOF
compose_config "$prod_env_file" "${repo_root}/docker-compose.prod.yml" "$prod_output_file"
assert_contains "$prod_output_file" 'name: openchamba-prod'
assert_contains "$prod_output_file" 'name: custom-traefik-network'
assert_matches "$prod_output_file" 'Host\([`"'"'"']?agents\.example\.test[`"'"'"']?\)'
assert_matches "$prod_output_file" 'traefik\.http\.routers\.openchamber\.entrypoints[[:space:]"]*[:=][[:space:]"]*edge'
assert_matches "$prod_output_file" 'traefik\.http\.routers\.openchamber\.tls\.certresolver[[:space:]"]*[:=][[:space:]"]*stagingresolver'
assert_contains "$prod_output_file" 'source: /tmp/openchamba-prod-projects'
assert_contains "$prod_output_file" 'traefik-public:'
assert_contains "$prod_output_file" 'openchamba-internal:'
assert_not_contains "$prod_output_file" 'published:'
pass "prod config respects required auth and traefik overrides"

prod_missing_password_env_file="${tmp_root}/prod-missing-password.env"
cat >"$prod_missing_password_env_file" <<'EOF'
HOST_PROJECTS_DIR=/tmp/openchamba-prod-projects
OPENCHAMBER_DOMAIN=agents.example.test
TRAEFIK_CERTRESOLVER=stagingresolver
NODE_ENV=production
EOF
if compose_config "$prod_missing_password_env_file" "${repo_root}/docker-compose.prod.yml" "${tmp_root}/should-not-exist.yml" 2>"${tmp_root}/prod-missing-password.stderr"; then
  fail "prod config without OPENCHAMBER_UI_PASSWORD should fail"
fi
assert_contains "${tmp_root}/prod-missing-password.stderr" 'set_OPENCHAMBER_UI_PASSWORD'
pass "prod config fails fast when UI password is missing"
