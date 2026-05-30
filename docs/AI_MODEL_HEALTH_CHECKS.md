# AI Model Health Checks (Ollama + ngrok + OpenRouter)

Editable runbook. Update freely as the setup changes.

Last verified: 2026-05-30

---

## Timeouts & expected durations

- The `ai-generate` edge function waits up to **10 minutes** for an Ollama
  reply (`callOllama` AbortController). The Supabase platform may cap things
  sooner (~150s for purely synchronous calls), so 10 min is the practical
  ceiling — not a hard guarantee.
- The Statistics → AI Generations table shows live `elapsed / ~ETA`
  while a row is running. ETA = median of the last ~10 completed runs of
  the same `kind` on the same target type (resource/question). The first
  run of a kind has no ETA — only elapsed time is shown.
- Typical observed durations (fill in once measured):
  - correction (deepseek-r1:8b): _TBD_
  - summary / step_by_step (qwen2.5:7b): _TBD_
  - infographic (vision via OpenRouter): _TBD_

---

## TL;DR for the current error

`ERR_NGROK_3200 — The endpoint <id>.ngrok-free.app/.dev is offline.`

This is **not** an Ollama, model, or OpenRouter problem. The ngrok tunnel
process is not running, OR the URL you are testing is an old URL from a
previous ngrok session (free ngrok URLs change every restart unless you
use a reserved domain).

Fix order:
1. Make sure `ollama serve` is running (see step 1 below).
2. Start ngrok again and copy the **new** `https://...ngrok-free.app` or `https://...ngrok-free.dev` URL.
3. Re-run the public curl test with that new URL.
4. Update the `OLLAMA_BASE_URL` secret in the backend to the new URL.

---

## Copy-paste rules

- Do NOT paste lines that start with `#` into zsh — zsh tries to parse them
  and you get errors like `zsh: unknown sort specifier`. Either strip the
  comment lines, or run `setopt interactivecomments` once per shell.
- Always use `127.0.0.1` for local tests (not `localhost`) to avoid IPv6
  weirdness on macOS.

---

## Step 1 — Is Ollama running locally?

Stop the Ollama menu-bar app first (it binds 127.0.0.1 only), then in a
terminal:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Leave that terminal open. In a NEW terminal:

```bash
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'
```

Expected: a list of model names. If empty → run `ollama pull qwen2.5:7b`
and `ollama pull deepseek-r1:8b`.

If `curl` hangs or refuses connection → Ollama is not serving on
`0.0.0.0`. Kill the menu-bar app, re-run `OLLAMA_HOST=0.0.0.0:11434 ollama serve`.

---

## Step 2 — Does local generation actually work?

```bash
curl -s http://127.0.0.1:11434/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:7b","stream":false,"messages":[{"role":"user","content":"Say hi in one word."}]}'
```

Expected: JSON with `message.content`. Time it; if it takes >60s, the
edge function will time out — use a smaller model or raise
`OLLAMA_TIMEOUT_MS`.

---

## Step 3 — Is the public tunnel up?

In a NEW terminal:

```bash
ngrok http 11434
```

Copy the full `https://...ngrok-free.app` or `https://...ngrok-free.dev` URL shown. **This URL changes every
restart** on the free plan.

Important: copy the domain exactly. If ngrok shows `.ngrok-free.dev`, do **not** test the old `.ngrok-free.app` URL.

Set it once in your shell so you stop pasting the wrong one:

```bash
export NGROK_URL="https://YOUR-CURRENT-URL.ngrok-free.dev"
```

Then test:

```bash
curl -i "$NGROK_URL/api/tags" \
  -H 'ngrok-skip-browser-warning: true' \
  -A 'curl'
```

Decision table:

| Response | Meaning | Action |
|---|---|---|
| `HTTP 200` + JSON `{"models":[...]}` | Tunnel works end-to-end | Go to step 4 |
| `HTTP 404` + `ERR_NGROK_3200` | Tunnel offline / wrong URL | Restart `ngrok http 11434`, copy NEW URL |
| `HTTP 502` | Tunnel up but Ollama unreachable | Re-check step 1 |
| HTML "You are about to visit..." | ngrok browser warning | Add `-A 'curl'` and `ngrok-skip-browser-warning: true` |
| `HTTP 401` | Tunnel has basic auth | Restart ngrok without `--basic-auth` |
| `HTTP 403` | Free-plan header missing | Confirm exact header `ngrok-skip-browser-warning: true` |

---

## Step 4 — Does the backend actually use Ollama?

The `ai-generate` edge function only routes to Ollama if `OLLAMA_BASE_URL`
is set. Update the secret to the URL from step 3 (no trailing slash):

```
OLLAMA_BASE_URL = https://YOUR-CURRENT-URL.ngrok-free.dev
```

Optional secrets:
- `OLLAMA_MODEL_QWEN` (default `qwen2.5:7b`)
- `OLLAMA_MODEL_DEEPSEEK` (default `deepseek-r1:8b`)
- `OLLAMA_TIMEOUT_MS` (planned — default 60000)

Trigger one AI generation from the app, then check the edge function logs
for one of:
- `served_by=ollama` → working as intended
- `Ollama failed (...); falling back to OpenRouter` → tunnel or model
  problem; go back to step 3
- `OpenRouter 404: No endpoints found for ...` → OpenRouter model slug is
  retired; update it in `supabase/functions/ai-generate/index.ts`
  (current free slugs as of 2026-05: `deepseek/deepseek-r1-0528:free`,
  `qwen/qwen3-8b:free`)

---

## Common gotchas

- **`zsh: unknown sort specifier`** — you pasted a `#` comment line. Strip
  it or run `setopt interactivecomments`.
- **`jq: parse error: Invalid numeric literal`** — the response was HTML,
  not JSON. Re-run with `curl -i` (no jq) and read the real status code.
- **Old ngrok URL still in the secret** — free ngrok URLs rotate. Either
  update `OLLAMA_BASE_URL` after every restart, or pay for a reserved
  domain, or switch to `cloudflared tunnel --url http://localhost:11434`
  which gives a stable-ish URL per session too.
- **`.app` vs `.dev` mismatch** — newer ngrok sessions may show
  `.ngrok-free.dev`. Use the exact domain shown in the `Forwarding` line.
- **Laptop sleeps** → tunnel dies → fallback to OpenRouter. Expected.
- **OpenRouter 404 on `deepseek/deepseek-r1:free`** — model retired; use
  `deepseek/deepseek-r1-0528:free`.

---

## Future checks to add here

Add new sections as the stack evolves. Suggested slots:

- [ ] Cloudflared tunnel variant of step 3
- [ ] Health check edge function that pings `/api/tags` and writes to
      `app_events` so the monitoring panel shows tunnel status
- [ ] Per-model latency budget table
- [ ] LM Studio alternative (port 1234, OpenAI-compatible API)
- [ ] Lovable AI Gateway fallback wiring (no API key required)