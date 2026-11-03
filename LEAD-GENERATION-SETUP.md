# WEDNESDAY Live Lead Generation Setup

The GitHub Pages interface is connected to a secure Supabase Edge Function. The search provider key stays on the server and must never be added to `config.js`, `app.js`, or any other browser file.

## 1. Create a search-provider key

1. Open https://serper.dev/ and create an account.
2. Copy your API key from the Serper dashboard.
3. The provider currently advertises 2,500 free search queries without a credit card. Check its current terms and balance before use.

## 2. Add the key to Supabase (server-side secret)

1. Open the WEDNESDAY Supabase project: https://supabase.com/dashboard/project/bdidzrlljkkssamzahxz
2. Open **Edge Functions**.
3. Open **Secrets** (or the Edge Function Secrets page).
4. Add a secret named `SERPER_API_KEY`.
5. Paste the Serper key as its value and save.
6. Never paste this key into GitHub or the website's Settings page.

Supabase secret instructions: https://supabase.com/docs/guides/functions/secrets

## 3. Deploy the lead-discovery function

1. In the Supabase project, open **Edge Functions**.
2. Choose **Deploy a new function** → **Via Editor**.
3. Name the function exactly `lead-discovery`.
4. Open this repository file and copy its complete contents into the editor:
   https://github.com/manansingh17082005-bot/WEDNESDAY/blob/main/supabase/functions/lead-discovery/index.ts
5. Deploy the function.
6. Keep JWT verification enabled (the default). The website invokes it as a signed-in user.

Supabase dashboard deployment guide: https://supabase.com/docs/guides/functions/quickstart-dashboard

## 4. Sign in to WEDNESDAY

The live search function is protected and requires a Supabase Auth user session.

1. In Supabase, open **Authentication** → **Users**.
2. If you do not already have an owner user, choose **Add user** and create your own email/password.
3. Open https://manansingh17082005-bot.github.io/WEDNESDAY/ and sign in using that account.

Do not enable public sign-ups for this private owner workspace.

## 5. Run a search

1. Open **Lead Generation**.
2. Choose your service, such as Social Media Management.
3. Enter a business type and location, such as Cafes and Noida.
4. Choose your search sources and a maximum of 25.
5. Click **Find Real Leads**.
6. Review each public listing and select the records to add to **Client CRM**.

The Places search can return public business names and available phone numbers. Web results can add relevant business pages and social links. A missing phone/email remains blank; WEDNESDAY does not invent it. Search results do not prove that a business is newly opened, wants your service, or has budget. Verify those details before contacting anyone.

## WhatsApp outreach

Outreach Studio can select a saved CRM record, prepare a personalized draft, and open the WhatsApp chat with the message prefilled. With a regular personal WhatsApp number, you must review and press **Send** yourself. Background or bulk sending is not supported through the official personal WhatsApp app.
