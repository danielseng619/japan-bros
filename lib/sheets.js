import { createSign } from 'node:crypto';
let cachedToken;
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
export function normalizePrivateKey(input) {
  let key = String(input || '').trim();
  try {
    const parsed = JSON.parse(key.replace(/,\s*$/, ''));
    if (typeof parsed === 'string') key = parsed;
    else if (typeof parsed?.private_key === 'string') key = parsed.private_key;
  } catch {}
  key = key.replace(/\\+r\\+n/g, '\n').replace(/\\+n/g, '\n').replace(/\r/g, '');
  const pem = key.match(/-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!pem) return key;
  const body = pem[2].replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return key;
  return `-----BEGIN ${pem[1]}-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END ${pem[1]}-----\n`;
}
async function googleToken(env, request) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  let email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim().replace(/^["']|["'],?$/g, '');
  try {
    const bundle = JSON.parse(env.GOOGLE_PRIVATE_KEY);
    if (typeof bundle.client_email === 'string') email = bundle.client_email.trim();
  } catch {}
  const key = normalizePrivateKey(env.GOOGLE_PRIVATE_KEY);
  if (!email || !key) throw new Error('SHEETS_NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(body).sign(key, 'base64url');
  const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${signature}` }), signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const description = String(failure.error_description || '');
    // Classify locally; never expose Google's raw response or credential values.
    if (/invalid jwt signature/i.test(description)) throw new Error('SHEETS_AUTH_SIGNATURE');
    if (/account not found|invalid email|invalid issuer/i.test(description)) throw new Error('SHEETS_AUTH_ACCOUNT');
    throw new Error('SHEETS_AUTH');
  }
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
