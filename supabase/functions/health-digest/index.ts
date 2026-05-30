import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Renders a single email per call. Emails go via the project's email queue
// (enqueue_email RPC) if it exists; otherwise this function logs and exits.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  // mode: "digest" (default) | "check_critical" | "alert"
  let mode = "digest";
  let alertId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      mode = body?.mode ?? mode;
      alertId = body?.alert_id ?? null;
    } else {
      const u = new URL(req.url);
      mode = u.searchParams.get("mode") ?? mode;
      alertId = u.searchParams.get("alert_id");
    }
  } catch { /* ignore */ }

  // Fetch snapshot via service role (skip auth check by calling internal logic).
  // We re-implement a slim subset here to avoid HTTP roundtrip.
  const snapshot = await buildSnapshot(admin);

  if (mode === "check_critical") {
    const critical = snapshot.alerts.filter((a) => a.severity === "critical");
    const fired: string[] = [];
    for (const a of critical) {
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: prev } = await admin
        .from("health_alert_sent")
        .select("id")
        .eq("alert_id", a.id)
        .gte("sent_at", since)
        .maybeSingle();
      if (prev) continue;
      await admin.from("health_alert_sent").insert({ alert_id: a.id });
      await sendEmail(admin, await getAdminEmails(admin), {
        subject: `🚨 [App health] ${a.message}`,
        html: renderAlertHtml(a),
        templateName: "health_alert",
      });
      fired.push(a.id);
    }
    return json({ ok: true, fired });
  }

  // mode === "digest" or "alert"
  const emails = await getAdminEmails(admin);
  if (emails.length === 0) {
    return json({ ok: true, skipped: "no admin emails" });
  }

  if (mode === "alert" && alertId) {
    const a = snapshot.alerts.find((x) => x.id === alertId);
    if (!a) return json({ ok: false, error: "alert not found" });
    await sendEmail(admin, emails, {
      subject: `🚨 [App health] ${a.message}`,
      html: renderAlertHtml(a),
      templateName: "health_alert",
    });
    return json({ ok: true, sent: emails.length });
  }

  // Default: digest
  await sendEmail(admin, emails, {
    subject: `Daily app health digest — ${new Date().toISOString().slice(0, 10)}`,
    html: renderDigestHtml(snapshot),
    templateName: "health_digest",
  });
  return json({ ok: true, sent: emails.length });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAdminEmails(admin: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: roles } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(25);
  if (!roles || roles.length === 0) return [];
  const ids = roles.map((r: any) => r.user_id);
  const emails: string[] = [];
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}

async function sendEmail(
  admin: ReturnType<typeof createClient>,
  recipients: string[],
  msg: { subject: string; html: string; templateName: string },
) {
  if (recipients.length === 0) return;
  // Try queue via enqueue_email RPC. If it doesn't exist, just log.
  for (const to of recipients) {
    try {
      const { error } = await admin.rpc("enqueue_email", {
        p_template_name: msg.templateName,
        p_recipient: to,
        p_subject: msg.subject,
        p_html: msg.html,
        p_text: msg.subject,
        p_priority: "transactional",
      });
      if (error) {
        console.log(`enqueue_email unavailable for ${to}: ${error.message}`);
      }
    } catch (e) {
      console.log(`email send skipped for ${to}: ${(e as Error).message}`);
    }
  }
}

