// WEDNESDAY lead discovery — Supabase Edge Function
// Required Supabase secret: TAVILY_API_KEY
// Tavily key stays server-side. Use basic search to conserve free monthly credits.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const allowedOrigins = new Set([
  "https://manansingh17082005-bot.github.io",
  "http://localhost:8000",
]);
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://manansingh17082005-bot.github.io",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

function extractPublicPhone(text: string, location: string): string {
  const international = text.match(/(?:\+|00)\s*(\d[\d\s().-]{6,18}\d)/);
  if (international) {
    const digits = international[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  }
  if (/\bindia\b/i.test(location)) {
    const local = text.match(/(?:^|\D)([6-9]\d{9})(?!\d)/);
    if (local) return `+91 ${local[1]}`;
  }
  return "";
}

function extractPublicEmail(text: string): string {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function extractPublicWhatsApp(text: string): string {
  const patterns = [
    /(?:https?:\/\/)?(?:api\.)?wa\.me\/(?:send\/)?([0-9]{10,15})/i,
    /api\.whatsapp\.com\/send\?[^\s"'<>]*phone=([0-9]{10,15})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function cleanName(title: string): string {
  return title.replace(/\s*[-|•].*$/, "").replace(/\s*\(.*\)$/, "").trim().slice(0, 120);
}

serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405, origin);

  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) return json({ error: "Tavily is not configured. Add TAVILY_API_KEY to Supabase Edge Function secrets." }, 503, origin);

  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const ownerId = Deno.env.get("WEDNESDAY_OWNER_USER_ID");
  if (!bearer) return json({ error: "Sign in to WEDNESDAY before searching." }, 401, origin);
  if (!ownerId) return json({ error: "Owner access is not configured. Set WEDNESDAY_OWNER_USER_ID in Supabase secrets." }, 503, origin);

  // Validate the bearer token with Supabase Auth; a Bearer prefix alone is not authentication.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Supabase Auth verification is not configured." }, 503, origin);
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { "apikey": supabaseAnonKey, "Authorization": `Bearer ${bearer}` },
  });
  if (!authResponse.ok) return json({ error: "Your session is invalid or expired. Sign in again." }, 401, origin);
  const authenticatedUser = await authResponse.json();
  if (authenticatedUser?.id !== ownerId) return json({ error: "This WEDNESDAY workspace is restricted to its owner." }, 403, origin);

  try {
    const input = await request.json();
    const businessType = String(input.businessType || "").trim().slice(0, 80);
    const location = String(input.location || "").trim().slice(0, 100);
    const keywords = String(input.keywords || "").trim().slice(0, 160);
    const market = String(input.market || "both").trim().slice(0, 30);
    const businessModel = String(input.businessModel || "both").trim().slice(0, 30);
    const services = Array.isArray(input.services) ? input.services.map((x: unknown) => String(x).slice(0, 60)).slice(0, 10) : [];
    const sources = Array.isArray(input.sources) ? input.sources.map((x: unknown) => String(x).slice(0, 40)).slice(0, 10) : [];
    const filters = input.filters && typeof input.filters === "object" ? input.filters : {};
    const prioritiseNoWebsite = filters.noWebsite === true;
    const prioritiseWeakSocial = filters.weakSocial === true;
    const prioritisePublicContact = filters.publicContact === true;
    const limit = Math.max(1, Math.min(25, Number(input.limit) || 10));

    if (!businessType || !location) return json({ error: "Business type and location are required." }, 400, origin);

    const query = [
      businessType,
      location,
      keywords,
      services.join(" "),
      sources.length ? `public pages and listings from ${sources.join(" ")}` : "",
      market === "international" ? "international business" : market === "india" ? "India-based business" : "",
      businessModel === "agency" ? "business needing creative agency marketing services" : businessModel === "freelance" ? "business needing freelance professional services" : "",
      prioritiseNoWebsite ? "small business website missing no official website" : "",
      prioritiseWeakSocial ? "business social media page inactive irregular posting low engagement" : "",
      prioritisePublicContact ? "public business phone email contact details" : "business official contact website",
      "business contact phone address official website"
    ].filter(Boolean).join(" ");

    // One basic-search request costs one Tavily credit.
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        topic: "general",
        search_depth: "basic",
        max_results: Math.min(20, Math.max(5, limit)),
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Tavily search error:", response.status, detail);
      if (response.status === 401 || response.status === 403) {
        return json({ error: "Tavily rejected the API key. Check the TAVILY_API_KEY secret." }, 502, origin);
      }
      if (response.status === 429) {
        return json({ error: "Tavily rate limit or free-credit limit reached. Try again after the limit resets." }, 429, origin);
      }
      return json({ error: `Tavily search failed (${response.status}).` }, 502, origin);
    }

    const data = await response.json();
    const seen = new Set<string>();
    const leads: Array<Record<string, unknown>> = [];

    for (const item of (data.results || [])) {
      const title = cleanName(String(item.title || ""));
      const url = String(item.url || "");
      const content = String(item.content || "");
      if (!title || !url || !/^https?:\/\//i.test(url)) continue;

      const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const combined = `${title} ${content} ${url}`;
      const phone = extractPublicPhone(combined, location);
      const email = extractPublicEmail(combined);
      const whatsappNumber = extractPublicWhatsApp(combined);
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { host = ""; }

      leads.push({
        id: crypto.randomUUID(),
        name: title,
        company: title,
        phone,
        whatsappNumber,
        whatsappStatus: whatsappNumber ? "Public WhatsApp link found" : "Not found / not verified",
        email,
        address: "",
        website: url,
        source: host ? `Tavily · ${host}` : "Tavily Web Search",
        snippet: content.slice(0, 700),
        searchQuery: query,
        status: "Needs review",
        contactVerified: Boolean(phone || email),
        openingDateVerified: false,
      });
      if (leads.length >= limit) break;
    }

    return json({
      leads,
      searchedQueries: [query],
      resultCount: leads.length,
      provider: "Tavily",
      creditsNote: "One basic Tavily search request was used. Results are public web listings, not proof of owner intent, opening date, or contact ownership. Verify before outreach.",
    }, 200, origin);
  } catch (error) {
    console.error("Lead search failed:", error);
    return json({ error: error instanceof Error ? error.message : "Lead search failed." }, 500, origin);
  }
});
