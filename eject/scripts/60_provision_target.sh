#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

if [[ "$TARGET" == "cloud" ]]; then
  exec bash "$(dirname "$0")/61_provision_cloud.sh"
else
  exec bash "$(dirname "$0")/62_provision_self_hosted.sh"
fi
*** End Patch