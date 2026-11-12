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

function isIndiaLocation(location: string): boolean {
  return /\bindia\b|noida|greater noida|delhi|gurugram|gurgaon|ghaziabad|faridabad|meerut|lucknow|kanpur|jaipur|mumbai|pune|bengaluru|bangalore|hyderabad|chennai|kolkata|ahmedabad|surat|agra|chandigarh/i.test(location);
}

function extractPublicPhone(text: string, location: string): string {
  const cleaned = text.replace(/&nbsp;|&#160;/gi, " ");
  const india = cleaned.match(/(?:\+91|0091|91[\s().-]?)([6-9]\d{9})(?!\d)/);
  if (india) return `+91 ${india[1]}`;
  if (isIndiaLocation(location)) {
    const local = cleaned.match(/(?:^|\D)([6-9]\d{9})(?!\d)/);
    if (local) return `+91 ${local[1]}`;
  }
  const labelled = cleaned.match(/(?:phone|telephone|mobile|call|contact|tel)\s*(?:number)?\s*[:：-]?\s*(\+?\d[\d\s().-]{7,18}\d)/i);
  if (labelled) {
    const digits = labelled[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  }
  const international = cleaned.match(/(?:\+|00)\s*(\d[\d\s().-]{7,17}\d)/);
  if (international) {
    const digits = international[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  }
  return "";
}

function extractPublicEmail(text: string): string {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function extractPublicWhatsApp(text: string): string {
  const patterns = [
    /(?:https?:\/\/)?(?:api\.)?wa\.me\/(?:send\/)?([0-9]{8,15})/i,
    /api\.whatsapp\.com\/send\?[^\s"'<>]*phone=([0-9]{8,15})/i,
    /whatsapp[^\n]{0,100}?(?:phone|number|tel)[^0-9]{0,12}(\+?[0-9][0-9\s().-]{7,17}[0-9])/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = match[1].replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 15) return digits;
    }
  }
  return "";
}

function cleanName(title: string, content = "", url = ""): string {
  const generic = /^(home|homepage|contact us|contact|about us|about|official website|welcome|login|sign in|menu|services|search results?)$/i;
  const candidates = [
    title.split("|")[0].trim(),
    title.replace(/^\s*(?:home|homepage|contact us|about us)\s*[-–—:]\s*/i, "").trim(),
    content.match(/(?:business|company|organisation|organization|brand)\s*name\s*[:：-]\s*([^\n|]{2,100})/i)?.[1]?.trim() || ""
  ];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/\s*[-–—:]\s*(?:official website|home|contact us|about us|welcome).*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim().slice(0, 120);
    if (cleaned && !generic.test(cleaned) && cleaned.length > 2) return cleaned;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    if (host && !/^(google|facebook|instagram|linkedin|justdial|youtube|wikipedia)$/i.test(host)) {
      return host.replace(/[-_]+/g, " ").replace(/\b\w/g, x => x.toUpperCase()).slice(0, 120);
    }
  } catch (_) {}
  return "Business name not verified";
}


function scoreProspect(
  text: string,
  service: string,
  phone: string,
  email: string,
  whatsapp: string,
  url: string,
  providerScore: number,
) {
  const lower = text.toLowerCase();
  const serviceSignals: Record<string, string[]> = {
    "Excel Reporting & Dashboards": ["excel reporting", "excel dashboard", "inventory report", "sales report", "microsoft excel", "management report"],
    "Google Sheets Automation": ["google sheets", "spreadsheet automation", "automate spreadsheets", "shared tracker", "google spreadsheet"],
    "Excel / Data Entry": ["data entry", "spreadsheet cleanup", "excel data entry", "manual data entry", "records entry"],
    "Video Editing": ["video editor", "video editing", "promotional video", "reels editor", "short-form video"],
    "Website Development": ["website redesign", "web development", "online booking website", "website under construction", "web developer", "ecommerce website"],
    "Social Media Management": ["social media management", "social media manager", "instagram content", "content calendar", "social media marketing"],
    "Data Analysis": ["data analysis", "business analytics", "data analyst", "business intelligence", "analytics dashboard"],
    "Logo Design": ["logo design", "brand identity", "rebrand", "branding design"],
    "Cafe & Restaurant Marketing": ["restaurant marketing", "cafe marketing", "social media for restaurants", "menu promotion", "food photography"],
    "CINE AI 2D Animation": ["2d animation", "animated promo", "motion graphics", "animated explainer", "promotional animation"],
  };
  const opportunitySignals: Record<string, string[]> = {
    "Excel Reporting & Dashboards": ["manual reporting", "spreadsheet errors", "inventory reporting", "sales reporting takes", "reporting takes hours", "excel dashboard required"],
    "Google Sheets Automation": ["manual tracking", "repetitive spreadsheet", "spreadsheet errors", "manual data entry", "shared tracker"],
    "Excel / Data Entry": ["manual data entry", "data entry backlog", "spreadsheet cleanup", "records backlog", "manual records"],
    "Video Editing": ["product launch", "new location", "opening soon", "promotional video", "video editor required", "reels editor"],
    "Website Development": ["website under construction", "website coming soon", "no website", "outdated website", "broken website", "website not working", "new location", "online booking"],
    "Social Media Management": ["opening soon", "newly opened", "grand opening", "new location", "irregular posting", "inactive instagram", "no recent posts", "last post"],
    "Data Analysis": ["manual reporting", "reporting delays", "performance dashboard", "sales reporting", "data dashboard", "reporting takes hours"],
    "Logo Design": ["new brand", "rebrand", "opening soon", "new business launch", "brand identity"],
    "Cafe & Restaurant Marketing": ["opening soon", "newly opened", "grand opening", "new menu", "new location", "launching soon", "restaurant promotion"],
    "CINE AI 2D Animation": ["product launch", "new product", "promotional animation", "launching soon", "explainer video", "new location"],
  };
  const buyerSignals = [
    "looking for a freelancer", "seeking a freelancer", "need a freelancer", "freelancer required",
    "looking for an agency", "seeking an agency", "marketing agency required", "agency required",
    "website developer required", "looking for a web developer", "need a website developer",
    "excel expert required", "looking for an excel expert", "data analyst required",
    "looking for a social media manager", "social media manager required", "need social media management",
    "looking for a video editor", "video editor required", "need a video editor",
    "logo designer required", "looking for a logo designer", "animation project", "animator required",
    "request for proposal", "vendor wanted", "seeking service provider",
  ];
  const matchedTerms = (serviceSignals[service] || []).filter(term => lower.includes(term));
  const buyerHits = buyerSignals.filter(term => lower.includes(term));
  const opportunityHits = (opportunitySignals[service] || []).filter(term => lower.includes(term));
  const websiteGapHits = ["no website", "website under construction", "website coming soon", "outdated website", "broken website", "website not working", "site not working"].filter(term => lower.includes(term));
  const weakSocialHits = ["inactive instagram", "inactive social", "irregular posting", "no recent posts", "last post"].filter(term => lower.includes(term));

  const reasons: string[] = [];
  let score = Math.round(Math.max(0, Math.min(1, providerScore)) * 10);
  if (matchedTerms.length) {
    score += 25;
    reasons.push("Service fit: " + matchedTerms.slice(0, 2).map(term => '"' + term + '"').join(", "));
  }
  if (buyerHits.length) {
    score += Math.min(35, 25 + (buyerHits.length - 1) * 5);
    reasons.push("Buying signal: " + buyerHits.slice(0, 2).map(term => '"' + term + '"').join(", "));
  }
  if (opportunityHits.length) {
    score += Math.min(20, 12 + (opportunityHits.length - 1) * 4);
    reasons.push("Business need or growth signal: " + opportunityHits.slice(0, 3).map(term => '"' + term + '"').join(", "));
  }
  const hasContact = Boolean(phone || email || whatsapp);
  if (hasContact) {
    score += 10;
    reasons.push("A public contact detail appears on this source; confirm it belongs to the business.");
  }
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch (_) {}
  const directoryHost = /(^|\.)(google|facebook|instagram|linkedin|justdial|youtube|wikipedia|yelp|tripadvisor|sulekha|indiamart)\./i.test(hostname);
  if (hostname && !directoryHost) {
    score += 5;
    reasons.push("Direct website source; verify the business identity.");
  }
  const scoreValue = Math.max(0, Math.min(100, score));
  const tier = scoreValue >= 75 ? "High research priority" : scoreValue >= 55 ? "Medium research priority" : "Low research priority";
  return {
    score: scoreValue,
    tier,
    reasons,
    matchedServices: matchedTerms.length ? [service] : [],
    matchedTerms,
    buyerHits,
    opportunityHits,
    websiteGapHits,
    weakSocialHits,
    eligible: matchedTerms.length > 0 && (buyerHits.length > 0 || opportunityHits.length > 0),
  };
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
    const limit = Math.max(1, Math.min(20, Number(input.limit) || 10));

    if (!businessType || !location) return json({ error: "Business type and location are required." }, 400, origin);
    if (services.length !== 1) return json({ error: "Choose exactly one service per search so Wednesday can find a focused match." }, 400, origin);

    const service = services[0];
    const serviceIntents: Record<string, string> = {
      "Excel Reporting & Dashboards": "Excel dashboards inventory and sales reports manual reporting",
      "Google Sheets Automation": "Google Sheets automation shared trackers repetitive manual tracking",
      "Excel / Data Entry": "Excel data entry spreadsheet cleanup manual records workload",
      "Video Editing": "promotional video editing reels short-form video product launch",
      "Website Development": "website redesign broken outdated website online booking coming soon",
      "Social Media Management": "social media management Instagram content calendar new business launch",
      "Data Analysis": "business data analysis reporting delays dashboards performance reports",
      "Logo Design": "logo design brand identity rebranding new business launch",
      "Cafe & Restaurant Marketing": "cafe restaurant marketing grand opening new menu local promotions",
      "CINE AI 2D Animation": "2D animated promotional video motion graphics product launch explainer",
    };
    if (!serviceIntents[service]) return json({ error: "Choose a service from the list." }, 400, origin);
    const serviceIntent = serviceIntents[service];
    const query = [
      `"${businessType}"`,
      location,
      serviceIntent,
      keywords,
      sources.length ? `public business listings from ${sources.join(" ")}` : "",
      prioritiseNoWebsite ? "business with no website website under construction outdated site" : "",
      prioritiseWeakSocial ? "business with inactive Instagram irregular posting no recent posts" : "",
      prioritisePublicContact ? "official business contact phone or email" : "",
      market === "international" ? "business" : market === "india" ? "business in India" : "",
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const sourceDomains: Record<string, string[]> = {
      "Google Maps": ["google.com"], Instagram: ["instagram.com"], Facebook: ["facebook.com"],
      LinkedIn: ["linkedin.com"], Justdial: ["justdial.com"],
    };
    const includeDomains = [...new Set(sources.flatMap(source => sourceDomains[source] || []))];

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
        ...(includeDomains.length ? { include_domains: includeDomains, include_domains_mode: "prefer" } : {}),
        ...(market === "india" ? { country: "india" } : {}),
        include_answer: false,
        include_raw_content: true,
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
    let screenedCount = 0;

    for (const item of (data.results || [])) {
      const rawTitle = String(item.title || "");
      const url = String(item.url || "");
      const content = String(item.raw_content || item.content || "");
      if (!rawTitle || !url || !/^https?:\/\//i.test(url)) continue;
      const title = cleanName(rawTitle, content, url);

      const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const combined = `${title} ${content} ${url}`;
      const phone = extractPublicPhone(combined, location);
      const email = extractPublicEmail(combined);
      const whatsappNumber = extractPublicWhatsApp(combined);
      const providerScore = Number(item.score) || 0;
      const qualification = scoreProspect(combined, service, phone, email, whatsappNumber, url, providerScore);
      screenedCount++;
      if (!qualification.eligible) continue;
      if (prioritisePublicContact && !phone && !email && !whatsappNumber) continue;
      if (prioritiseNoWebsite && !qualification.websiteGapHits.length) continue;
      if (prioritiseWeakSocial && !qualification.weakSocialHits.length) continue;
      if (qualification.score < 45) continue;
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { host = ""; }

      leads.push({
        id: crypto.randomUUID(),
        name: title,
        company: title,
        phone,
        whatsappNumber,
        whatsappLink: whatsappNumber ? `https://wa.me/${whatsappNumber}` : "",
        whatsappStatus: whatsappNumber ? "Public WhatsApp link found" : phone ? "Public phone found; WhatsApp not verified" : "Not found / not verified",
        email,
        address: "",
        website: url,
        source: host ? `Tavily · ${host}` : "Tavily Web Search",
        snippet: content.slice(0, 1200),
        searchQuery: query,
        status: "Needs review",
        contactVerified: false,
        publicContactFound: Boolean(phone || email || whatsappNumber),
        openingDateVerified: false,
        priorityScore: qualification.score,
        priorityTier: qualification.tier,
        qualificationReasons: qualification.reasons,
        matchedServices: qualification.matchedServices,
        matchedEvidence: qualification.matchedTerms,
        providerRelevanceScore: Math.round(providerScore * 100),
      });
      if (leads.length >= limit) break;
    }

    leads.sort((a, b) => {
      const scoreDifference = Number((b as Record<string, unknown>).priorityScore || 0) - Number((a as Record<string, unknown>).priorityScore || 0);
      return scoreDifference || Number((b as Record<string, unknown>).providerRelevanceScore || 0) - Number((a as Record<string, unknown>).providerRelevanceScore || 0);
    });

    return json({
      leads,
      searchedQueries: [query],
      resultCount: leads.length,
      screenedCount,
      provider: "Tavily",
      qualityRule: "A result must match the selected service and contain a public buying, need, or growth signal. When requested, it must also expose a public contact and evidence for the selected website/social filter.",
      creditsNote: "One basic Tavily search request was used. Scores rank evidence for review; they are not hiring probabilities. Public text does not prove budget, owner intent, contact ownership, or that a business will respond. Check the source before outreach.",
    }, 200, origin);
  } catch (error) {
    console.error("Lead search failed:", error);
    return json({ error: error instanceof Error ? error.message : "Lead search failed." }, 500, origin);
  }
});
