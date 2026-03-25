#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/../.." && pwd)
init_script="${repo_root}/init-data-dirs.sh"

tmp_root=$(mktemp -d)
trap 'rm -rf "${tmp_root}"' EXIT

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'ok - %s\n' "$1"
}

assert_dir_exists() {
  local dir_path="$1"

  [[ -d "$dir_path" ]] || fail "expected directory to exist: ${dir_path}"
}

assert_dir_missing() {
  local dir_path="$1"

  [[ ! -e "$dir_path" ]] || fail "expected path to be absent: ${dir_path}"
}

assert_ssh_mode() {
  local dir_path="$1"
  local mode

  mode=$(stat -c '%a' "$dir_path")
  [[ "$mode" == "700" ]] || fail "expected ${dir_path} to have mode 700, got ${mode}"
}

run_case() {
  local case_dir="$1"
  shift

  mkdir -p "$case_dir"
  (
    cd "$case_dir"
    "$init_script" "$@" >/dev/null
  )
}

default_case_dir="${tmp_root}/default"
run_case "$default_case_dir"
assert_dir_exists "${default_case_dir}/data/opencode/config"
assert_dir_exists "${default_case_dir}/data/opencode/share"
assert_dir_exists "${default_case_dir}/data/opencode/state"
assert_dir_exists "${default_case_dir}/data/opencode/cache"
assert_dir_exists "${default_case_dir}/data/openchamber/config"
assert_dir_exists "${default_case_dir}/data/openchamber/share"
assert_dir_exists "${default_case_dir}/data/openchamber/state"
assert_dir_exists "${default_case_dir}/data/openchamber/cache"
assert_dir_exists "${default_case_dir}/data/ssh"
assert_dir_exists "${default_case_dir}/projects"
assert_ssh_mode "${default_case_dir}/data/ssh"
pass "default directories are created"

relative_env_case_dir="${tmp_root}/relative-env"
mkdir -p "$relative_env_case_dir"
cat >"${relative_env_case_dir}/.env.test" <<'EOF'
HOST_PROJECTS_DIR=./custom-projects
EOF
run_case "$relative_env_case_dir" --env-file .env.test
assert_dir_exists "${relative_env_case_dir}/custom-projects"
assert_dir_missing "${relative_env_case_dir}/projects"
pass "relative HOST_PROJECTS_DIR from env file is honored"

absolute_env_case_dir="${tmp_root}/absolute-env"
absolute_projects_dir="${absolute_env_case_dir}/mounted/workspaces"
mkdir -p "$absolute_env_case_dir"
cat >"${absolute_env_case_dir}/.env.test" <<EOF
HOST_PROJECTS_DIR=${absolute_projects_dir}
EOF
run_case "$absolute_env_case_dir" --env-file .env.test
assert_dir_exists "$absolute_projects_dir"
assert_dir_missing "${absolute_env_case_dir}/projects"
pass "absolute HOST_PROJECTS_DIR from env file is honored"

safe_parse_case_dir="${tmp_root}/safe-parse-env"
marker_file="${safe_parse_case_dir}/should-not-exist"
mkdir -p "$safe_parse_case_dir"
{
  printf '%s\n' "HOST_PROJECTS_DIR='./custom-\$HOME-projects'"
  printf 'OPENCHAMBER_UI_PASSWORD=$(touch %q)\n' "$marker_file"
} >"${safe_parse_case_dir}/.env.test"
run_case "$safe_parse_case_dir" --env-file .env.test
assert_dir_exists "${safe_parse_case_dir}/custom-\$HOME-projects"
assert_dir_missing "$marker_file"
assert_dir_missing "${safe_parse_case_dir}/projects"
pass "env file is parsed without executing shell expressions"

missing_env_case_dir="${tmp_root}/missing-env"
mkdir -p "$missing_env_case_dir"
if (
  cd "$missing_env_case_dir"
  "$init_script" --env-file .env.missing >/dev/null 2>&1
); then
  fail "missing env file should fail"
fi
pass "missing env file fails fast"
