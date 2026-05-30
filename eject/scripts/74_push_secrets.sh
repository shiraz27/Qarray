#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env
require TARGET_SUPABASE_PROJECT_REF
have supabase || die "supabase CLI required"

SECRETS_FILE="$RUN_DIR/secrets.eject.env"

# Build the actual env file from .env.eject values.
log "Composing $SECRETS_FILE from .env.eject"
: > "$SECRETS_FILE"
for k in OPENROUTER_API_KEY ARCHIVE_ORG_ACCESS_KEY ARCHIVE_ORG_SECRET_KEY OLLAMA_BASE_URL GOOGLE_GENERATIVE_AI_API_KEY; do
  v="${!k:-}"
  [[ -n "$v" ]] && echo "$k=$v" >> "$SECRETS_FILE"
done

if [[ ! -s "$SECRETS_FILE" ]]; then
  warn "No third-party secrets configured; skipping push"
  exit 0
fi

log "Pushing $(wc -l < "$SECRETS_FILE") secrets to project $TARGET_SUPABASE_PROJECT_REF"
supabase secrets set --project-ref "$TARGET_SUPABASE_PROJECT_REF" --env-file "$SECRETS_FILE"

# Shred the file post-push so plaintext keys don't linger.
shred -u "$SECRETS_FILE" 2>/dev/null || rm -f "$SECRETS_FILE"
log "Secrets pushed and local copy shredded"
*** End Patch