#!/usr/bin/env bash
# Orchestrator. Runs all phases in order; resumable via --from=NN.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/scripts/_lib.sh"

TARGET="cloud"
FROM=""
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#*=}" ;;
    --from=*)   FROM="${arg#*=}" ;;
    --dry-run)  DRY_RUN=1 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--target=cloud|self-hosted] [--from=NN] [--dry-run]

  --target       cloud | self-hosted     (default: cloud)
  --from=NN      skip phases before NN   (e.g. --from=70 to resume restore)
  --dry-run      run dump phases only; skip provisioning + restore
EOF
      exit 0 ;;
    *) die "Unknown arg: $arg" ;;
  esac
done

[[ "$TARGET" == "cloud" || "$TARGET" == "self-hosted" ]] || die "--target must be cloud or self-hosted"

load_env
export TARGET DRY_RUN

OUT_BASE="$HERE/out"
if [[ -n "${EJECT_RUN_DIR:-}" ]]; then
  RUN_DIR="$EJECT_RUN_DIR"
else
  RUN_DIR="$OUT_BASE/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$RUN_DIR"
fi
export RUN_DIR
log "Run directory: $RUN_DIR"
log "Target: $TARGET   Dry-run: $DRY_RUN"

PHASES=(
  "00:00_preflight.sh"
  "10:10_dump_schema.sh"
  "20:20_dump_data.sh"
  "30:30_dump_storage.sh"
  "40:40_dump_edge_functions.sh"
  "50:50_dump_auth_users.sh"
  "60:60_provision_target.sh"
  "70:70_restore_schema.sh"
  "71:71_restore_data.sh"
  "72:72_restore_auth_users.sh"
  "73:73_push_edge_functions.sh"
  "74:74_push_secrets.sh"
  "75:75_clone_auth_settings.sh"
  "80:80_rewrite_frontend.sh"
  "90:90_cutover.sh"
)

for entry in "${PHASES[@]}"; do
  num="${entry%%:*}"
  script="${entry#*:}"
  [[ -n "$FROM" && "$num" < "$FROM" ]] && { log "Skip $num (--from=$FROM)"; continue; }
  if [[ "$DRY_RUN" == "1" && "$num" -ge 60 ]]; then
    log "Skip $num (--dry-run; no provisioning/restore)"
    continue
  fi
  log "================ Phase $num : $script ================"
  bash "$HERE/scripts/$script" 2>&1 | tee -a "$RUN_DIR/RESTORE.log"
done

log "DONE. Inspect $RUN_DIR. Next: read docs/RUNBOOK.md §10 (cutover checklist)."
*** End Patch