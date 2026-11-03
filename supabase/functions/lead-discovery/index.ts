// WEDNESDAY lead discovery — Supabase Edge Function
// Required Supabase secret: TAVILY_API_KEY
// Tavily key stays server-side. Use basic search to conserve free monthly credits.

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
  return match ? `+91 ${match[1]}` : "";
}

function extractPublicEmail(text: string): string {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function cleanName(title: string): string {
  return title.replace(/\s*[-|•].*$/, "").replace(/\s*\(.*\)$/, "").trim().slice(0, 120);
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) return json({ error: "Tavily is not configured. Add TAVILY_API_KEY to Supabase Edge Function secrets." }, 503);

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in to WEDNESDAY before searching." }, 401);

  try {
    const input = await request.json();
    const businessType = String(input.businessType || "").trim().slice(0, 80);
    const location = String(input.location || "").trim().slice(0, 100);
    const keywords = String(input.keywords || "").trim().slice(0, 160);
    const limit = Math.max(1, Math.min(25, Number(input.limit) || 10));

    if (!businessType || !location) return json({ error: "Business type and location are required." }, 400);

    const query = [
      businessType,
      location,
      keywords,
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
        return json({ error: "Tavily rejected the API key. Check the TAVILY_API_KEY secret." }, 502);
      }
      if (response.status === 429) {
        return json({ error: "Tavily rate limit or free-credit limit reached. Try again after the limit resets." }, 429);
      }
      return json({ error: `Tavily search failed (${response.status}).` }, 502);
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
      const phone = extractPublicPhone(combined);
      const email = extractPublicEmail(combined);
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { host = ""; }

      leads.push({
        id: crypto.randomUUID(),
        name: title,
        company: title,
        phone,
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
    });
  } catch (error) {
    console.error("Lead search failed:", error);
    return json({ error: error instanceof Error ? error.message : "Lead search failed." }, 500);
  }
});
