import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BAC_CLASS_IDS = [15, 16, 17, 18, 19, 20, 21];

interface SubjectRow {
  id: number;
  name: string;
  class_id: number;
  class_name: string;
}

interface ChapterRow {
  id: number;
  name: string;
  subject_id: number;
  class_id: number;
  class_name: string;
}

async function callAI(messages: any[], tool: any) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("AI rate limit exceeded");
    if (resp.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI returned no tool call");
  return JSON.parse(call.function.arguments);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    // Verify caller is admin/moderator
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await admin.rpc("is_moderator_or_admin", {
      _user_id: userData.user.id,
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startedAt = Date.now();

    // Load Bac subjects + class names
    const { data: subjectsRaw, error: sErr } = await admin
      .from("subjects")
      .select("id, name, class_id, classes!inner(id, name)")
      .in("class_id", BAC_CLASS_IDS)
      .eq("deleted", false);
    if (sErr) throw sErr;

    const subjects: SubjectRow[] = (subjectsRaw || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      class_id: s.class_id,
      class_name: s.classes?.name ?? "",
    }));

    if (subjects.length === 0) {
      return new Response(
        JSON.stringify({ groups: 0, pairs: 0, durationMs: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pass A: cluster subjects by name equivalence
    const subjectGroups: number[][] = (await callAI(
      [
        {
          role: "system",
          content:
            "You group academic subjects across different Tunisian Bac (high-school) classes when they cover the same field. Treat case, accents, plurals and minor naming variants as equivalent (e.g. Maths = Mathématiques = Mathématique; Physique = Physiques; SVT = Science de la vie et de la terre). Group only subjects that genuinely teach the same field.",
        },
        {
          role: "user",
          content:
            "Cluster these Bac subjects. Each cluster MUST contain subjects from at least 2 different classes. Skip subjects with no equivalent in another class.\n\n" +
            JSON.stringify(
              subjects.map((s) => ({ id: s.id, name: s.name, class: s.class_name })),
            ),
        },
      ],
      {
        type: "function",
        function: {
          name: "return_subject_groups",
          description: "Return groups of equivalent subject ids.",
          parameters: {
            type: "object",
            properties: {
              groups: {
                type: "array",
                items: { type: "array", items: { type: "integer" } },
              },
            },
            required: ["groups"],
          },
        },
      },
    )).groups || [];

    // Load chapters for any subject mentioned in groups
    const groupedSubjectIds = Array.from(new Set(subjectGroups.flat()));
    if (groupedSubjectIds.length === 0) {
      // Wipe table if nothing matches
      await admin.from("chapter_common_mappings").delete().gt("id", 0);
      return new Response(
        JSON.stringify({ groups: 0, pairs: 0, durationMs: Date.now() - startedAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: chaptersRaw, error: cErr } = await admin
      .from("chapters")
      .select("id, name, subject_id, class_id, classes!inner(name)")
      .in("subject_id", groupedSubjectIds)
      .eq("deleted", false);
    if (cErr) throw cErr;

    const chaptersBySubject = new Map<number, ChapterRow[]>();
    for (const ch of chaptersRaw || []) {
      const row: ChapterRow = {
        id: ch.id,
        name: ch.name,
        subject_id: ch.subject_id,
        class_id: ch.class_id,
        class_name: (ch as any).classes?.name ?? "",
      };
      if (!chaptersBySubject.has(row.subject_id)) chaptersBySubject.set(row.subject_id, []);
      chaptersBySubject.get(row.subject_id)!.push(row);
    }

    // Pass B: per group, ask for equivalent chapter pairs
    const allPairs: Array<[number, number]> = [];

    for (const group of subjectGroups) {
      // Build payload: chapters per class, only if at least 2 classes have chapters
      const groupChapters: ChapterRow[] = [];
      for (const sid of group) {
        const list = chaptersBySubject.get(sid) || [];
        groupChapters.push(...list);
      }
      const distinctClasses = new Set(groupChapters.map((c) => c.class_id));
      if (distinctClasses.size < 2 || groupChapters.length < 2) continue;

      const payload = groupChapters.map((c) => ({
        id: c.id,
        name: c.name,
        class: c.class_name,
      }));

      const result = await callAI(
        [
          {
            role: "system",
            content:
              "You match equivalent chapters across Tunisian Bac classes for the same subject. Two chapters are equivalent when they cover the same core topic, even if names differ in wording, language, capitalization, accents, abbreviations, or include extra context (e.g. 'LE DIPOLE RC' = 'Dipole RC' = 'Le condensateur dipole RC'). Do NOT match chapters from the same class. Only return high-confidence matches.",
          },
          {
            role: "user",
            content:
              "Return all equivalent chapter pairs across different classes from this list:\n\n" +
              JSON.stringify(payload),
          },
        ],
        {
          type: "function",
          function: {
            name: "return_chapter_pairs",
            description: "Return equivalent chapter id pairs across different classes.",
            parameters: {
              type: "object",
              properties: {
                pairs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      a: { type: "integer" },
                      b: { type: "integer" },
                    },
                    required: ["a", "b"],
                  },
                },
              },
              required: ["pairs"],
            },
          },
        },
      );

      const chapterById = new Map(groupChapters.map((c) => [c.id, c]));
      for (const p of result.pairs || []) {
        const a = chapterById.get(p.a);
        const b = chapterById.get(p.b);
        if (!a || !b) continue;
        if (a.class_id === b.class_id) continue;
        if (a.id === b.id) continue;
        allPairs.push([a.id, b.id]);
      }
    }

    // Wipe and re-insert symmetric mappings
    await admin.from("chapter_common_mappings").delete().gt("id", 0);

    if (allPairs.length > 0) {
      const rows: Array<{ chapter_id: number; common_chapter_id: number }> = [];
      const seen = new Set<string>();
      for (const [a, b] of allPairs) {
        const k1 = `${a}-${b}`;
        const k2 = `${b}-${a}`;
        if (!seen.has(k1)) {
          seen.add(k1);
          rows.push({ chapter_id: a, common_chapter_id: b });
        }
        if (!seen.has(k2)) {
          seen.add(k2);
          rows.push({ chapter_id: b, common_chapter_id: a });
        }
      }

      // Batch insert (500 per chunk)
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await admin
          .from("chapter_common_mappings")
          .insert(chunk);
        if (error) throw error;
      }
    }

    return new Response(
      JSON.stringify({
        groups: subjectGroups.length,
        pairs: allPairs.length,
        durationMs: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("match-common-chapters error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});