
## Two bugs, two fixes

### Bug 1 — Ollama returns 403 (ngrok interstitial)
Edge logs show: `Ollama failed (Ollama 403: ); falling back to OpenRouter`.
The free ngrok tunnel blocks non-browser requests with an HTML interstitial unless you send a special header. So our `callOllama` never actually reaches your local Ollama.

Fix in `supabase/functions/ai-generate/index.ts` → `callOllama`:
- Add request header `ngrok-skip-browser-warning: true`
- Also send `User-Agent: lovable-edge` (some tunnels gate on UA)
- On non-2xx, log the response body snippet so future tunnel issues are visible

### Bug 2 — OpenRouter 404 on `deepseek/deepseek-chat-v3.1:free`
That slug doesn't exist on OpenRouter — that's why the fallback also fails. The Qwen slug is similarly outdated.

Fix the `BOTS` registry to current free OpenRouter slugs:
- `deepseek` → `deepseek/deepseek-r1:free`
- `qwen`     → `qwen/qwen-2.5-72b-instruct:free` (verify this is still live; if not, use `qwen/qwen3-8b:free`)
- `vision`   → keep `meta-llama/llama-3.2-11b-vision-instruct:free`

These are only used as the **fallback** when Ollama is unreachable, so once Bug 1 is fixed your local models answer and OpenRouter is rarely hit anyway.

### Out of scope
- No DB or UI changes.
- Bot profile rows already exist keyed by model slug; changing the slug means `ensureBot` will create a new bot profile for the new slug on first run. That's fine (old bot rows stay, unused). If you'd rather keep the existing bot row, I can instead look up by `email` and update its `ai_model` — tell me and I'll add that.

### How to verify
1. Make sure `ollama serve` is running and `ngrok http 11434 --host-header="localhost:11434"` is up
2. `OLLAMA_BASE_URL` secret = the current `https://xxxx.ngrok-free.app`
3. Trigger a correction from Statistics → AI Generations
4. Check edge logs for `served_by=ollama bot=deepseek model=deepseek-r1:8b` — that confirms local is being used
