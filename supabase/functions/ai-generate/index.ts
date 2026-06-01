import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// --- Bot registry ---
type Kind = 'correction' | 'summary' | 'step_by_step' | 'infographic'

// Default fallback model per kind when no explicit models[] is provided in the request.
const DEFAULT_MODEL_FOR_KIND: Record<Kind, string> = {
  correction: 'google/gemini-3-flash-preview',
  summary: 'google/gemini-3-flash-preview',
  step_by_step: 'google/gemini-3-flash-preview',
  infographic: 'google/gemini-2.5-flash-image',
}

function isImageModel(model: string): boolean {
  return /image/i.test(model)
}

function modelSupportsKind(model: string, kind: Kind): boolean {
  if (kind === 'infographic') return isImageModel(model)
  return !isImageModel(model)
}

function sanitizeEmail(model: string): string {
  return model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

function botLabelForModel(model: string): string {
  // Friendly display name for the bot profile
  if (model.startsWith('ollama:')) return `Ollama · ${model.slice('ollama:'.length)}`
  return model
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
  // French — self-introduction / non-substantive
  /je\s+suis\s+un?\s+(expert|assistant|tuteur|professeur)/i,
  /mon\s+(r[ôo]le|objectif)\s+est/i,
  /n['’]?h[ée]sitez\s+pas\s+(à|a)\s+(me\s+)?(poser|partager|demander|le\s+partager)/i,
  /posez\s+(votre|une)\s+question/i,
  /n['’]?attendez\s+pas,?\s+posez/i,
  // English
  /i['’]?m\s+sorry/i,
  /i\s+can(?:not|['’]t)\b/i,
  /exceeds?\s+the\s+(maximum|token)/i,
  /token\s+limit/i,
  /maximum\s+(context|token)/i,
  /i\s+am\s+an?\s+(expert|assistant|tutor|teacher)/i,
  /feel\s+free\s+to\s+ask/i,
  /how\s+can\s+i\s+help/i,
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

// For corrections, if the source contains multiple "Exercice N" headers but
// the response references none of them, the model went off-task.
function correctionMissesExercises(source: string, content: string): boolean {
  const headers = Array.from(source.matchAll(/\bExercice\s+(\d+)/gi)).map((m) => m[1])
  const unique = Array.from(new Set(headers))
  if (unique.length < 2) return false
  const mentioned = unique.filter((n) =>
    new RegExp(`\\bExercice\\s+${n}\\b`, 'i').test(content),
  )
  return mentioned.length === 0
}

function systemPromptFor(kind: Kind, language: 'fr' | 'ar'): string {
  const langName = language === 'ar' ? 'Arabic' : 'French'
  const base = `You are an expert Tunisian high-school tutor. Respond ENTIRELY in ${langName}. Use clear, student-friendly language. Use Markdown for formatting (headings, lists, **bold**, math with $...$ when relevant).`
  switch (kind) {
    case 'correction':
      return `${base}
You will receive one or more numbered exercises (typically "Exercice 1", "Exercice 2", ... often with sub-questions a/b/c/d). You MUST:
- Process EVERY exercise in the order it appears. Never skip one.
- Keep the original numbering as Markdown headings (## Exercice 1, ## Exercice 2, ...). For each sub-question, write its label (a), b), ...) then the work.
- Briefly restate what is asked, then give the full reasoning with justifications, and the final answer in **bold**.
- Use rigorous math notation ($...$).
Hard rules — violating any of these is a failure:
- Do NOT introduce yourself, do NOT describe your role, do NOT invite further questions, do NOT add closing pleasantries or emojis.
- Do NOT skip exercises. Do NOT answer only the first one.
- Start your reply directly with "## Exercice 1" (or the first numbered header present).`
    case 'summary':
      return `${base}
The material may include worksheets, exercises, or exam questions. DO NOT solve the exercises. Produce a structured study résumé of the **concepts, definitions, theorems, formulas, and methods** that the material covers or requires.
Structure:
- ## Concepts clés — short definitions
- ## Formules / règles — bullet list, each formula in $...$
- ## Méthodes — when/how to apply each
- ## À retenir — 3 to 5 bullets
Hard rules:
- Do NOT solve any exercise, even partially. If an exercise is present, only extract the underlying concept it tests.
- Do NOT introduce yourself, do NOT invite further questions, no emojis.
- Start directly with "## Concepts clés".`
    case 'step_by_step':
      return `${base}
Produce a STEP-BY-STEP explanation of the underlying topic, as if teaching from zero:
- Numbered steps (## Étape 1, ## Étape 2, ...), one idea per step
- Include small worked examples inside the steps
- Finish with "## À retenir" as a 3-bullet recap
Hard rules:
- Do NOT introduce yourself, do NOT invite further questions, no emojis.
- Start directly with "## Étape 1".`
    case 'infographic':
      return `You are an expert designer. Reply with a SINGLE self-contained <svg> tag, viewBox="0 0 600 800", no <script>, no external assets, only inline styles, fonts limited to system-ui/sans-serif. Visualize the material as an INFOGRAPHIC in ${langName}: title, 3-5 key blocks with icons (simple shapes), short labels. Use a clean color palette. Return ONLY the <svg>...</svg> markup, nothing else.`
  }
}

async function ensureBot(admin: ReturnType<typeof createClient>, model: string): Promise<string> {
  const email = `bot+${sanitizeEmail(model)}@ai.local`
  const fullName = botLabelForModel(model)
  // Lookup existing profile
  const { data: existing } = await admin
    .from('profiles')
    .select('user_id')
    .eq('ai_model', model)
    .eq('is_bot', true)
    .maybeSingle()
  if (existing?.user_id) return existing.user_id as string

  // Try to find existing auth user by email
  // @ts-ignore admin api
  const { data: list } = await admin.auth.admin.listUsers()
  const found = (list?.users || []).find((u: any) => u.email === email)
  let userId = found?.id as string | undefined
  if (!userId) {
    // @ts-ignore
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { full_name: fullName, is_bot: true },
    })
    if (error) throw new Error(`Failed to create bot for ${model}: ${error.message}`)
    userId = created.user!.id
  }

  // Upsert profile
  await admin.from('profiles').upsert(
    {
      user_id: userId,
      full_name: fullName,
      ai_model: model,
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
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)
  let resp: Response
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: 4096,
      }),
      signal: ctrl.signal,
    })
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === 'AbortError') throw new Error('OpenRouter timeout after 120s')
    throw new Error(`OpenRouter fetch failed: ${e?.message || e}`)
  }
  clearTimeout(timer)
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

async function callLovableAI(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)
  let resp: Response
  try {
    resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': apiKey,
        'X-Lovable-AIG-SDK': 'edge-function',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      }),
      signal: ctrl.signal,
    })
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === 'AbortError') throw new Error('LovableAI timeout after 120s')
    throw new Error(`LovableAI fetch failed: ${e?.message || e}`)
  }
  clearTimeout(timer)
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`LovableAI ${resp.status}: ${text.slice(0, 400)}`)
  }
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`LovableAI non-JSON: ${text.slice(0, 200)}`)
  }
  const content = json?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error(`LovableAI empty response: ${text.slice(0, 200)}`)
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
  model: string,
  openrouterKey: string,
  system: string,
  user: string,
): Promise<{ content: string; servedBy: 'ollama' | 'openrouter' | 'lovable' }> {
  // Ollama: explicit "ollama:<name>" id
  if (model.startsWith('ollama:')) {
    const ollamaUrl = Deno.env.get('OLLAMA_BASE_URL')
    if (!ollamaUrl) throw new Error('OLLAMA_BASE_URL not configured')
    const ollamaModel = model.slice('ollama:'.length)
    const content = await callOllama(ollamaUrl, ollamaModel, system, user)
    console.log(`[ai-generate] served_by=ollama model=${ollamaModel}`)
    return { content, servedBy: 'ollama' }
  }
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  // Prefer Lovable AI Gateway for google/* and openai/* models when the key is present.
  if (lovableKey && /^(google|openai)\//.test(model)) {
    const content = await callLovableAI(lovableKey, model, system, user)
    console.log(`[ai-generate] served_by=lovable model=${model}`)
    return { content, servedBy: 'lovable' }
  }
  if (!openrouterKey) throw new Error(`No provider available for model "${model}" (set OPENROUTER_API_KEY)`)
  const content = await callOpenRouter(openrouterKey, model, system, user)
  console.log(`[ai-generate] served_by=openrouter model=${model}`)
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
  model: string,
): Promise<{ status: 'completed' | 'failed'; error?: string; answerId?: number }> {
  if (!modelSupportsKind(model, kind)) {
    return { status: 'failed', error: `Model "${model}" does not support kind "${kind}"` }
  }
  // upsert generation row to running
  const botUserId = await ensureBot(admin, model)

  const { data: existingGen } = await admin
    .from('ai_generations')
    .select('id, output_answer_id, status, updated_at')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('kind', kind)
    .eq('model', model)
    .maybeSingle()

  // Reset stale 'running' rows (older than 3 minutes) so they don't block reruns
  if (
    existingGen?.status === 'running' &&
    existingGen.updated_at &&
    Date.now() - new Date(existingGen.updated_at as any).getTime() < 3 * 60_000
  ) {
    return {
      status: 'running',
      error: 'Another generation for this target/kind/model is already in progress',
    }
  }

  const genUpsert = await admin
    .from('ai_generations')
    .upsert(
      {
        id: existingGen?.id,
        target_type: targetType,
        target_id: targetId,
        kind,
        model,
        bot_user_id: botUserId,
        status: 'running',
        error: null,
      },
      { onConflict: 'target_type,target_id,kind,model' } as any,
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

    const { content } = await callModel(model, openrouterKey, system, userPrompt)

    let payload: any
    if (kind === 'infographic') {
      const svgMatch = content.match(/<svg[\s\S]*<\/svg>/i)
      if (!svgMatch) {
        throw new Error('Model did not return an SVG (likely refusal or token limit)')
      }
      payload = { ai_kind: kind, language, svg: svgMatch[0], model }
    } else {
      if (looksLikeRefusal(content)) {
        throw new Error('Model refused or returned non-answer (likely token/context limit)')
      }
      if (kind === 'correction' && correctionMissesExercises(text, content)) {
        throw new Error('Correction response did not cover the numbered exercises in the source')
      }
      payload = { ai_kind: kind, language, content, model }
    }

    const dataString = JSON.stringify(payload)

    // When a previous bot answer already exists for this target/kind/model,
    // do NOT overwrite it. Stash the new output as a proposal so an admin
    // can compare before/after and approve or discard via the Statistics UI.
    if (existingGen?.output_answer_id) {
      await admin
        .from('ai_generations')
        .update({
          status: 'completed',
          error: null,
          proposed_data: dataString,
          proposed_at: new Date().toISOString(),
          review_status: 'pending',
        })
        .eq('id', genId)
      return { status: 'completed', answerId: existingGen.output_answer_id }
    }

    // No prior answer — first-time generation: insert directly.
    let answerId: number
    {
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
      .update({
        status: 'completed',
        output_answer_id: answerId,
        error: null,
        proposed_data: null,
        proposed_at: null,
        review_status: null,
      })
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
    // Either OPENROUTER_API_KEY or LOVABLE_API_KEY must be present; callModel
    // routes per-model and will throw a clear error if the needed one is missing.
    const OPENROUTER = Deno.env.get('OPENROUTER_API_KEY') || ''
    if (!OPENROUTER && !Deno.env.get('LOVABLE_API_KEY')) {
      return new Response(JSON.stringify({ error: 'Missing OPENROUTER_API_KEY or LOVABLE_API_KEY' }), {
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

    // ----- Branch: AI description for a resource -----
    if (body?.action === 'describe_resource') {
      const resourceId = Number(body.resource_id)
      if (!Number.isFinite(resourceId)) {
        return new Response(JSON.stringify({ error: 'resource_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const model: string = typeof body.model === 'string' && body.model.length > 0
        ? body.model
        : 'google/gemini-2.5-flash'

      const { data: res, error: resErr } = await admin
        .from('resources')
        .select('id, title, description, ocr_text, book, teacher_name, school_name')
        .eq('id', resourceId)
        .maybeSingle()
      if (resErr || !res) {
        return new Response(JSON.stringify({ error: `Resource ${resourceId} not found` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const sourceText = (res as any).ocr_text || ''
      if (!sourceText || sourceText.trim().length < 20) {
        return new Response(JSON.stringify({ error: 'Resource has no OCR text — run OCR first' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const language = detectLanguage(sourceText)
      const langName = language === 'ar' ? 'Arabic' : 'French'
      const system = `You are an expert Tunisian high-school content cataloger. Write a 2-3 sentence ${langName} study description of the resource for students browsing a catalog. Mention the topic/chapter and what students will find inside. NO greeting, NO self-introduction, NO emoji, NO Markdown — plain prose only.`
      const meta = [
        `Titre: ${(res as any).title || ''}`,
        (res as any).book ? `Manuel: ${(res as any).book}` : '',
        (res as any).teacher_name ? `Enseignant: ${(res as any).teacher_name}` : '',
        (res as any).school_name ? `Établissement: ${(res as any).school_name}` : '',
        (res as any).description ? `Description actuelle: ${(res as any).description}` : '',
      ].filter(Boolean).join('\n')
      const userPrompt = `${meta}\n\n---\n\nContenu OCR (extrait):\n${sourceText.slice(0, 8000)}`

      let generated: string
      try {
        const { content } = await callModel(model, OPENROUTER, system, userPrompt)
        generated = (content || '').trim().replace(/^["“”]+|["“”]+$/g, '')
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e?.message || 'AI call failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!generated || generated.length < 10 || looksLikeRefusal(generated)) {
        return new Response(JSON.stringify({ error: 'Model returned an unusable response' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const now = new Date().toISOString()
      const existing = ((res as any).description || '').trim()
      const isRealDescription = existing.length >= 20

      if (isRealDescription) {
        // Hold as a proposal for admin review
        await admin
          .from('resources')
          .update({
            description_proposed: generated,
            description_proposed_at: now,
            description_proposed_status: 'pending',
            description_proposed_model: model,
          })
          .eq('id', resourceId)
        return new Response(
          JSON.stringify({
            proposed: true,
            description: existing,
            description_proposed: generated,
            description_proposed_at: now,
            description_proposed_status: 'pending',
            description_proposed_model: model,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // No real prior description — write directly
      await admin
        .from('resources')
        .update({
          description: generated,
          description_proposed: null,
          description_proposed_at: null,
          description_proposed_status: null,
          description_proposed_model: null,
        })
        .eq('id', resourceId)
      return new Response(
        JSON.stringify({
          proposed: false,
          description: generated,
          description_proposed: null,
          description_proposed_at: null,
          description_proposed_status: null,
          description_proposed_model: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const targets: Array<{ target_type: 'resource' | 'question'; target_id: number }> = body.targets || []
    const kinds: Kind[] = body.kinds || []
    const requestedModels: string[] = Array.isArray(body.models) ? body.models.filter((m: any) => typeof m === 'string' && m.length > 0) : []
    if (!Array.isArray(targets) || targets.length === 0 || !Array.isArray(kinds) || kinds.length === 0) {
      return new Response(JSON.stringify({ error: 'targets and kinds required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: any[] = []
    for (const t of targets) {
      for (const k of kinds) {
        // Per kind, pick the models to run. If caller didn't specify, fall back to default.
        const modelsForKind = requestedModels.length > 0
          ? requestedModels.filter((m) => (k === 'infographic' ? /image/i.test(m) : !/image/i.test(m)))
          : [DEFAULT_MODEL_FOR_KIND[k]]
        // If user picked models but none matched this kind, log a single failure entry.
        if (modelsForKind.length === 0) {
          results.push({ ...t, kind: k, status: 'failed', error: `No selected model supports kind "${k}"` })
          continue
        }
        for (const m of modelsForKind) {
          const r = await runGeneration(admin, OPENROUTER, t.target_type, t.target_id, k, m)
          results.push({ ...t, kind: k, model: m, ...r })
        }
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