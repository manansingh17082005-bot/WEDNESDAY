// Records a recipient's explicit request to stop further calls.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const expected = Deno.env.get("EXOTEL_AGENT_CONTEXT_SECRET") || "";
    const supplied = new URL(req.url).searchParams.get("token") || "";
    if (!expected || !equal(expected, supplied)) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const id = String(body.audit_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invalid audit id", { status: 400 });
    const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
    const { data: log, error } = await admin.from("sales_agent_call_logs").select("id,lead_id,user_id").eq("id", id).maybeSingle();
    if (error || !log) return new Response("Call record not found", { status: 404 });
    const { error: leadError } = await admin.from("sales_agent_leads").update({
      opted_out: true, consent_verified: false, preference_scrubbed: false, status: "Do not contact"
    }).eq("id", log.lead_id).eq("user_id", log.user_id);
    if (leadError) return new Response("Unable to record opt-out", { status: 500 });
    await admin.from("sales_agent_call_logs").update({ provider_status: "recipient-opted-out" }).eq("id", id);
    return new Response("Opt-out recorded", { status: 200 });
  } catch (_) {
    return new Response("Invalid request", { status: 400 });
  }
});
