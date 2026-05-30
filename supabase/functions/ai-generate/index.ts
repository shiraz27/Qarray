import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// --- Bot registry ---
type Kind = 'correction' | 'summary' | 'step_by_step' | 'infographic'

const BOTS: Record<string, { email: string; model: string; full_name: string }> = {
  qwen: {
    email: 'qwen-bot@ai.local',
    model: 'qwen/qwen3-8b:free',
    full_name: 'Qwen Tutor',
  },
  deepseek: {
    email: 'deepseek-bot@ai.local',
    model: 'deepseek/deepseek-r1-0528:free',
    full_name: 'DeepSeek Tutor',
  },
  vision: {
    email: 'vision-bot@ai.local',
    model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    full_name: 'Vision Tutor',
  },
}

// Local Ollama mapping (per provider). Falls back to OpenRouter model above if Ollama is unreachable.
const OLLAMA_MODELS: Record<string, string | undefined> = {
  qwen: Deno.env.get('OLLAMA_MODEL_QWEN') || 'qwen2.5:7b',
  deepseek: Deno.env.get('OLLAMA_MODEL_DEEPSEEK') || 'deepseek-r1:8b',
  // vision: not assumed available locally — stays on OpenRouter
}

const KIND_TO_BOT: Record<Kind, keyof typeof BOTS> = {
  correction: 'deepseek',
  summary: 'qwen',
  step_by_step: 'qwen',
  infographic: 'vision',
}

const KIND_LABEL_FR: Record<Kind, string> = {
  correction: 'Correction',
  summary: 'Résumé',
  step_by_step: 'Explication étape par étape',
  infographic: 'Infographie',
}
const KIND_LABEL_AR: Record<Kind, string> = {
  correction: 'التصحيح',
  summary: 'الملخص',
  step_by_step: 'شرح خطوة بخطوة',
  infographic: 'إنفوغرافيك',
}

function detectLanguage(text: string): 'fr' | 'ar' {
  if (!text) return 'fr'
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length
  const latin = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length
  return arabic > latin ? 'ar' : 'fr'
}

