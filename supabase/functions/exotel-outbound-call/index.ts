// WEDNESDAY — Exotel outbound AI call gateway.
// All provider credentials remain server-side. One user-approved call per request.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGINS = new Set([
  "https://manansingh17082005-bot.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://manansingh17082005-bot.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const reply = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers(origin), "Content-Type": "application/json" } });

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("Missing server secret: " + name);
  return value;
}
function e164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
function hasAiDisclosure(script: string): boolean {
  return /\bAI assistant\b|\bartificial intelligence assistant\b/i.test(script);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sign in is required." }, 401, origin);
    const jwt = authHeader.slice(7);
    const supabaseUrl = required("SUPABASE_URL");
    const anonKey = required("SUPABASE_ANON_KEY");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return reply({ error: "Invalid or expired session." }, 401, origin);

    const ownerId = required("WEDNESDAY_OWNER_USER_ID");
    if (authData.user.id !== ownerId) return reply({ error: "This calling workspace is restricted to its configured owner." }, 403, origin);

    // These flags must only be enabled after Exotel/access-provider confirmation.
    if (Deno.env.get("WEDNESDAY_CALLING_ENABLED") !== "true") return reply({ error: "Outbound calling is disabled. Complete provider and regulatory setup first." }, 423, origin);
    const complianceSecrets = [
      "TRAI_SENDER_REGISTRATION_REFERENCE",
      "TRAI_A2P_DECLARATION_REFERENCE",
      "TRAI_VOICE_RESOURCE_APPROVAL_REFERENCE",
      "TRAI_SCRUBBER_PROVIDER_REFERENCE",
    ];
    for (const key of complianceSecrets) {
      if (!Deno.env.get(key)?.trim()) return reply({ error: "Calling is locked: required sender/A2P/voice-resource/scrubbing configuration is incomplete (" + key + ")." }, 423, origin);
    }

    const payload = await req.json();
    const leadId = String(payload.lead_id || "");
    const script = String(payload.script || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) return reply({ error: "Invalid prospect identifier." }, 400, origin);
    if (script.length < 40 || script.length > 5000 || !hasAiDisclosure(script)) {
      return reply({ error: "Review a complete script that clearly identifies the caller as an AI assistant before calling." }, 400, origin);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: lead, error: leadError } = await admin.from("sales_agent_leads").select("*").eq("id", leadId).eq("user_id", ownerId).maybeSingle();
    if (leadError || !lead) return reply({ error: "Prospect was not found in the secure CRM. Sync the lead and permission record first." }, 404, origin);

    const requiredLeadFields = [
      lead.consent_verified === true,
      lead.consent_source,
      lead.consent_date,
      lead.consent_evidence_ref,
      lead.consent_register_reference,
      lead.consent_purpose,
      lead.preference_scrubbed === true,
      lead.preference_scrubbed_at,
      lead.dlt_scrub_reference,
      lead.opted_out === false,
    ];
    if (requiredLeadFields.some(value => !value)) return reply({ error: "Call blocked: explicit consent, its register/evidence references, purpose, current preference scrub and opt-out check must all be recorded." }, 423, origin);
    if (!e164(String(lead.phone || ""))) return reply({ error: "The prospect phone must be stored in international E.164 format, for example +9198XXXXXXXX." }, 400, origin);
    if (lead.consent_purpose && !/marketing|promotional|sales|business development/i.test(String(lead.consent_purpose))) {
      return reply({ error: "Recorded consent purpose does not clearly cover sales or promotional calls." }, 423, origin);
    }

    const apiKey = required("EXOTEL_API_KEY");
    const apiToken = required("EXOTEL_API_TOKEN");
    const accountSid = required("EXOTEL_ACCOUNT_SID");
    const callerId = required("EXOTEL_CALLER_ID");
    const streamUrl = required("EXOTEL_STREAM_URL");
    const region = (Deno.env.get("EXOTEL_REGION") || "mumbai").toLowerCase();
    const apiHost = region === "singapore" ? "https://api.exotel.com" : "https://api.in.exotel.com";
    if (!/^wss:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s]*$/i.test(streamUrl)) return reply({ error: "EXOTEL_STREAM_URL must be a secure public wss:// AgentStream endpoint." }, 423, origin);
    if (!e164(callerId) && !/^\d{8,15}$/.test(callerId)) return reply({ error: "EXOTEL_CALLER_ID is not a valid provider-approved caller ID." }, 423, origin);

    // The explicit UI button click is the approval event for this exact lead and script.
    const { data: callLog, error: logError } = await admin.from("sales_agent_call_logs").insert({
      user_id: ownerId,
      lead_id: lead.id,
      provider: "Exotel",
      status: "requesting",
      recipient_phone: lead.phone,
      caller_id: callerId,
      script,
    }).select("id").single();
    if (logError || !callLog) return reply({ error: "Could not create the call audit record. No call was placed." }, 500, origin);

    const webhookSecret = required("EXOTEL_WEBHOOK_SECRET");
    const callbackUrl = supabaseUrl + "/functions/v1/exotel-status-webhook?token=" + encodeURIComponent(webhookSecret);
    const form = new URLSearchParams();
    form.set("From", lead.phone);
    form.set("CallerId", callerId);
    form.set("StreamUrl", streamUrl);
    form.set("StreamType", "bidirectional");
    form.set("TimeLimit", "180");
    form.set("TimeOut", "25");
    form.set("StatusCallback", callbackUrl);
    form.append("StatusCallbackEvents[]", "answered");
    form.append("StatusCallbackEvents[]", "terminal");
    form.set("CustomField", String(callLog.id));

    const endpoint = apiHost + "/v1/Accounts/" + encodeURIComponent(accountSid) + "/Calls/connect";
    const basic = btoa(apiKey + ":" + apiToken);
    const exotelResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const responseText = await exotelResponse.text();
    let parsed: any = {};
    try { parsed = JSON.parse(responseText); } catch (_) {}
    const callSid = parsed?.Call?.Sid || parsed?.call?.sid || null;
    const providerStatus = parsed?.Call?.Status || parsed?.call?.status || null;
    if (!exotelResponse.ok || !callSid) {
      await admin.from("sales_agent_call_logs").update({
        status: "failed",
        error_code: String(exotelResponse.status),
        error_message: responseText.slice(0, 800),
        provider_status: providerStatus,
      }).eq("id", callLog.id);
      return reply({ error: "Exotel rejected the call request. No successful call was confirmed.", provider_status: providerStatus, provider_http_status: exotelResponse.status, audit_id: callLog.id }, 502, origin);
    }
    await admin.from("sales_agent_call_logs").update({
      status: "queued",
      provider_call_sid: callSid,
      provider_status: providerStatus,
    }).eq("id", callLog.id);

    return reply({ success: true, message: "Exotel accepted the single approved call request.", audit_id: callLog.id, call_sid: callSid, status: providerStatus }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return reply({ error: message }, 500, origin);
  }
});