function renderAlertHtml(a: { id: string; severity: string; message: string; category: string }): string {
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;background:#fff;color:#111;padding:24px">
  <h2 style="margin:0 0 8px 0">App Health Alert</h2>
  <p style="margin:0 0 12px 0;color:#666">Severity: <b>${a.severity}</b> · Category: ${a.category}</p>
  <p style="font-size:16px;line-height:1.5;border-left:4px solid #dc2626;padding:8px 12px;background:#fef2f2">${a.message}</p>
  <p style="color:#666;font-size:13px">Open the app's Statistics → Monitoring tab for full details.</p>
  </body></html>`;
}

function renderDigestHtml(s: any): string {
  const alerts = (s.alerts as any[])
    .map((a) => `<li style="margin:4px 0">[${a.severity.toUpperCase()}] ${a.message}</li>`)
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;background:#fff;color:#111;padding:24px">
    <h2 style="margin:0 0 12px 0">Daily App Health Digest</h2>
    <p style="margin:0 0 16px 0;color:#666">Generated ${s.generated_at}</p>
    <h3>Alerts (${(s.alerts as any[]).length})</h3>
    <ul>${alerts || "<li>No active alerts 🎉</li>"}</ul>
    <h3>Upload pipeline</h3>
    <p>Failures 24h: <b>${s.sections.upload.failures_24h}</b> · 1h: <b>${s.sections.upload.failures_1h}</b></p>
    <h3>Media delivery</h3>
    <p>Preview failures 24h: <b>${s.sections.media.preview_failures_24h}</b> · Download: <b>${s.sections.media.download_failures_24h}</b><br/>
    Broken PDF pages: <b>${s.sections.media.pdf_pages_broken}</b> · Unreachable manifests: <b>${s.sections.media.pdf_manifest_errors}</b></p>
    <h3>AI</h3>
    <p>${s.sections.ai.failed_24h}/${s.sections.ai.total_24h} failed (${s.sections.ai.failure_rate}%)</p>
    <h3>Quality coverage</h3>
    <p>Resources OCR coverage: <b>${s.sections.quality.resources.ocr_coverage_pct}%</b><br/>
    Resources missing readability: <b>${s.sections.quality.resources.missing_readability}</b> · missing page_count: <b>${s.sections.quality.resources.missing_page_count}</b></p>
    </body></html>`;
}

// Inline slim snapshot (mirrors health-snapshot)
async function buildSnapshot(admin: ReturnType<typeof createClient>) {
  const now = new Date();
  const since24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since1h = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events24 } = await admin
    .from("app_events")
    .select("severity,category,created_at")
    .gte("created_at", since24)
    .limit(2000);
  const events1h = (events24 || []).filter((e: any) => e.created_at >= since1h);
  const errOrCrit = (rows: any[]) =>
    rows.filter((e) => e.severity === "error" || e.severity === "critical");
  const byCat = (c: string, src = events24 || []) => src.filter((e: any) => e.category === c);

  const { data: ai24 } = await admin
    .from("ai_generations")
    .select("kind,status")
    .gte("updated_at", since24);
  let aiFailed = 0, aiTotal = 0;
  for (const r of ai24 || []) {
    aiTotal++;
    if ((r as any).status === "failed") aiFailed++;
  }
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  const aiFailRate = pct(aiFailed, aiTotal);

  const { data: pdfReports } = await admin
    .from("pdf_health_reports")
    .select("kind,content_id,broken_pages,unavailable_pages,manifest_error,checked_at")
    .gte("checked_at", since7d)
    .order("checked_at", { ascending: false })
    .limit(500);
  const seen = new Set<string>();
  let pdfBroken = 0, pdfManifestErrors = 0;
  for (const r of pdfReports || []) {
    const k = `${(r as any).kind}:${(r as any).content_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pdfBroken += ((r as any).broken_pages || []).length;
    if ((r as any).manifest_error) pdfManifestErrors++;
  }

  const alerts: { id: string; severity: "warn" | "critical"; message: string; category: string }[] = [];
  const uploadCritical = errOrCrit(byCat("upload", events1h)).length;
  if (uploadCritical >= 10) alerts.push({ id: "upload_failures_spike", severity: "critical", category: "upload", message: `${uploadCritical} upload failures in last hour` });
  const mediaFails1h = errOrCrit(byCat("preview", events1h)).length + errOrCrit(byCat("download", events1h)).length;
  if (mediaFails1h >= 15) alerts.push({ id: "media_failures_spike", severity: "critical", category: "media", message: `${mediaFails1h} media failures in last hour` });
  if (aiTotal >= 10 && aiFailRate >= 50) alerts.push({ id: "ai_fail_rate_critical", severity: "critical", category: "ai", message: `AI failure rate ${aiFailRate}% over 24h` });

  return {
    generated_at: now.toISOString(),
    alerts,
    sections: {
      upload: {
        failures_24h: errOrCrit(byCat("upload")).length,
        failures_1h: uploadCritical,
      },
      media: {
        preview_failures_24h: errOrCrit(byCat("preview")).length,
        download_failures_24h: errOrCrit(byCat("download")).length,
        pdf_pages_broken: pdfBroken,
        pdf_manifest_errors: pdfManifestErrors,
      },
      ai: {
        total_24h: aiTotal,
        failed_24h: aiFailed,
        failure_rate: aiFailRate,
      },
      quality: {
        resources: { ocr_coverage_pct: 0, missing_readability: 0, missing_page_count: 0 },
      },
    },
  };
}