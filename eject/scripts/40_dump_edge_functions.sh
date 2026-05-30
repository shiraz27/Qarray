#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/supabase/functions"
DST="$RUN_DIR/edge_functions"

if [[ ! -d "$SRC" ]]; then
  warn "No supabase/functions directory; skipping"
  exit 0
fi

log "Copying edge functions from $SRC"
mkdir -p "$DST"
cp -R "$SRC/." "$DST/"

# Also copy supabase/config.toml so per-function settings (verify_jwt, import_map) carry over.
[[ -f "$ROOT/supabase/config.toml" ]] && cp "$ROOT/supabase/config.toml" "$RUN_DIR/config.toml"

# Enumerate referenced secrets so the user knows what 74_push_secrets needs.
log "Scanning for referenced secrets"
grep -rhoE "Deno\.env\.get\(['\"][A-Z0-9_]+['\"]\)" "$DST" \
  | sed -E "s/Deno\.env\.get\(['\"]([A-Z0-9_]+)['\"]\)/\1/" \
  | sort -u > "$RUN_DIR/secrets.referenced.txt"

# Pre-fill template; values left blank are populated by 60_provision later.
{
  echo "# Auto-generated. Fill in BLANK values, then 74_push_secrets.sh uploads to target."
  echo "# Supabase-managed (auto-injected on the new project, do NOT set manually):"
  while read -r s; do
    case "$s" in
      SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SUPABASE_JWKS|SUPABASE_PUBLISHABLE_KEY*|SUPABASE_SECRET_KEYS)
        echo "# $s=<auto>" ;;
      LOVABLE_API_KEY)
        echo "# $s=<not portable — replace this provider in code before cutover>" ;;
      *)
        echo "$s=\${$s}" ;;
    esac
  done < "$RUN_DIR/secrets.referenced.txt"
} > "$RUN_DIR/secrets.template.env"

log "Found $(wc -l < "$RUN_DIR/secrets.referenced.txt") referenced secret names"
log "Edge functions dumped to $DST"
*** End Patch