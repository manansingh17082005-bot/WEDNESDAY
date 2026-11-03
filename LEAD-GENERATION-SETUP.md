# WEDNESDAY Live Lead Generation Setup (Tavily)

The GitHub Pages interface calls a secure Supabase Edge Function. The Tavily API key stays on the server and must never be added to `config.js`, `app.js`, or any browser file.

## 1. Create a free Tavily account

1. Open https://app.tavily.com/ (or https://tavily.com/ and choose Get Started).
2. Create your account and open the API key/dashboard section.
3. Copy your Tavily API key. Keep it private.
4. The current Researcher free plan includes 1,000 API credits per month and does not require a credit card. A basic search request costs 1 credit. Check your account's current plan and usage before running searches.

## 2. Add the key to Supabase as a server-side secret

1. Open the WEDNESDAY Supabase project: https://supabase.com/dashboard/project/bdidzrlljkkssamzahxz
2. Open **Edge Functions** → **Secrets** (or Project Settings → Edge Functions → Secrets).
3. Add a secret named exactly `TAVILY_API_KEY`.
4. Paste the Tavily key as its value and save.
5. Do not add the key to GitHub, `config.js`, `app.js`, or the website Settings page.

Supabase secret instructions: https://supabase.com/docs/guides/functions/secrets

## 3. Deploy the updated lead-discovery function

The repository function has been updated to use Tavily Basic Search. It makes one basic search request per lead search to conserve the free allowance.

1. In the Supabase project, open **Edge Functions**.
2. Choose **Deploy a new function** → **Via Editor**, or open the existing `lead-discovery` function to edit it.
3. The function name must be exactly `lead-discovery`.
4. Copy the complete current code from:
   https://github.com/manansingh17082005-bot/WEDNESDAY/blob/main/supabase/functions/lead-discovery/index.ts
5. Paste it into the Supabase editor and deploy.
6. Keep JWT verification enabled. The website invokes the function as a signed-in user.

Supabase dashboard deployment guide: https://supabase.com/docs/guides/functions/quickstart-dashboard

## 4. Sign in to WEDNESDAY

1. In Supabase, open **Authentication** → **Users**.
2. If you do not already have an owner user, choose **Add user** and create your own email/password.
3. Sign in to WEDNESDAY using that account if the sign-in flow is enabled in your current build.
4. Do not enable public sign-ups for this private owner workspace.

## 5. Run a small test search

1. Open **Lead Generation**.
2. Choose a service, business type, and location (for example, Cafes in Noida).
3. Set the result limit to 5 for your first test.
4. Click **Find Real Leads**.
5. Review each public result and select records to add to **Client CRM**.

Tavily web search is not a dedicated Google Maps/Places directory. It may return business websites, directories, social pages, and articles. Phone numbers or emails are extracted only when present in the returned public content; missing details remain blank. Search results do not prove that a business is newly opened, wants your service, or has budget. Verify every business and contact before outreach.

## WhatsApp outreach

With a regular personal WhatsApp number, WEDNESDAY can prepare a message and open the WhatsApp chat with the draft prefilled. You must review and press **Send** yourself. Official background sending from the same personal WhatsApp Messenger account is not supported in this setup.
