# WEDNESDAY — Personal AI Command Center

WEDNESDAY is a responsive, installable web workspace for personal assistance, lead research, Excel work, client tracking and dashboard creation.

## Current modules
- Overview and task list
- AI assistant with Shinchan, Himawari and Shiro companion profiles
- Lead discovery through the secured Supabase Edge Function
- Client CRM and outreach draft tools
- WhatsApp reply drafting with manual user approval
- English coach and personal workspace
- **Dashboard Studio:** import Excel/CSV, detect numeric and category fields, create KPI cards, bar/line/doughnut charts, filter records, preview a data table, save dashboards in the browser and export workbook data

## Dashboard Studio
1. Open **Dashboard Studio** from the sidebar.
2. Import an .xlsx, .xls or .csv file.
3. Choose a numeric metric, category, KPI field and chart type.
4. Build the dashboard, apply a category filter, then save or export it.

The first worksheet is used for Excel files. The browser processes up to 10,000 rows in this version. Uploaded data and saved dashboard definitions stay in the current browser's local storage/session workflow; they are not uploaded to Supabase or shared across devices. Avoid importing sensitive personal or financial data on a shared computer.

## AI and hosting limitations
- The current chat engine uses Ollama at `http://localhost:11434`. This only works when Ollama is running on the same computer as the browser. A public GitHub Pages visitor cannot use the owner's local Ollama automatically.
- To make AI available to signed-in users on phones and other devices, connect a secure server-side AI provider through a Supabase Edge Function. Keep provider API keys in server secrets only.
- Live lead search requires owner authentication, a deployed `lead-discovery` Edge Function and the `TAVILY_API_KEY` server secret.
- Tavily searches public web pages; it does not grant direct logged-in access to private LinkedIn, Instagram, Facebook or other restricted accounts.
- Personal WhatsApp remains a manual, approval-based workflow. WEDNESDAY prepares a draft and opens WhatsApp; the user reviews and sends it.

## Local preview
For a simple local preview, run:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Security
- Never put a Supabase service-role key, AI provider secret, Tavily secret or WhatsApp token in frontend JavaScript.
- Keep Supabase Edge Function JWT verification enabled.
- Do not enable public signups for a private owner-only workspace.
- Review lead details before contacting a business.
- External actions such as sending messages, payments and deletion should require explicit approval.

## Deployment
The frontend is published with GitHub Pages from the repository root. Supabase provides authentication and server-side lead discovery. Dashboard Studio currently stores dashboard definitions locally in the browser; cloud sync and multi-user access are future work.