// Patterns that indicate the model refused, errored, or hit a token/context
// limit instead of actually producing an answer. Matched case-insensitively
// against the trimmed content.
const REFUSAL_PATTERNS: RegExp[] = [
  // French
  /je\s+suis\s+d[ée]sol[ée]/i,
  /je\s+ne\s+peux\s+pas/i,
  /d[ée]passe\s+la\s+capacit[ée]/i,
  /limite\s+(de|des)\s+tokens?/i,
  /maximum\s+(de|des)\s+tokens?/i,
  /capacit[ée]\s+maximale/i,
  // English
  /i['’]?m\s+sorry/i,
  /i\s+can(?:not|['’]t)\b/i,
  /exceeds?\s+the\s+(maximum|token)/i,
  /token\s+limit/i,
  /maximum\s+(context|token)/i,
  // Arabic
  /أعتذر/,
  /لا\s*أستطيع/,
  /تجاوز\s+الحد/,
]

function looksLikeRefusal(content: string): boolean {
  const trimmed = (content || '').trim()
  if (trimmed.length < 80) return true
  return REFUSAL_PATTERNS.some((re) => re.test(trimmed))
}

function systemPromptFor(kind: Kind, language: 'fr' | 'ar'): string {
  const langName = language === 'ar' ? 'Arabic' : 'French'
  const base = `You are an expert Tunisian high-school tutor. Respond ENTIRELY in ${langName}. Use clear, student-friendly language. Use Markdown for formatting (headings, lists, **bold**, math with $...$ when relevant).`
  switch (kind) {
    case 'correction':
      return `${base}
The student gave you an exercise (possibly with their attempt). Produce a FULL, rigorous correction:
- State what is asked
- Solve step by step with justifications
- Give the final answer clearly
- Point out common mistakes`
    case 'summary':
      return `${base}
Produce a concise, well-structured RESUME of the material:
- Key concepts and definitions
- Main formulas / rules
- A short bullet recap at the end`
    case 'step_by_step':
      return `${base}
Produce a STEP-BY-STEP explanation of the material, as if teaching from zero:
- Numbered steps, one idea per step
- Include small worked examples
- Finish with a 3-bullet "what to remember"`
    case 'infographic':
      return `You are an expert designer. Reply with a SINGLE self-contained <svg> tag, viewBox="0 0 600 800", no <script>, no external assets, only inline styles, fonts limited to system-ui/sans-serif. Visualize the material as an INFOGRAPHIC in ${langName}: title, 3-5 key blocks with icons (simple shapes), short labels. Use a clean color palette. Return ONLY the <svg>...</svg> markup, nothing else.`
  }
}

async function ensureBot(admin: ReturnType<typeof createClient>, key: keyof typeof BOTS): Promise<string> {
  const bot = BOTS[key]
  // Lookup existing profile
  const { data: existing } = await admin
    .from('profiles')
    .select('user_id')
    .eq('ai_model', bot.model)
    .eq('is_bot', true)
    .maybeSingle()
  if (existing?.user_id) return existing.user_id as string

  // Try to find existing auth user by email
  // @ts-ignore admin api
  const { data: list } = await admin.auth.admin.listUsers()
  const found = (list?.users || []).find((u: any) => u.email === bot.email)
  let userId = found?.id as string | undefined
  if (!userId) {
    // @ts-ignore
    const { data: created, error } = await admin.auth.admin.createUser({
      email: bot.email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { full_name: bot.full_name, is_bot: true },
    })
    if (error) throw new Error(`Failed to create bot ${key}: ${error.message}`)
    userId = created.user!.id
  }

  // Upsert profile
  await admin.from('profiles').upsert(
    {
      user_id: userId,
      full_name: bot.full_name,
      ai_model: bot.model,
      is_bot: true,
      user_type: 'ai_bot' as any,
      verified: true,
    },
    { onConflict: 'user_id' } as any,
  )
  return userId
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://lovable.dev',
      'X-Title': 'Lovable AI Tutor',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
    }),
  })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 400)}`)
  }
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`OpenRouter non-JSON: ${text.slice(0, 200)}`)
  }
  const content = json?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error(`OpenRouter empty response: ${text.slice(0, 200)}`)
  }
  return content.trim()
}

async function callOllama(
  baseUrl: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/api/chat'
  const ctrl = new AbortController()
  // Upstream timeout: 10 minutes. Local Ollama on a laptop can be slow for
  // long prompts / large models (e.g. gpt-oss:20b). The Supabase Edge Function
  // platform itself also caps wall-clock time (~150s sync), so this is the
  // practical ceiling — not the 60s of the old bug.
  const timer = setTimeout(() => ctrl.abort(), 600_000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'lovable-edge',
      },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.4 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: ctrl.signal,
    })
    const text = await resp.text()
    if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${text.slice(0, 400)}`)
    const json = JSON.parse(text)
    const content = json?.message?.content
    if (!content || typeof content !== 'string') {
      throw new Error(`Ollama empty response: ${text.slice(0, 200)}`)
    }
    return content.trim()
  } finally {
    clearTimeout(timer)
  }
}

async function callModel(
  botKey: keyof typeof BOTS,
  openrouterKey: string,
  system: string,
  user: string,
): Promise<{ content: string; servedBy: 'ollama' | 'openrouter' }> {
  const ollamaUrl = Deno.env.get('OLLAMA_BASE_URL')
  const ollamaModel = OLLAMA_MODELS[botKey as string]
  if (ollamaUrl && ollamaModel) {
    try {
      const content = await callOllama(ollamaUrl, ollamaModel, system, user)
      console.log(`[ai-generate] served_by=ollama bot=${botKey} model=${ollamaModel}`)
      return { content, servedBy: 'ollama' }
    } catch (e: any) {
      console.warn(`[ai-generate] Ollama failed (${e?.message || e}); falling back to OpenRouter`)
    }
  }
  const content = await callOpenRouter(openrouterKey, BOTS[botKey].model, system, user)
  console.log(`[ai-generate] served_by=openrouter bot=${botKey} model=${BOTS[botKey].model}`)
  return { content, servedBy: 'openrouter' }
}

async function loadTarget(
  admin: ReturnType<typeof createClient>,
  targetType: 'resource' | 'question',
  targetId: number,
): Promise<{ text: string; title: string }> {
  if (targetType === 'question') {
    const { data, error } = await admin
      .from('questions')
      .select('id, data, ocr_text, book')
      .eq('id', targetId)
      .maybeSingle()
    if (error || !data) throw new Error(`Question ${targetId} not found`)
    const text = [data.ocr_text, data.data].filter(Boolean).join('\n\n')
    return { text: text || data.data || '', title: data.book || `Question #${targetId}` }
  }
  const { data, error } = await admin
    .from('resources')
    .select('id, title, description, ocr_text, book')
    .eq('id', targetId)
    .maybeSingle()
  if (error || !data) throw new Error(`Resource ${targetId} not found`)
  const text = [data.title, data.description, data.ocr_text].filter(Boolean).join('\n\n')
  return { text, title: data.title || `Resource #${targetId}` }
}

