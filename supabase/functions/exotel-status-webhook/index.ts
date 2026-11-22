// Exotel call status callback. JWT verification is disabled for this endpoint;
// authenticate with a long random query token and restrict the route at the edge if possible.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const expected = Deno.env.get("EXOTEL_WEBHOOK_SECRET") || "";
    const supplied = new URL(req.url).searchParams.get("token") || "";
    if (!expected || !safeEqual(expected, supplied)) return new Response("Unauthorized", { status: 401 });
    const form = await req.formData();
    const callSid = String(form.get("CallSid") || form.get("call_sid") || "");
    const customField = String(form.get("CustomField") || form.get("custom_field") || "");
    const status = String(form.get("Status") || form.get("status") || "unknown").toLowerCase();
    const duration = Number(form.get("ConversationDuration") || form.get("conversation_duration") || 0);
    if (!callSid || !/^[0-9a-f-]{36}$/i.test(customField)) return new Response("Bad callback payload", { status: 400 });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return new Response("Server configuration missing", { status: 500 });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const update: Record<string, unknown> = { provider_call_sid: callSid, provider_status: status };
    if (["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) update.status = status;
    if (Number.isFinite(duration) && duration >= 0) update.duration_seconds = Math.min(Math.floor(duration), 86400);
    const { error } = await admin.from("sales_agent_call_logs").update(update).eq("id", customField);
    if (error) return new Response("Callback update failed", { status: 500 });
    return new Response("OK", { status: 200 });
  } catch (_) {
    return new Response("Invalid callback", { status: 400 });
  }
});
