#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

TEMPLATE="$(cd "$(dirname "$0")/../templates" && pwd)/docker-compose.self-hosted.yml"
STACK_DIR="$RUN_DIR/self-hosted"
mkdir -p "$STACK_DIR"
cp "$TEMPLATE" "$STACK_DIR/docker-compose.yml"

if [[ -z "${SELF_HOSTED_JWT_SECRET:-}" ]]; then
  SELF_HOSTED_JWT_SECRET="$(openssl rand -hex 32)"
  log "Generated JWT secret"
fi

cat > "$STACK_DIR/.env" <<EOF
POSTGRES_PASSWORD=$SELF_HOSTED_DB_PASSWORD
JWT_SECRET=$SELF_HOSTED_JWT_SECRET
ANON_KEY=$(node -e "const j=require('jsonwebtoken');console.log(j.sign({role:'anon',iss:'supabase'},'$SELF_HOSTED_JWT_SECRET'))" 2>/dev/null || echo "INSTALL_jsonwebtoken_npm_i_-g_jsonwebtoken")
SERVICE_ROLE_KEY=$(node -e "const j=require('jsonwebtoken');console.log(j.sign({role:'service_role',iss:'supabase'},'$SELF_HOSTED_JWT_SECRET'))" 2>/dev/null || echo "INSTALL_jsonwebtoken_npm_i_-g_jsonwebtoken")
SITE_URL=$SELF_HOSTED_HOST
EOF

log "Starting docker compose stack in $STACK_DIR"
(cd "$STACK_DIR" && docker compose up -d)

log "Waiting for Postgres on localhost:5432"
for i in $(seq 1 30); do
  docker compose -f "$STACK_DIR/docker-compose.yml" exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.eject"
ANON=$(grep '^ANON_KEY=' "$STACK_DIR/.env" | cut -d= -f2-)
SRV=$(grep '^SERVICE_ROLE_KEY=' "$STACK_DIR/.env" | cut -d= -f2-)
{
  echo "TARGET_SUPABASE_URL=\"$SELF_HOSTED_HOST\""
  echo "TARGET_SUPABASE_ANON_KEY=\"$ANON\""
  echo "TARGET_SUPABASE_SERVICE_ROLE_KEY=\"$SRV\""
  echo "TARGET_SUPABASE_DB_URL=\"postgres://postgres:${SELF_HOSTED_DB_PASSWORD}@localhost:5432/postgres\""
} >> "$ENV_FILE"
log "Self-hosted stack up. Credentials appended to .env.eject"
*** End Patch