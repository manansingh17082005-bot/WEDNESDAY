# WEDNESDAY — Personal AI & Business Growth Workspace

WEDNESDAY is a local-first business operating workspace for freelance services and creative-agency work. It helps discover public business prospects, organise a sales pipeline, prepare outreach for human approval and track income.

## Business upgrade in this branch

- **Business Hub:** sales preferences, opportunity pipeline, follow-up dates, income/expense ledger, pending payments and revenue summary.
- **Freelance + agency model:** Excel/data entry, data analysis, dashboards, video editing, websites, social media management, logo design and combined creative packages.
- **India + international targeting:** choose a market and provide the relevant city/country in Lead Generation.
- **Outreach approval queue:** save a prepared message for review, copy it, then send it yourself. WEDNESDAY does not send messages automatically.
- **Lead search context:** selected services, target market and business model are passed to the lead-discovery function.
- Existing companion experience, local AI assistant, lead export, CRM, WhatsApp draft workflow and Dashboard Studio are retained.

## Important storage limitation

The Business Hub and CRM now support Supabase cloud sync for opportunities, transactions, outreach approvals and client records after sign-in and migration setup. Browser local storage remains the offline-first fallback. The Business Hub preference selectors and existing tasks remain browser-local. Cloud sync merges local and cloud records by ID and propagates deletions after a successful sync. Use **Export backup** regularly and keep backups private.

Dashboard Studio processes spreadsheet data in the browser. Avoid importing sensitive client or financial information on a shared computer.

## Lead discovery setup

Live search requires:
1. A Supabase project and the existing WEDNESDAY owner login.
2. The `lead-discovery` Edge Function deployed to that project.
3. The function's JWT verification setting left enabled.
4. Supabase Edge Function secrets:
   - `TAVILY_API_KEY` — your Tavily API key.
   - `WEDNESDAY_OWNER_USER_ID` — the UUID of the one owner account allowed to search.
5. The standard Supabase Edge Function environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`, which Supabase provides in its hosted runtime.

Find the owner UUID in Supabase Dashboard → Authentication → Users → select the owner user and copy the user ID. Store it as the `WEDNESDAY_OWNER_USER_ID` function secret. Never put the Tavily key, service-role key or other server secrets into frontend JavaScript.

The function validates the bearer token against Supabase Auth and checks the authenticated user ID against the owner allowlist. It restricts browser origins to the GitHub Pages site and localhost preview. If you use a different deployment origin, update the allowlist in `supabase/functions/lead-discovery/index.ts`.

Deploy the function from your local Supabase CLI setup after linking the correct project, for example:

\`\`\`bash
supabase functions deploy lead-discovery
\`\`\`

Do not disable JWT verification. If your Supabase project has no Tavily secret or owner UUID configured, live lead search will return a setup error until those values are added.

Tavily searches public web pages. It does not grant access to private or logged-in LinkedIn, Instagram, Facebook or other restricted accounts. Results are prospects to verify, not proof that a business needs your service or that a contact detail belongs to its owner.

## Business Hub database migration (optional preparation)

The `supabase-business-hub-schema.sql` migration extends the existing CRM table with company, phone and email fields and creates owner-scoped opportunities, transactions and outreach-approval tables with row-level security. Run it in Supabase SQL Editor only after the base `supabase-schema.sql`. The frontend `business-cloud-sync.js` uses the signed-in Supabase session and the public browser key; no service-role key is needed or permitted in the browser.

## AI and hosting limitations

- The current assistant uses Ollama at `http://localhost:11434`; it works only when Ollama is running on the same computer as the browser.
- GitHub Pages cannot run the owner's local Ollama for visitors or other devices.
- A hosted AI provider would require a secure server-side function and may have usage charges. Keep the initial build on existing free/local components.
- Personal WhatsApp remains a manual workflow: WEDNESDAY opens a prefilled draft; you review and press Send yourself. Only contact people through channels and under rules that permit the outreach.

## Local preview

\`\`\`bash
python -m http.server 8000
\`\`\`

Open `http://localhost:8000`.

## Security and operating rules

- Keep Supabase service-role keys, AI-provider secrets, Tavily keys and messaging tokens server-side.
- Keep Supabase Edge Function JWT verification enabled.
- Keep public signups disabled for a private owner-only workspace.
- Review public lead details before outreach and honour opt-outs.
- Obtain required consent before business-initiated WhatsApp messages.
- External actions, messages, payments and deletions require explicit user approval.

## Deployment

The frontend is published through GitHub Pages. Supabase provides authentication and the server-side lead-search function. Business Hub and CRM sync to Supabase when the migration has been run and the owner is signed in; local storage remains the offline fallback. Tasks and business preference settings remain local-only.
