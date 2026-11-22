// Private call-context handoff for the local AgentStream gateway.
// Exotel supplies CustomField (the audit UUID) in the AgentStream start event.
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
    const { data: log, error } = await admin.from("sales_agent_call_logs").select("id,lead_id,script,status").eq("id", id).maybeSingle();
    if (error || !log || !["requesting", "queued", "in-progress"].includes(String(log.status))) return new Response("Call context unavailable", { status: 404 });
    const { data: lead, error: leadError } = await admin.from("sales_agent_leads").select("business_name,service,reason").eq("id", log.lead_id).maybeSingle();
    if (leadError || !lead) return new Response("Lead context unavailable", { status: 404 });
    return new Response(JSON.stringify({ audit_id: log.id, script: log.script, business: lead.business_name, service: lead.service, reason: lead.reason }), {
      status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (_) {
    return new Response("Invalid request", { status: 400 });
  }
});
