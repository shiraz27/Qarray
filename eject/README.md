# Eject Kit

Migrate this project's backend (database, auth, edge functions, secrets, frontend
wiring) off Lovable Cloud onto either a standalone **Supabase Cloud** project or a
**self-hosted Supabase** stack — with zero manual recreation of auth users,
passwords, RLS, triggers, functions, or edge-function code.

## TL;DR

```bash
cp eject/templates/.env.eject.example eject/.env.eject
# fill in values (see RUNBOOK.md)

# Dry run — dumps everything locally, touches nothing remote
bash eject/eject.sh --target=cloud --dry-run

# Real run
bash eject/eject.sh --target=cloud           # Supabase Cloud
bash eject/eject.sh --target=self-hosted     # Docker-compose stack
```

## What you get out

After a successful run, `eject/out/<timestamp>/` contains:

- `schema.sql`              — full schema (tables, RLS, policies, functions, triggers, enums, grants)
- `data.sql`                — `COPY`-format dump of all public tables
- `auth_users.json`         — every auth user + **bcrypt password hash** (users keep their passwords)
- `storage/`                — files dumped from every storage bucket (empty for this project — none configured)
- `edge_functions/`         — verbatim copy of `supabase/functions/*`
- `secrets.template.env`    — list of required runtime secrets (values blank — paste manually)
- `auth_config.json`        — auth settings, email templates, redirect URLs
- `frontend_patch.diff`     — the codemod applied to rewire the app to the new project
- `RESTORE.log`             — full log of restore phase

## Phases

```
00 preflight       check tools (psql, supabase CLI, jq, age, curl, node) + creds
10 dump_schema     pg_dump --schema-only of `public` (+ enums, functions, triggers, grants)
20 dump_data       pg_dump --data-only --column-inserts of `public` tables
30 dump_storage    iterate buckets via Admin API, download every object
40 dump_edge_fns   tar -c supabase/functions/, generate secrets.template.env
50 dump_auth_users GET /auth/v1/admin/users (paginated) + raw bcrypt hash via SQL
60 provision       create target (cloud project OR docker-compose up)
70 restore_schema  psql < schema.sql
71 restore_data    psql < data.sql
72 restore_auth    POST /auth/v1/admin/users with password_hash field (no re-set)
73 push_edge_fns   supabase functions deploy <name> for each
74 push_secrets    supabase secrets set --env-file
75 clone_auth_cfg  PATCH new project's auth config + email templates
80 rewrite_front   codemod .env + src/integrations/supabase/client.ts URL/key
90 cutover         smoke-test (login, query, edge fn), print disable-cloud checklist
```

Each phase is idempotent and resumable. Failures stop the pipeline; rerun with
`--from=<phase>` to skip ahead.

## Targets

| Flag                 | Effect                                                                |
|----------------------|-----------------------------------------------------------------------|
| `--target=cloud`     | Provisions a new Supabase project via Management API, restores there. |
| `--target=self-hosted` | `docker compose up -d` against `templates/docker-compose.self-hosted.yml`, restores there. |

## Password strategy

Default: **hash-preserving**. The Admin API endpoint `POST /auth/v1/admin/users`
accepts a `password_hash` field that takes the raw bcrypt hash from `auth.users.encrypted_password`.
Users keep their existing passwords — they will not notice anything.

No fallback flow, no "reset your password" email, no temp passwords stored in plain text.

## Read this next

- `docs/RUNBOOK.md` — step-by-step with sanity checks per phase
- `docs/ROLLBACK.md` — abort / partial-restore procedure
- `.env.eject.example` — every variable explained
