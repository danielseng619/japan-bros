# Japan Bros 🇯🇵
Mobile-first trip dashboard with live Google Sheets data. The existing dark card layout and Today / Trip / Vote / Places / Money navigation are retained.

## Data flow
Every page load or Refresh button calls `GET /api/trip`. A Vercel Node function authenticates to Google using a read-only service account, reads ITINERARY A:G and START HERE A:F, and returns an explicit public field allowlist. START HERE supplies daily summaries; ITINERARY supplies activities in Sheet row order. Headers are detected by name; dates use day/month/year. Blank activity rows are skipped and malformed/missing headers return a visible error.

No itinerary is embedded at build time. No trip data is cached in the CDN, service worker, or browser storage. The only server cache is the short-lived Google access token. Refreshing after a Sheet edit requires no push or redeploy. A failed refresh retains the current in-memory view with a stale warning; an initial failure shows a retry state. Today uses Japan's calendar date and selects the next available trip day before departure.

## Private connection setup (one time)
1. Enable the Google Sheets API in your Google Cloud project. Create a dedicated service account without project-wide roles.
2. Share only the source spreadsheet with that service account as **Viewer**. Keep the spreadsheet private.
3. In the existing Japan Bros Vercel project, add these server-only environment variables to Production and the desired Preview environment:
   - `GOOGLE_SHEET_ID`: the source spreadsheet ID.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: the service account's email.
   - `GOOGLE_PRIVATE_KEY`: its PEM private key. Actual newlines and escaped `\n` are supported.
4. Deploy after adding the variables. Do not prefix them with `NEXT_PUBLIC_`, paste keys into source code, or commit service account JSON files.
5. Confirm `/api/trip` returns 200 and Today / Trip show the current Sheet.

The project uses the Other preset, `npm run build`, and `public` output, configured in vercel.json. No package dependencies or build-time Google credentials are required. Vercel deploys api/trip.js as a function separately from the public shell.

## Production acceptance check
After the connection is configured, edit an ordinary activity title in ITINERARY, refresh the app, and verify the change in Today and Trip's linked timeline. Restore the title and refresh again. No GitHub commit or Vercel redeploy should occur between these checks. Test a second browser refresh, a missing Maps cell, and a wake/rest row. Check API responses and downloaded assets for private fields.

## Privacy and Maps
Only date, time, area, activity, route, summary, base/stay, status, and Maps links are public. Notes, booking columns, owners, costs, and the FLIGHTS/STAYS/MONEY tabs are not read. Common labelled booking references in public text are redacted as an extra precaution. Unlabelled secrets cannot be reliably recognized: keep all credentials and booking references in private columns, never in activity titles, routes, summary text or map links. The app itself is public; use access protection if itinerary locations must also be private.

Existing Google Maps hyperlinks (including formulas and rich links) are preferred. Missing links use route directions or an activity/location search and are labelled “Find on Maps”; generated links are searches, not verified travel instructions. Wake/get-ready/rest rows may have no map. The source Sheet is not modified.

The old hardcoded Kobe poll and money totals are no longer presented as current Sheet data. Local votes remain stored but there is no active shared poll. Money directs users to the private workbook. Ask the trip uses the loaded itinerary.

## Verification
Run `npm test` and `npm run build` on Node 24. Tests cover refresh without redeployment, parsing, private-field filtering, dates, Maps handling, errors, and unsupported writes. Real-source inspection is performed locally; private workbook fixtures are not committed.