async function runGeneration(
  admin: ReturnType<typeof createClient>,
  openrouterKey: string,
  targetType: 'resource' | 'question',
  targetId: number,
  kind: Kind,
): Promise<{ status: 'completed' | 'failed'; error?: string; answerId?: number }> {
  // upsert generation row to running
  const botKey = KIND_TO_BOT[kind]
  const botUserId = await ensureBot(admin, botKey)

  const { data: existingGen } = await admin
    .from('ai_generations')
    .select('id, output_answer_id')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('kind', kind)
    .maybeSingle()

  const genUpsert = await admin
    .from('ai_generations')
    .upsert(
      {
        id: existingGen?.id,
        target_type: targetType,
        target_id: targetId,
        kind,
        bot_user_id: botUserId,
        status: 'running',
        error: null,
      },
      { onConflict: 'target_type,target_id,kind' } as any,
    )
    .select('id')
    .single()

  const genId = (genUpsert.data as any)?.id

  try {
    const { text, title } = await loadTarget(admin, targetType, targetId)
    if (!text || text.trim().length < 5) {
      throw new Error('Target has no text content (run OCR first)')
    }

    const language = detectLanguage(text)
    const system = systemPromptFor(kind, language)
    const userPrompt = `TITRE: ${title}\n\n---\n\n${text.slice(0, 12000)}`

    const { content } = await callModel(botKey, openrouterKey, system, userPrompt)

    let payload: any
    if (kind === 'infographic') {
      const svgMatch = content.match(/<svg[\s\S]*<\/svg>/i)
      if (!svgMatch) {
        throw new Error('Model did not return an SVG (likely refusal or token limit)')
      }
      payload = { ai_kind: kind, language, svg: svgMatch[0], model: BOTS[botKey].model }
    } else {
      if (looksLikeRefusal(content)) {
        throw new Error('Model refused or returned non-answer (likely token/context limit)')
      }
      payload = { ai_kind: kind, language, content, model: BOTS[botKey].model }
    }

    const dataString = JSON.stringify(payload)

    // Upsert answer row
    let answerId: number
    if (existingGen?.output_answer_id) {
      const { data: upd, error: updErr } = await admin
        .from('answers')
        .update({
          data: dataString,
          contributors: [botUserId],
          deleted: false,
        })
        .eq('id', existingGen.output_answer_id)
        .select('id')
        .single()
      if (updErr) throw new Error(`Update answer: ${updErr.message}`)
      answerId = (upd as any).id
    } else {
      const insertRow: any = {
        data: dataString,
        contributors: [botUserId],
        verified: false,
      }
      if (targetType === 'question') insertRow.question_id = targetId
      else insertRow.resource_id = targetId
      const { data: ins, error: insErr } = await admin
        .from('answers')
        .insert(insertRow)
        .select('id')
        .single()
      if (insErr) throw new Error(`Insert answer: ${insErr.message}`)
      answerId = (ins as any).id
    }

    await admin
      .from('ai_generations')
      .update({ status: 'completed', output_answer_id: answerId, error: null })
      .eq('id', genId)

    return { status: 'completed', answerId }
  } catch (e: any) {
    const msg = e?.message || String(e)
    await admin
      .from('ai_generations')
      .update({ status: 'failed', error: msg })
      .eq('id', genId)
    return { status: 'failed', error: msg }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const OPENROUTER = Deno.env.get('OPENROUTER_API_KEY')
    if (!OPENROUTER) {
      return new Response(JSON.stringify({ error: 'Missing OPENROUTER_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token)
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = claimsData.claims.sub

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // verify mod/admin
    const { data: isMod } = await admin.rpc('is_moderator_or_admin', { _user_id: userId })
    if (!isMod) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const targets: Array<{ target_type: 'resource' | 'question'; target_id: number }> = body.targets || []
    const kinds: Kind[] = body.kinds || []
    if (!Array.isArray(targets) || targets.length === 0 || !Array.isArray(kinds) || kinds.length === 0) {
      return new Response(JSON.stringify({ error: 'targets and kinds required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: any[] = []
    for (const t of targets) {
      for (const k of kinds) {
        const r = await runGeneration(admin, OPENROUTER, t.target_type, t.target_id, k)
        results.push({ ...t, kind: k, ...r })
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})