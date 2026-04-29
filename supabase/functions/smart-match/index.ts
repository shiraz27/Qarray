import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Context = "subject" | "chapter" | "school" | "teacher" | "generic";

interface Body {
  query: string;
  candidates: string[];
  context?: Context;
  topK?: number;
}

const normalize = (s: string): string =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(l['’]|d['’]|le |la |les |un |une |des |de |du )/i, "")
    .replace(/['’`]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SYSTEM_BY_CONTEXT: Record<Context, string> = {
  subject:
    "You decide whether two academic subject names refer to the same field. Treat as equivalent: case differences, French/English accents (é è ê à â ô ç ï…), leading articles (l', le, la, les, d'), abbreviations (Maths≡Mathématiques, SVT≡Sciences de la Vie et de la Terre, Info≡Informatique, EPS≡Éducation physique), language variants (Physique≡Sciences Physiques), and minor typos.",
  chapter:
    "You decide whether two chapter / topic titles cover the same lesson. Treat as equivalent: accents, case, leading articles (l', le, la), reorderings, abbreviations, and broader↔narrower titles for the same core topic (e.g. 'Pile' ≡ 'Pile Daniell', 'Dipôle RC' ≡ 'Le condensateur dipôle RC', 'Électrolyse' ≡ 'L'électrolyse'). Do NOT match unrelated topics that merely share a word.",
  school:
    "You decide whether two school / institute names refer to the same place. Treat as equivalent: accents, case, prefixes like 'Lycée', 'École', 'Collège', 'L.S.', honorifics, abbreviations, and minor typos. Different cities or different schools must NOT match.",
  teacher:
    "You decide whether two teacher names refer to the same person. Treat as equivalent: accents, case, honorifics (Mr, M., Mme, Pr, Dr), reorderings (last-first vs first-last), missing middle initials, and minor typos. Different people must NOT match.",
  generic:
    "You decide whether two short labels refer to the same thing. Treat as equivalent: accents, case, leading articles, abbreviations, synonyms and minor typos. Be strict — only confirm equivalence when a fluent French/English reader would consider them the same.",
};

async function classify(
  query: string,
  candidates: string[],
  context: Context,
): Promise<{ index: number; equivalent: boolean }[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const payload = {
    query: { raw: query, normalized: normalize(query) },
    candidates: candidates.map((c, i) => ({
      index: i,
      raw: c,
      normalized: normalize(c),
    })),
  };

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_BY_CONTEXT[context] },
          {
            role: "user",
            content:
              "For each candidate, return equivalent=true only if it refers to the same thing as the query.\n\n" +
              JSON.stringify(payload),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_matches",
              description: "Return semantic equivalence judgement per candidate index.",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "integer" },
                        equivalent: { type: "boolean" },
                      },
                      required: ["index", "equivalent"],
                    },
                  },
                },
                required: ["matches"],
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "return_matches" },
        },
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) {
      const err: any = new Error("AI rate limit exceeded");
      err.status = 429;
      throw err;
    }
    if (resp.status === 402) {
      const err: any = new Error("AI credits exhausted");
      err.status = 402;
      throw err;
    }
    throw new Error(`AI gateway error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return [];
  try {
    const parsed = JSON.parse(call.function.arguments);
    return Array.isArray(parsed?.matches) ? parsed.matches : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    const query = String(body?.query ?? "").trim();
    const candidatesRaw = Array.isArray(body?.candidates) ? body.candidates : [];
    const context: Context = (body?.context as Context) ?? "generic";
    const topK = Math.min(Math.max(body?.topK ?? 30, 1), 30);

    if (!query || candidatesRaw.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap candidates and dedupe normalized form to save tokens
    const candidates = candidatesRaw.slice(0, topK).map(String);

    // Cheap normalization shortcut: if normalized exact match exists, mark it
    // and still ask the model so it can catch synonyms among the rest.
    let matches: { index: number; equivalent: boolean }[] = [];
    try {
      matches = await classify(query, candidates, context);
    } catch (e: any) {
      const status = e?.status === 429 || e?.status === 402 ? e.status : 200;
      // Graceful fallback: empty matches, surface status to client so UI can toast
      return new Response(
        JSON.stringify({
          matches: [],
          error: e?.message || "smart-match unavailable",
          status: status === 200 ? undefined : status,
        }),
        {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Always include normalized-equal matches even if AI missed them
    const normQuery = normalize(query);
    const aiByIndex = new Map(matches.map((m) => [m.index, m.equivalent]));
    const finalMatches = candidates.map((c, i) => {
      const aiSays = aiByIndex.get(i);
      const normEqual = normalize(c) === normQuery && normQuery.length > 0;
      return {
        index: i,
        candidate: c,
        equivalent: aiSays === true || normEqual,
      };
    }).filter((m) => m.equivalent);

    return new Response(JSON.stringify({ matches: finalMatches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("smart-match error:", e);
    return new Response(
      JSON.stringify({
        matches: [],
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        // Always 200 so the UI silently falls back to literal results
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
