# WEDNESDAY — Foundation Build

A responsive, installable web-app foundation for Windows, Android, iPhone and iPad.

## What's included
- Responsive command-center dashboard and navigation
- Local demo task list and client CRM interactions
- AI chat interface clearly marked as not connected
- Gmail / WhatsApp integration placeholders
- English coaching and personal-assistant sections
- Owner control / pause switch
- PWA manifest and service worker
- Supabase SQL schema with per-user Row Level Security

## Run locally
You can open `index.html` for a basic preview. For PWA/service-worker testing, serve the folder over localhost, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages
1. Create a new GitHub repository.
2. Upload the contents of this folder to the repository root.
3. In repository Settings → Pages, choose Deploy from a branch and select `main` / root.
4. Open the published Pages URL.

## Supabase next step
1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. Use the Project URL and public publishable/anon key in the Settings page.
4. The next implementation step will add the Supabase client, authentication and live connection test.

Never use a Supabase `service_role` key in browser code. Never put AI provider secrets, WhatsApp tokens, or Gmail client secrets in GitHub Pages.

## Current status
This is a functional front-end foundation, not yet a connected AI assistant. No email, WhatsApp, calendar, calling, or AI account is connected. The chat preview does not send your messages anywhere. Those integrations require secure backend functions and explicit account authorisation.

## WhatsApp
The official WhatsApp Business Platform requires a WhatsApp Business Account and supported setup. Personal WhatsApp does not have equivalent general-purpose API access. WEDNESDAY will keep these as separate integration paths and will not use unofficial QR/session scraping.

## Planned implementation order
1. Supabase authentication + live database connection test
2. Secure AI backend + conversational memory
3. Client CRM persistence and task/reminder persistence
4. Gmail OAuth integration
5. WhatsApp Business Cloud API integration
6. Personal WhatsApp supported options assessment
7. Calendar, voice, Android and iOS native integrations
