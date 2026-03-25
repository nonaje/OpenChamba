#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

"${script_dir}/test-init-data-dirs.sh"
"${script_dir}/test-compose-flows.sh"
"${script_dir}/test-compose-live-smoke.sh"
