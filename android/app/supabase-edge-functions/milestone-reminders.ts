// supabase/functions/milestone-reminders/index.ts
// Deploy: supabase functions deploy milestone-reminders
// Schedule via Supabase Dashboard → Database → Cron → every day at 08:00
// Required env vars: RESEND_API_KEY, APP_URL (optional, for deep links)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL      = "Qoder <onboarding@resend.dev>"; // ← change to your verified Resend sender

serve(async (req) => {
  // Allow direct POST trigger from Supabase cron or external caller
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_KEY}` && req.method !== "POST") {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const in3days  = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Get all incomplete milestones that are overdue or due within 3 days
  const { data: milestones, error } = await sb
    .from("milestones")
    .select("id, title, date, description, project_id, projects(name, user_id)")
    .eq("completed", false)
    .lte("date", in3days.toISOString())
    .not("date", "is", null);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!milestones?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  // Group by user
  const byUser: Record<string, typeof milestones> = {};
  for (const m of milestones) {
    const userId = (m.projects as any)?.user_id;
    if (!userId) continue;
    if (!byUser[userId]) byUser[userId] = [];
    byUser[userId].push(m);
  }

  let sent = 0;

  for (const [userId, userMilestones] of Object.entries(byUser)) {
    // Get user email
    const { data: user } = await sb.auth.admin.getUserById(userId);
    if (!user?.user?.email) continue;

    const overdue = userMilestones.filter(m => new Date(m.date!) < today);
    const upcoming = userMilestones.filter(m => {
      const d = new Date(m.date!);
      return d >= today && d <= in3days;
    });

    const overdueHtml = overdue.length ? `
      <h3 style="color:#FF4466;margin:16px 0 8px">⚠ Overdue (${overdue.length})</h3>
      <ul>${overdue.map(m => `<li><strong>${(m.projects as any).name}</strong> — ${m.title} <em style="color:#888">(was due ${new Date(m.date!).toLocaleDateString()})</em></li>`).join("")}</ul>
    ` : "";

    const upcomingHtml = upcoming.length ? `
      <h3 style="color:#FFB347;margin:16px 0 8px">📅 Due within 3 days (${upcoming.length})</h3>
      <ul>${upcoming.map(m => `<li><strong>${(m.projects as any).name}</strong> — ${m.title} <em style="color:#888">(due ${new Date(m.date!).toLocaleDateString()})</em></li>`).join("")}</ul>
    ` : "";

    const emailBody = `
      <!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2 style="color:#00D4FF;margin-bottom:4px">Qoder Milestone Reminder</h2>
        <p style="color:#666;margin-top:0">${new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}</p>
        ${overdueHtml}
        ${upcomingHtml}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
        <p style="color:#999;font-size:12px">You're receiving this because you have milestones due in Qoder. Open Qoder to manage your milestones.</p>
      </body></html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to:   [user.user.email],
        subject: `${overdue.length ? `⚠ ${overdue.length} overdue · ` : ""}${upcoming.length} milestone${upcoming.length !== 1 ? "s" : ""} due soon — Qoder`,
        html: emailBody,
      }),
    });

    if (res.ok) sent++;
  }

  return new Response(JSON.stringify({ sent, total_milestones: milestones.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});