// WEDNESDAY lead discovery — Supabase Edge Function
// Required Supabase secret: SERPER_API_KEY
// Deploy with JWT verification enabled. Never put the Serper key in browser code.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function extractPublicPhone(text: string): string {
  const match = text.match(/(?:\+?91[\s-]?)?([6-9]\d{9})/);
  if (!match) return "";
  return `+91 ${match[1]}`;
}

function extractPublicEmail(text: string): string {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function cleanName(title: string): string {
  return title
    .replace(/\s*[-|•].*$/, "")
    .replace(/\s*\(.*\)$/, "")
    .trim()
    .slice(0, 120);
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const apiKey = Deno.env.get("SERPER_API_KEY");
  if (!apiKey) return json({ error: "Lead search is not configured. Add SERPER_API_KEY to Supabase Edge Function secrets." }, 503);

  // The Supabase gateway verifies the signed-in user's JWT before this function runs.
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in to WEDNESDAY before searching." }, 401);

  try {
    const input = await request.json();
    const businessType = String(input.businessType || "").trim().slice(0, 80);
    const location = String(input.location || "").trim().slice(0, 100);
    const keywords = String(input.keywords || "").trim().slice(0, 160);
    const limit = Math.max(1, Math.min(25, Number(input.limit) || 10));
    const sources = Array.isArray(input.sources) ? input.sources.map((v: unknown) => String(v)) : [];

    if (!businessType || !location) return json({ error: "Business type and location are required." }, 400);

    const placeQueries = [
      `${businessType} in ${location}`,
      keywords ? `${businessType} ${keywords} in ${location}` : `new ${businessType} in ${location}`,
    ];
    const webQueries = [
      `newly opened ${businessType} ${location} opening 2025 2026`,
      `site:instagram.com ${businessType} ${location}`,
      `site:facebook.com ${businessType} ${location} business`,
    ];

    const [placeResponses, webResponses] = await Promise.all([
      Promise.all(placeQueries.map(async (q) => {
        const response = await fetch("https://google.serper.dev/places", {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q, gl: "in", hl: "en" }),
        });
        if (!response.ok) throw new Error(`Places search returned ${response.status}`);
        return { query: q, data: await response.json() };
      })),
      Promise.all(webQueries.map(async (q) => {
        const response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q, gl: "in", hl: "en", num: 10 }),
        });
        if (!response.ok) throw new Error(`Web search returned ${response.status}`);
        return { query: q, data: await response.json() };
      })),
    ]);

    const seen = new Set<string>();
    const leads: Array<Record<string, unknown>> = [];
    for (const result of placeResponses) {
      for (const item of (result.data.places || [])) {
        const title = String(item.title || item.name || "").trim();
        if (!title) continue;
        const key = title.toLowerCase().replace(/[^a-z0-9]/g, "") + "|" + String(item.address || "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const phone = String(item.phoneNumber || item.phone || item.internationalPhoneNumber || item.phone_number || "");
        leads.push({
          id: crypto.randomUUID(), name: title, company: title, phone, email: "",
          address: String(item.address || ""), website: String(item.website || item.websiteUrl || item.link || ""),
          source: "Google Maps / Places",
          snippet: [item.category, item.address, item.rating ? `Rating ${item.rating}` : ""].filter(Boolean).join(" · "),
          searchQuery: result.query, status: "Needs review", contactVerified: Boolean(phone), openingDateVerified: false,
        });
        if (leads.length >= limit) break;
      }
      if (leads.length >= limit) break;
    }

    for (const result of webResponses) {
      for (const item of (result.data.organic || [])) {
        const title = cleanName(String(item.title || ""));
        const url = String(item.link || "");
        const snippet = String(item.snippet || "");
        if (!title || !url || !/^https?:\/\//i.test(url)) continue;
        const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const combined = `${title} ${snippet}`;
        leads.push({
          id: crypto.randomUUID(), name: title, company: title,
          phone: extractPublicPhone(combined), email: extractPublicEmail(combined), address: "",
          website: url, source: new URL(url).hostname.replace(/^www\./, ""), snippet,
          searchQuery: result.query, status: "Needs review",
          contactVerified: Boolean(extractPublicPhone(combined) || extractPublicEmail(combined)), openingDateVerified: false,
        });
        if (leads.length >= limit) break;
      }
      if (leads.length >= limit) break;
    }

    const queries = [...placeQueries, ...webQueries];
    return json({
      leads,
      searchedQueries: queries,
      resultCount: leads.length,
      note: "Search results are public web listings, not proof of owner intent or opening date. Verify each business and contact before outreach.",
    });
  } catch (error) {
    console.error("Lead search failed:", error);
    return json({ error: error instanceof Error ? error.message : "Lead search failed." }, 500);
  }
});
