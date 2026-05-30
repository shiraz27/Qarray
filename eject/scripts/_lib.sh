# shellcheck shell=bash
# Shared helpers for all phase scripts.

log()  { printf '\033[36m[eject %s]\033[0m %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '\033[33m[eject %s WARN]\033[0m %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die()  { printf '\033[31m[eject %s FATAL]\033[0m %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }

require() {
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || die "Missing env var: $v (see eject/templates/.env.eject.example)"
  done
}

have() { command -v "$1" >/dev/null 2>&1; }

load_env() {
  local env_file
  env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.eject"
  [[ -f "$env_file" ]] || die "$env_file not found. cp templates/.env.eject.example .env.eject"
  set -a; # shellcheck disable=SC1090
  source "$env_file"; set +a
}

# Supabase Management API (admin operations on a Cloud project)
mgmt_api() {
  local method="$1" path="$2"; shift 2
  curl -fsS -X "$method" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.supabase.com${path}" "$@"
}

# Per-project admin (auth) API on either source or target
auth_admin() {
  local base="$1" key="$2" method="$3" path="$4"; shift 4
  curl -fsS -X "$method" \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    "${base}${path}" "$@"
}
*** End Patch