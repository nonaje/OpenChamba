#!/usr/bin/env bash
set -euo pipefail

root_dir=$(pwd)
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
    printf '%s\n' "If the containers cannot write to ./data or projects, run:" >&2
    printf '  sudo chown -R 1000:1000 %q %q\n' "${data_root}" "${projects_dir}" >&2
  fi
fi

chmod 700 "${data_root}/ssh" 2>/dev/null || true

printf '%s\n' "Initialized data directories under ${data_root}"
