#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env
require TARGET_SUPABASE_URL TARGET_SUPABASE_ANON_KEY TARGET_SUPABASE_PROJECT_REF

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV="$ROOT/.env"
CLIENT="$ROOT/src/integrations/supabase/client.ts"

log "Patching $ENV"
cp "$ENV" "$ENV.pre-eject.bak"
cat > "$ENV" <<EOF
VITE_SUPABASE_URL="$TARGET_SUPABASE_URL"
VITE_SUPABASE_PUBLISHABLE_KEY="$TARGET_SUPABASE_ANON_KEY"
VITE_SUPABASE_PROJECT_ID="$TARGET_SUPABASE_PROJECT_REF"
EOF

# client.ts is auto-managed by Lovable. Once the .env values change at build
# time, the client will point at the new project. After you disconnect Lovable
# Cloud, this file is yours to maintain — keep it minimal and reading from import.meta.env.
log "Wrote $ENV. Backup: $ENV.pre-eject.bak"

diff -u "$ENV.pre-eject.bak" "$ENV" > "$RUN_DIR/frontend_patch.diff" || true
log "Diff saved to $RUN_DIR/frontend_patch.diff"
*** End Patch