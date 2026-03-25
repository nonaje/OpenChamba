#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./init-data-dirs.sh [--env-file PATH]

Options:
  --env-file PATH  Read HOST_PROJECTS_DIR from a Compose-style env file.
  -h, --help       Show this help message.
EOF
}

trim_leading_whitespace() {
  local value="$1"
  printf '%s' "${value#"${value%%[![:space:]]*}"}"
}

trim_trailing_whitespace() {
  local value="$1"
  printf '%s' "${value%"${value##*[![:space:]]}"}"
}

read_env_value() {
  local env_file_path="$1"
  local var_name="$2"
  local line=""
  local raw_value=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"

    if [[ ! "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${var_name}[[:space:]]*[:=][[:space:]]*(.*)$ ]]; then
      continue
    fi

    raw_value="${BASH_REMATCH[2]}"
    raw_value="$(trim_leading_whitespace "$raw_value")"

    if [[ "$raw_value" == \#* ]]; then
      printf '%s\n' ""
      return 0
    fi

    if [[ "$raw_value" == "'"* ]]; then
      if [[ "$raw_value" =~ ^\'(([^\']|\\.)*)\'([[:space:]]+#.*)?[[:space:]]*$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]//\\\'/\'}"
        return 0
      fi
    elif [[ "$raw_value" == '"'* ]]; then
      if [[ "$raw_value" =~ ^\"(([^\"]|\\.)*)\"([[:space:]]+#.*)?[[:space:]]*$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]}"
        return 0
      fi
    else
      raw_value="${raw_value%%[[:space:]]#*}"
      raw_value="$(trim_trailing_whitespace "$raw_value")"
      printf '%s\n' "$raw_value"
      return 0
    fi
  done <"$env_file_path"

  return 1
}

root_dir=$(pwd)
env_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      if [[ $# -lt 2 ]]; then
        printf '%s\n' "Missing path after --env-file" >&2
        usage >&2
        exit 1
      fi
      env_file="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "$env_file" ]]; then
  if [[ "$env_file" != /* ]]; then
    env_file="${root_dir}/${env_file}"
  fi
  if [[ ! -f "$env_file" ]]; then
    printf 'Env file not found: %s\n' "$env_file" >&2
    exit 1
  fi
  if env_projects_dir="$(read_env_value "$env_file" "HOST_PROJECTS_DIR")"; then
    HOST_PROJECTS_DIR="$env_projects_dir"
  fi
fi

data_root="${root_dir}/data"
projects_dir="${HOST_PROJECTS_DIR:-${root_dir}/projects}"

dirs=(
  "${data_root}/opencode/config"
  "${data_root}/opencode/share"
  "${data_root}/opencode/state"
  "${data_root}/opencode/cache"
  "${data_root}/openchamber/config"
  "${data_root}/openchamber/share"
  "${data_root}/openchamber/state"
  "${data_root}/openchamber/cache"
  "${data_root}/ssh"
  "${projects_dir}"
)

for dir in "${dirs[@]}"; do
  mkdir -p "$dir"
done

if command -v chown >/dev/null 2>&1; then
  if [[ "$(id -u)" -eq 0 ]]; then
    chown -R 1000:1000 "${data_root}" "${projects_dir}"
  elif [[ "$(id -u)" -ne 1000 ]]; then
    printf '%s\n' "Created directories, but ownership is still $(id -u):$(id -g)." >&2
    printf '%s\n' "If the containers cannot write to the initialized directories, run:" >&2
    printf '  sudo chown -R 1000:1000 %q %q\n' "${data_root}" "${projects_dir}" >&2
  fi
fi

chmod 700 "${data_root}/ssh" 2>/dev/null || true

printf '%s\n' "Initialized data directories under ${data_root}"
