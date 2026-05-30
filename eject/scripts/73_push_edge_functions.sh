#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env
require TARGET_SUPABASE_PROJECT_REF
have supabase || die "supabase CLI required: https://supabase.com/docs/guides/cli"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

log "Linking supabase CLI to target project $TARGET_SUPABASE_PROJECT_REF"
supabase link --project-ref "$TARGET_SUPABASE_PROJECT_REF" >/dev/null

for dir in supabase/functions/*/; do
  fn="$(basename "$dir")"
  [[ "$fn" == "_shared" ]] && continue
  log "Deploying $fn"
  supabase functions deploy "$fn" --no-verify-jwt 2>&1 | sed 's/^/  /'
done
log "Edge functions deployed"
*** End Patch