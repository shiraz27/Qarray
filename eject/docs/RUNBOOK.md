# Runbook

Sequential operator guide. Assumes you've read `eject/README.md`.

## 1. Install local tools

```bash
# macOS
brew install postgresql jq age supabase/tap/supabase node
# Linux
sudo apt install -y postgresql-client jq age nodejs
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.deb -o /tmp/s.deb && sudo dpkg -i /tmp/s.deb
```

## 2. Fill credentials

```bash
cp eject/templates/.env.eject.example eject/.env.eject
$EDITOR eject/.env.eject
```

You need:
- **SOURCE_SUPABASE_DB_URL**: visible in Lovable Cloud → Database → Connection string (URI). Use the **Direct connection** (port 5432), not the pooler.
- **SOURCE_SUPABASE_SERVICE_ROLE_KEY**: Lovable Cloud → API → service_role.
- **SUPABASE_ACCESS_TOKEN** (cloud target): https://supabase.com/dashboard/account/tokens
- **TARGET_ORG_ID**: visible in any project URL `dashboard/org/<id>` or `mgmt_api GET /v1/organizations`.
- The three third-party keys at the bottom (OpenRouter, Archive.org x2) — copy from your own records, they are not retrievable from Lovable.

## 3. Dry run

```bash
bash eject/eject.sh --target=cloud --dry-run
```

Verifies preflight + dumps schema, data, storage, edge functions, auth users. Nothing remote is created. Inspect `eject/out/<ts>/`.

## 4. Real run

```bash
bash eject/eject.sh --target=cloud
# or
bash eject/eject.sh --target=self-hosted
```

Takes ~3-10 min depending on data volume + Cloud project boot time.

## 5. Resume after a phase failure

Phases are numbered. Find the phase that failed in the log, fix the issue, then:

```bash
EJECT_RUN_DIR=eject/out/<ts> bash eject/eject.sh --target=cloud --from=70
```

## 6. Sanity checks per phase

| Phase | Verify                                                                 |
|-------|------------------------------------------------------------------------|
| 10    | `wc -l out/<ts>/schema.sql` — should be hundreds of lines             |
| 20    | `head -50 out/<ts>/data.sql` — should show `COPY public.profiles ...` |
| 50    | `jq 'length' out/<ts>/auth_users.json` — matches `select count(*) from auth.users` |
| 70    | `psql $TARGET_SUPABASE_DB_URL -c '\dt public.*'` — every table present|
| 72    | Try `POST /auth/v1/token?grant_type=password` with a known user — succeeds |
| 90    | Row counts per table match (printed by script)                         |

## 7. Things that will NOT transfer automatically

These require manual one-time pasting into the new project:

1. **OAuth client secrets** (Google etc.). The Management API does not return
   secrets on GET, so 75_clone_auth_settings copies everything *except* the
   secret. Paste it once in the target dashboard → Authentication → Providers.
2. **Custom SMTP credentials** if you used one. Same reason.
3. **`LOVABLE_API_KEY`** — only valid against Lovable's AI gateway. Before
   cutover, edit `supabase/functions/ai-generate/index.ts` (and any other
   function calling `ai.gateway.lovable.dev`) to use Google AI directly:
   ```ts
   const key = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")!;
   const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
   ```

## 8. Disable Lovable Cloud

After phase 90 smoke tests pass and users have re-tested for ~24h:

1. Lovable → Connectors → Lovable Cloud → **Disable Cloud**.
2. The auto-managed files (`src/integrations/supabase/client.ts`, `.env`, `supabase/config.toml`) become yours. Keep them in version control.
3. The Lovable AI gateway stops working; ensure step 7.3 is done first.
*** End Patch