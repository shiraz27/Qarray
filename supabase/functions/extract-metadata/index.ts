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
          metadata: { school_name: null, teacher_name: null },
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
1. School/Institute name - Look for patterns like:
   - Arabic: ثانوية، متوسطة، ابتدائية، معهد، مدرسة، مركز، ليسي
   - French: Lycée, CEM, École, Institut, Collège, Centre
   - Usually appears in document headers
   
2. Teacher name - Look for patterns like:
   - Arabic: الأستاذ، الأستاذة، المعلم، المعلمة، إعداد، تحت إشراف
   - French: Prof., Professeur, Mr., Mme., M., Enseignant, Préparé par
   - May appear in headers or signatures at the bottom

Important notes:
- Extract ONLY if you find clear indicators, don't guess
- Names should be returned in their original language (Arabic or French)
- If multiple schools/teachers are mentioned, return the primary one (usually the first one)
- Return null if not found or uncertain`;

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
          { role: "user", content: `Please analyze this OCR text and extract the school name and teacher name:\n\n${truncatedText}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_metadata",
              description: "Extract school/institute name and teacher name from educational document",
              parameters: {
                type: "object",
                properties: {
                  school_name: { 
                    type: "string", 
                    description: "Name of the school, institute, or educational center. Null if not found.",
                    nullable: true
                  },
                  teacher_name: { 
                    type: "string", 
                    description: "Name of the teacher or professor. Null if not found.",
                    nullable: true
                  }
                },
                required: ["school_name", "teacher_name"],
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
    let metadata: ExtractedMetadata = { school_name: null, teacher_name: null };
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        metadata = {
          school_name: args.school_name || null,
          teacher_name: args.teacher_name || null
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
        metadata: { school_name: null, teacher_name: null }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

