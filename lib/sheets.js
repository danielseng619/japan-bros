import { createSign } from 'node:crypto';
let cachedToken;
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
async function googleToken(env, request) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('SHEETS_NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(body).sign(key, 'base64url');
  const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${signature}` }), signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error('SHEETS_AUTH');
  const token = await response.json();
  if (!token.access_token) throw new Error('SHEETS_AUTH');
  cachedToken = { value: token.access_token, expires: Date.now() + Math.min(token.expires_in || 3600, 3600) * 1000 };
  return token.access_token;
}
export async function readSheets(env = process.env, request = fetch) {
  const token = await googleToken(env, request);
  const id = env.GOOGLE_SHEET_ID;
  if (!id || !/^[\w-]+$/.test(id)) throw new Error('SHEETS_NOT_CONFIGURED');
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}`);
  url.searchParams.append('ranges', "'ITINERARY'!A:G");
  url.searchParams.append('ranges', "'START HERE'!A:F");
  url.searchParams.set('fields', 'sheets(properties(title),data(rowData(values(formattedValue,hyperlink,userEnteredValue,textFormatRuns(format(link))))))');
  const response = await request(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('SHEETS_UNAVAILABLE');
  return response.json();
}
