import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractMetadataRequest {
  ocrText: string;
  resourceId?: number;
  questionId?: number;
}

interface ExtractedMetadata {
  school_name: string | null;
  teacher_name: string | null;
  suggested_title: string | null;
  suggested_type_id: number | null;
  suggested_devoir_type_id: number | null;
  suggested_description: string | null;
  teacher_names: string[];
  school_names: string[];
  books: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { ocrText, resourceId, questionId }: ExtractMetadataRequest = await req.json();

    if (!ocrText || ocrText.trim().length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_description: null, suggested_type_id: null, suggested_devoir_type_id: null, teacher_names: [], school_names: [], books: [] },
          message: 'No OCR text provided' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracting metadata for ${resourceId ? `resource #${resourceId}` : questionId ? `question #${questionId}` : 'unknown content'}`);
    console.log(`OCR text length: ${ocrText.length} characters`);

    // Prepare the prompt for metadata extraction
    const systemPrompt = `You are an AI assistant specialized in extracting metadata from educational documents in Algeria (Arabic and French).

Your task is to analyze OCR-extracted text from educational documents (exams, homework, lessons) and extract:

1. School/Institute names (one OR MORE) - Look for patterns like:
   - Arabic: ثانوية، متوسطة، ابتدائية، معهد، مدرسة، مركز، ليسي
   - French: Lycée, CEM, École, Institut, Collège, Centre
   - Usually appears in document headers
   - A document can reference multiple institutes; return all distinct ones found.
   
2. Teacher names (one OR MORE) - Look for patterns like:
   - Arabic: الأستاذ، الأستاذة، المعلم، المعلمة، إعداد، تحت إشراف
   - French: Prof., Professeur, Mr., Mme., M., Enseignant, Préparé par
   - May appear in headers or signatures at the bottom
   - A document can list multiple teachers; return all distinct ones found.

3. Document Title - Look for patterns like:
   - Arabic: عنوان، الموضوع، اختبار، امتحان، فرض، الفرض، الاختبار، تمارين، سلسلة، درس
   - French: Titre, Devoir, Examen, Contrôle, Composition, Exercices, Série, Cours
   - Look for the main subject/topic of the document
   - Generate a concise, descriptive title in the document's primary language
   - Include the subject matter and type (e.g., "اختبار الفصل الأول في الرياضيات" or "Devoir de Mathématiques - 1er Trimestre")

3b. Books / textbook references (zero, one, OR MORE):
   - Names of textbooks, manuals, or reference books cited in the document.
   - Examples: "Le manuel scolaire", "كتاب المدرسي", named series, publisher name + level.
   - Return all distinct ones found.

4. Resource Type - Detect the type of document:
   - ID 1 (Devoirs): الفرض، فرض، اختبار، امتحان، devoir, contrôle, examen, composition
   - ID 2 (Cours): درس، دروس، cours, leçon
   - ID 3 (Exercices / Séries): تمارين، سلسلة، تمرين، exercices, série, TD
   - ID 4 (Résumé): ملخص، تلخيص، résumé, synthèse, fiche

5. Devoir Type (if document is a devoir/exam) - Detect the specific exam type:
   - ID 1 (contrôle 1): الفرض الأول، فرض1، الاختبار الأول، contrôle 1, DS1, 1er contrôle, first exam
   - ID 2 (contrôle 2): الفرض الثاني، فرض2، الاختبار الثاني، contrôle 2, DS2, 2ème contrôle, second exam
   - ID 3 (synthèse): امتحان الفصل، اختبار الفصل، التركيبي، composition, examen, synthèse, bac, final

6. Document Description - Generate a meaningful 2-3 sentence summary that:
   - Describes what the document contains (topics, exercises, exam content)
   - Mentions the educational level/class if detected
   - Uses the document's primary language (Arabic or French)
   - Is helpful for students searching for resources
   - Example: "فرض مراقبة في مادة الرياضيات يتضمن تمارين حول الدوال والمتتاليات. مناسب لطلاب السنة الثالثة ثانوي شعبة علوم تجريبية."

Important notes:
- Extract ONLY if you find clear indicators, don't guess
- Names should be returned in their original language (Arabic or French)
- If multiple schools/teachers are mentioned, return the primary one (usually the first one)
- For title: generate a clear, concise title based on document content if no explicit title exists
- For type_id and devoir_type_id: return the numeric ID, not the name
- For description: always generate a helpful summary based on document content
- Return null if not found or uncertain (except description which should always be generated)`;

    // Truncate OCR text if too long (keep first 4000 chars which usually contain headers)
    const truncatedText = ocrText.length > 4000 
      ? ocrText.substring(0, 4000) + "\n...[text truncated]..."
      : ocrText;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please analyze this OCR text and extract the school name, teacher name, suggest an appropriate title, and generate a helpful description:\n\n${truncatedText}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_metadata",
              description: "Extract school/institute name, teacher name, suggest a title, detect document/devoir types, and generate a description from educational document",
              parameters: {
                type: "object",
                properties: {
                  school_name: { 
                    type: "string", 
                    description: "PRIMARY school/institute name (first one). Null if not found. (Use school_names for the full list.)",
                    nullable: true
                  },
                  teacher_name: { 
                    type: "string", 
                    description: "PRIMARY teacher name (first one). Null if not found. (Use teacher_names for the full list.)",
                    nullable: true
                  },
                  teacher_names: {
                    type: "array",
                    items: { type: "string" },
                    description: "All distinct teacher names found in the document. Empty array if none."
                  },
                  school_names: {
                    type: "array",
                    items: { type: "string" },
                    description: "All distinct school/institute names found in the document. Empty array if none."
                  },
                  books: {
                    type: "array",
                    items: { type: "string" },
                    description: "All distinct textbook/reference book names cited. Empty array if none."
                  },
                  suggested_title: {
                    type: "string",
                    description: "Suggested title for the document based on its content. Should be concise and descriptive in the document's primary language.",
                    nullable: true
                  },
                  suggested_type_id: {
                    type: "number",
                    description: "Detected resource type ID: 1=Devoirs, 2=Cours, 3=Exercices/Séries, 4=Résumé. Null if uncertain.",
                    nullable: true
                  },
                  suggested_devoir_type_id: {
                    type: "number",
                    description: "Detected devoir type ID (only if document is a devoir/exam): 1=contrôle 1, 2=contrôle 2, 3=synthèse. Null if not a devoir or uncertain.",
                    nullable: true
                  },
                  suggested_description: {
                    type: "string",
                    description: "A helpful 2-3 sentence summary of the document content in the document's primary language. Should describe topics covered, educational level, and be useful for students searching.",
                    nullable: true
                  }
                },
                required: ["school_name", "teacher_name", "teacher_names", "school_names", "books", "suggested_title", "suggested_type_id", "suggested_devoir_type_id", "suggested_description"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_document_metadata" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data, null, 2));

    // Extract the tool call response
    let metadata: ExtractedMetadata = { 
      school_name: null, 
      teacher_name: null, 
      suggested_title: null, 
      suggested_type_id: null, 
      suggested_devoir_type_id: null,
      suggested_description: null,
      teacher_names: [],
      school_names: [],
      books: []
    };
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const dedupe = (a: unknown): string[] => {
          if (!Array.isArray(a)) return [];
          const seen = new Set<string>();
          const out: string[] = [];
          for (const v of a) {
            if (typeof v !== 'string') continue;
            const t = v.trim();
            if (!t) continue;
            const key = t.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(t);
          }
          return out;
        };
        const teacher_names = dedupe(args.teacher_names);
        const school_names = dedupe(args.school_names);
        const books = dedupe(args.books);
        metadata = {
          school_name: args.school_name || school_names[0] || null,
          teacher_name: args.teacher_name || teacher_names[0] || null,
          suggested_title: args.suggested_title || null,
          suggested_type_id: args.suggested_type_id || null,
          suggested_devoir_type_id: args.suggested_devoir_type_id || null,
          suggested_description: args.suggested_description || null,
          teacher_names,
          school_names,
          books,
        };
      } catch (parseError) {
        console.error("Error parsing tool call arguments:", parseError);
      }
    }

    console.log(`Extracted metadata:`, metadata);

    return new Response(
      JSON.stringify({ 
        success: true, 
        metadata,
        message: 'Metadata extracted successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in extract-metadata function:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: { 
          school_name: null, 
          teacher_name: null, 
          suggested_title: null, 
          suggested_type_id: null, 
          suggested_devoir_type_id: null,
          suggested_description: null,
          teacher_names: [],
          school_names: [],
          books: []
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
