# Wire local Ollama into the AI bot pipeline

Edge functions run in the cloud, so they can't reach `localhost:11434`. To use your local Ollama, you'll expose it through a tunnel (ngrok / Cloudflare Tunnel / Tailscale Funnel) and store that URL as a secret. The function tries Ollama first and falls back to OpenRouter if it's unreachable.

## What you'll do once
1. Start Ollama locally: `ollama serve`
2. Expose it: e.g. `ngrok http 11434` → copy the `https://xxxx.ngrok.app` URL
3. Paste that URL when prompted for the `OLLAMA_BASE_URL` secret

## Changes

### 1. Secrets
- Add `OLLAMA_BASE_URL` (e.g. `https://xxxx.ngrok.app`) — required
- Add `OLLAMA_MODEL_QWEN` (default `qwen2.5:7b`) — optional override
- Add `OLLAMA_MODEL_DEEPSEEK` (default `deepseek-r1:8b`) — optional override

### 2. `supabase/functions/ai-generate/index.ts`
- New `callOllama(model, messages)` helper hitting `${OLLAMA_BASE_URL}/api/chat` with `stream: false`, 60s timeout via `AbortController`.
- New `callModel(provider, ...)` router:
  - `qwen` / `deepseek` → try Ollama first (if `OLLAMA_BASE_URL` set); on network error, timeout, or non-2xx → fallback to OpenRouter free model.
  - `vision` (Llama Vision) → stays on OpenRouter (local Ollama vision not assumed).
- Track which provider actually served the request and stamp it into `ai_generations.error` as `served_by:ollama` / `served_by:openrouter` for observability (non-fatal field reuse) — or add a small note in logs only if you prefer. I'll go with edge-function logs only to avoid schema churn.

### 3. Bot profiles
- Bot display names stay the same; no DB change needed. The same `ai_model` value (`qwen`, `deepseek`) maps to whichever provider answered.

### 4. UI
- No UI changes. The Statistics → AI Generations card keeps the same trigger buttons; users see identical AI comments regardless of which backend served them.

## Technical notes
- Ollama chat payload: `{ model, messages: [{role, content}], stream: false, options: { temperature: 0.4 } }`. Response text at `data.message.content`.
- Fallback order per provider:
  - `qwen` → Ollama(`qwen2.5:7b`) → OpenRouter(`qwen/qwen-2.5-7b-instruct:free`)
  - `deepseek` → Ollama(`deepseek-r1:8b`) → OpenRouter(`deepseek/deepseek-r1:free`)
- Tunnel URL changes when you restart ngrok free tier — update the secret when it does. (Cloudflare Tunnel / Tailscale Funnel give stable URLs.)
- No changes to `AiAnswerRenderer`, the migration, or the answers schema.
