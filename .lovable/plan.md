I’ll add a new editable markdown file, likely `docs/AI_MODEL_HEALTH_CHECKS.md`, that you can revisit and update later.

Plan:

1. Create a troubleshooting checklist file
   - Add a step-by-step terminal checklist for:
     - Ollama local status
     - installed local models
     - direct `/api/chat` generation test
     - ngrok/cloudflared public tunnel test
     - final external URL test
     - app/edge-function secret checks
   - Include expected outputs and what each error means.

2. Document your current error clearly
   - `ERR_NGROK_3200` means the ngrok endpoint is offline.
   - This is not a model failure and not an OpenRouter failure.
   - Most likely: the ngrok process stopped, the old random URL expired, or a new ngrok URL was created but the app is still using the old one.

3. Add copy-paste-safe commands
   - Avoid leading `# comments` because zsh produced `unknown sort specifier` from the pasted comment line.
   - Include clean commands like:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

```bash
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'
```

```bash
ngrok http 11434
```

```bash
NGROK_URL="https://YOUR-CURRENT-NGROK-URL.ngrok-free.app"
curl -i "$NGROK_URL/api/tags" \
  -H 'ngrok-skip-browser-warning: true' \
  -A 'curl'
```

4. Add a final decision table
   - `HTTP 200 + JSON` → tunnel works; set/update `OLLAMA_BASE_URL` to that URL.
   - `ERR_NGROK_3200` → tunnel is offline; restart ngrok and use the new URL.
   - HTML instead of JSON → ngrok warning/auth page; add header/user-agent or remove auth.
   - local curl works but public curl fails → tunnel issue.
   - public curl works but app still uses OpenRouter → `OLLAMA_BASE_URL` secret is missing/wrong or function needs redeploy/retry.

5. Optional after the file is added
   - Patch `ai-generate` to update retired OpenRouter model slugs and add better Ollama logging/timeout handling, so generation still works when your laptop/ngrok is offline.