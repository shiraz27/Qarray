import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Alert {
  id: string;
  severity: "warn" | "critical";
  message: string;
  category: string;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify caller is an admin
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleRow) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const since24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since1h = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ---- app_events aggregates (24h + 1h) ----
  const { data: events24 } = await admin
    .from("app_events")
    .select("severity,category,event_type,created_at,message,target_url,content_type,content_id")
    .gte("created_at", since24)
    .order("created_at", { ascending: false })
    .limit(500);

  const events1h = (events24 || []).filter((e) => e.created_at >= since1h);
  const byCat = (cat: string, src = events24 || []) =>
    src.filter((e) => e.category === cat);
  const errOrCrit = (rows: any[]) =>
    rows.filter((e) => e.severity === "error" || e.severity === "critical");

  // ---- AI generations ----
  const { data: ai24 } = await admin
    .from("ai_generations")
    .select("kind,status,error,updated_at")
    .gte("updated_at", since24);

  const aiByKind: Record<string, Record<string, number>> = {};
  let aiFailed = 0;
  let aiTotal = 0;
  for (const r of ai24 || []) {
    aiTotal++;
    aiByKind[r.kind] ||= {};
    aiByKind[r.kind][r.status] = (aiByKind[r.kind][r.status] ?? 0) + 1;
    if (r.status === "failed") aiFailed++;
  }

  // ---- PDF health (latest report counts) ----
  const { data: pdfReports } = await admin
    .from("pdf_health_reports")
    .select("kind,content_id,broken_pages,unavailable_pages,manifest_error,checked_at")
    .gte("checked_at", since7d)
    .order("checked_at", { ascending: false })
    .limit(500);

  // Keep latest per content
  const latestByContent = new Map<string, any>();
  for (const r of pdfReports || []) {
    const k = `${r.kind}:${r.content_id}`;
    if (!latestByContent.has(k)) latestByContent.set(k, r);
  }
  let pdfBroken = 0;
  let pdfUnavailable = 0;
  let pdfManifestErrors = 0;
  for (const r of latestByContent.values()) {
    pdfBroken += (r.broken_pages || []).length;
    pdfUnavailable += (r.unavailable_pages || []).length;
    if (r.manifest_error) pdfManifestErrors++;
  }

  // ---- Quality KPIs ----
  // Use small parallel count queries; cap heavy ones with head:true.
  const countRes = async (table: "resources" | "questions", filter: (q: any) => any) => {
    const { count } = await filter(
      admin.from(table).select("id", { count: "exact", head: true }).eq("deleted", false),
    );
    return count ?? 0;
  };

  const [
    resTotal,
    resNoOcr,
    resNoRead,
    resNoPageCount,
    resNoSource,
    qTotal,
    qNoOcr,
    qNoRead,
  ] = await Promise.all([
    countRes("resources", (q) => q),
    countRes("resources", (q) => q.neq("ocr_status", "completed")),
    countRes("resources", (q) => q.is("ocr_readability", null)),
    countRes("resources", (q) => q.is("page_count", null)),
    countRes("resources", (q) => q.is("source_link", null)),
    countRes("questions", (q) => q),
    countRes("questions", (q) => q.neq("ocr_status", "completed")),
    countRes("questions", (q) => q.is("ocr_readability", null)),
  ]);

  // ---- Compute sections + alerts ----
  const alerts: Alert[] = [];

  // Upload pipeline
  const uploadEvents24 = byCat("upload");
  const uploadEvents1h = byCat("upload", events1h);
  const uploadCriticalCount = errOrCrit(uploadEvents1h).length;
  if (uploadCriticalCount >= 10) {
    alerts.push({
      id: "upload_failures_spike",
      severity: "critical",
      category: "upload",
      message: `${uploadCriticalCount} upload failures in the last hour`,
    });
  } else if (uploadCriticalCount >= 3) {
    alerts.push({
      id: "upload_failures_warn",
      severity: "warn",
      category: "upload",
      message: `${uploadCriticalCount} upload failures in the last hour`,
    });
  }

  // Media delivery
  const previewFails1h = errOrCrit(byCat("preview", events1h)).length;
  const downloadFails1h = errOrCrit(byCat("download", events1h)).length;
  if (previewFails1h + downloadFails1h >= 15) {
    alerts.push({
      id: "media_failures_spike",
      severity: "critical",
      category: "media",
      message: `${previewFails1h + downloadFails1h} media preview/download failures in the last hour`,
    });
  } else if (previewFails1h + downloadFails1h >= 5) {
    alerts.push({
      id: "media_failures_warn",
      severity: "warn",
      category: "media",
      message: `${previewFails1h + downloadFails1h} media failures in the last hour`,
    });
  }

  if (pdfManifestErrors >= 5) {
    alerts.push({
      id: "pdf_manifest_errors",
      severity: "warn",
      category: "media",
      message: `${pdfManifestErrors} PDF manifests unreachable in last health audit`,
    });
  }

  // AI
  const aiFailRate = pct(aiFailed, aiTotal);
  if (aiTotal >= 10 && aiFailRate >= 50) {
    alerts.push({
      id: "ai_fail_rate_critical",
      severity: "critical",
      category: "ai",
      message: `AI failure rate ${aiFailRate}% over last 24h`,
    });
  } else if (aiTotal >= 10 && aiFailRate >= 25) {
    alerts.push({
      id: "ai_fail_rate_warn",
      severity: "warn",
      category: "ai",
      message: `AI failure rate ${aiFailRate}% over last 24h`,
    });
  }

  // Quality
  const ocrCoverage = pct(resTotal - resNoOcr, resTotal);
  if (resTotal > 50 && ocrCoverage < 30) {
    alerts.push({
      id: "low_ocr_coverage",
      severity: "warn",
      category: "quality",
      message: `Only ${ocrCoverage}% of resources have completed OCR`,
    });
  }

  const snapshot = {
    generated_at: now.toISOString(),
    alerts,
    sections: {
      upload: {
        events_24h: uploadEvents24.length,
        failures_24h: errOrCrit(uploadEvents24).length,
        failures_1h: uploadCriticalCount,
        recent: errOrCrit(uploadEvents24).slice(0, 10),
      },
      media: {
        preview_failures_24h: errOrCrit(byCat("preview")).length,
        preview_failures_1h: previewFails1h,
        download_failures_24h: errOrCrit(byCat("download")).length,
        download_failures_1h: downloadFails1h,
        pdf_pages_broken: pdfBroken,
        pdf_pages_unavailable: pdfUnavailable,
        pdf_manifest_errors: pdfManifestErrors,
        recent: [...errOrCrit(byCat("preview")), ...errOrCrit(byCat("download"))]
          .slice(0, 10),
      },
      ai: {
        total_24h: aiTotal,
        failed_24h: aiFailed,
        failure_rate: aiFailRate,
        by_kind: aiByKind,
      },
      events: {
        total_24h: (events24 || []).length,
        by_severity: ["info", "warn", "error", "critical"].reduce(
          (acc, s) => ({
            ...acc,
            [s]: (events24 || []).filter((e) => e.severity === s).length,
          }),
          {} as Record<string, number>,
        ),
      },
      quality: {
        resources: {
          total: resTotal,
          missing_ocr: resNoOcr,
          missing_readability: resNoRead,
          missing_page_count: resNoPageCount,
          missing_source_link: resNoSource,
          ocr_coverage_pct: ocrCoverage,
        },
        questions: {
          total: qTotal,
          missing_ocr: qNoOcr,
          missing_readability: qNoRead,
        },
      },
    },
  };

  return new Response(JSON.stringify(snapshot), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});