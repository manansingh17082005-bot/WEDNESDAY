# WEDNESDAY AI — Implementation Roadmap

**Product direction:** Complete personal AI assistant and future commercial product.  
**Design direction:** Professional dark futuristic command center.  
**Build strategy:** Extend the existing GitHub Pages frontend and Supabase backend. Do not replace the project.

## Phase 1 — Stabilise the existing product (current)
- [x] Inspect the existing frontend, CRM, lead discovery and Supabase function.
- [ ] Repair malformed source text in the lead-discovery function and frontend.
- [ ] Ensure the HTML page is valid browser HTML.
- [ ] Keep dashboard lead counts in sync with search results.
- [ ] Verify Excel export and lead-to-CRM handoff.
- [ ] Deploy the repaired Supabase Edge Function and smoke-test it.

## Phase 2 — Lead generation + Excel
- [ ] Improve query construction for business type, city, service and contact intent.
- [ ] Keep source URLs and evidence snippets on every result.
- [ ] Label phone, email and WhatsApp data by evidence; never infer WhatsApp from an ordinary phone number.
- [ ] Deduplicate by normalized business name, domain and phone where available.
- [ ] Export Lead List and Search Summary sheets with filters and useful column widths.
- [ ] Add CSV export fallback if the Excel library is unavailable.

## Phase 3 — CRM pipeline
- [ ] Add editable pipeline status, follow-up date and notes.
- [ ] Add filters for status and overdue follow-ups.
- [ ] Prevent duplicate imports and preserve source/search metadata.
- [ ] Add safe WhatsApp draft links; never auto-send messages.
- [ ] Add backup/export and import for locally stored CRM records.

## Phase 4 — AI command routing
- [ ] Parse natural-language requests into explicit app actions.
- [ ] Route lead searches to lead discovery, report requests to Excel, and follow-up requests to CRM.
- [ ] Show a preview and ask for approval before consequential changes.
- [ ] Keep normal assistant chat available when no action is requested.

## Phase 5 — Specialist characters
- [ ] Himawari: Excel, data cleaning, formulas and reports.
- [ ] Shiro: planning, reminders and productivity.
- [ ] Shinchan: general assistant, coding and troubleshooting.

## Phase 6 — Voice and automation
- [ ] Improve voice controls and browser permission handling.
- [ ] Add clear listening/thinking/speaking states.
- [ ] Require confirmation for sending, deleting or external actions.
- [ ] Keep WhatsApp sending manual unless an approved official Business API is configured.

## Phase 7 — Commercial readiness
- [ ] Move important CRM data from browser-only storage to authenticated cloud storage.
- [ ] Add tenant isolation, access controls and server-side validation.
- [ ] Add usage limits, billing and plan management only after core reliability.
- [ ] Add audit history, privacy controls and backup/restore.

## Release checklist
- [ ] Frontend loads on desktop and mobile.
- [ ] Login and logout work.
- [ ] Lead search returns source-backed results or a clear error.
- [ ] Excel downloads with correct fields.
- [ ] Selected leads can be added to CRM without duplicates.
- [ ] CRM edits survive refresh.
- [ ] No API secret is exposed in frontend code.
