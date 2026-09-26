import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrip, dateKey, mapsFor, safeMaps } from '../lib/trip.js';
import { createHandler } from '../api/trip.js';
const sheet = (title, rows) => ({ properties: {title}, data: [{rowData: rows.map(row=>({values:row.map(v=>typeof v==='object'?v:{formattedValue:v})}))}] });
const fixture = title => ({sheets:[
  sheet('START HERE', [['Banner'],['Date','Main Plan','Main Area','Base / Stay','Status','Notes'],['24/12/2026',title,'Wakayama','Osaka','Planning','SECRET-BOOKING']]),
  sheet('ITINERARY', [['Date','Time','Area','Plan / Activity','Travel / Route','Google Maps','Notes','Booking Ref'],['24/12/2026','10:00','Wakayama',title,'Osaka → Wakayama','','SECRET-NOTES','SECRET-REF'],['24/12/2026','08:00','Osaka','Wake up / get ready','',''],['25/12/2026','','','','','']])
]});
test('summary and detailed rows omit blanks and private columns',()=>{
  const data=parseTrip(fixture('Wakayama day'));
  assert.equal(data.days.length,1);assert.equal(data.days[0].activities.length,2);
  assert.equal(data.days[0].title,'Wakayama day');
  assert.equal(data.days[0].activities[1].maps,null);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
});
test('dates are locale explicit and validated',()=>{
  assert.equal(dateKey('01/01/2027'),'2027-01-01');assert.equal(dateKey('31/02/2026'),null);
  assert.equal(dateKey('01/02/2026'),'2026-02-01');assert.equal(dateKey('not a date'),null);
});
test('maps preserve hyperlinks and formulas and reject malicious URLs',()=>{
  const url='https://www.google.com/maps/search/?api=1&query=Nara';
  assert.equal(mapsFor({hyperlink:url},'Nara','','').source,'sheet');
  assert.equal(mapsFor({userEnteredValue:{formulaValue:`=HYPERLINK("${url}","Maps")`}},'Nara','','').url,url);
  for(const bad of ['javascript:alert(1)','https://www.google.com.evil.test/maps/','https://evil.test','https://user:pass@google.com/maps/']) assert.equal(safeMaps(bad),null);
  assert.equal(new URL(mapsFor({},'Travel','Osaka','Osaka → Kyoto').url).searchParams.get('destination'),'Kyoto');
});
const response = () => ({headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.code=s;return this},json(data){this.body=data;return this}});
test('refresh rereads Sheets without redeploy and sends no-store',async()=>{
  let current='Original plan', calls=0;
  const handler=createHandler(async()=>{calls++;return fixture(current)});
  const first=response(); await handler({method:'GET'},first);
  current='Edited in Sheet'; const second=response(); await handler({method:'GET'},second);
  assert.equal(calls,2);assert.equal(first.body.days[0].title,'Original plan');
  assert.equal(second.body.days[0].title,'Edited in Sheet');assert.match(second.headers['Cache-Control'],/no-store/);
});
test('errors hide secrets and unsupported writes are rejected',async()=>{
  const handler=createHandler(async()=>{throw new Error('private-key booking-SECRET')});
  const res=response();await handler({method:'GET'},res);
  assert.equal(res.code,503);assert.ok(!JSON.stringify(res.body).includes('SECRET'));
  const post=response();await handler({method:'POST'},post);assert.equal(post.code,405);
});
test('missing headers fail visibly instead of static fallback',()=>assert.throws(()=>parseTrip({sheets:[]}),/SCHEMA/));

test('private Google reader uses read-only JWT, fresh reads and narrow columns',async()=>{
  const {generateKeyPairSync}=await import('node:crypto');
  const {readSheets}=await import('../lib/sheets.js');
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.invalid',GOOGLE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),GOOGLE_SHEET_ID:'test-sheet'};
  let tokenCalls=0, reads=0;
  const request=async(url,options)=>{
    if(String(url).includes('oauth2')){
      tokenCalls++;
      const claims=JSON.parse(Buffer.from(options.body.get('assertion').split('.')[1],'base64url'));
      assert.equal(claims.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');
      return {ok:true,json:async()=>({access_token:'test-token',expires_in:3600})};
    }
    reads++;
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.equal(options.cache,'no-store');
    assert.deepEqual(url.searchParams.getAll('ranges'),["'ITINERARY'!A:G","'START HERE'!A:F"]);
    return {ok:true,json:async()=>fixture('Live '+reads)};
  };
  const a=parseTrip(await readSheets(env,request)),b=parseTrip(await readSheets(env,request));
  assert.equal(tokenCalls,1);assert.equal(reads,2);assert.notEqual(a.days[0].title,b.days[0].title);
});

test('normalizes copied PEM, quoted JSON and escaped line breaks without changing key bytes',async()=>{
  const {generateKeyPairSync,createPrivateKey}=await import('node:crypto');
  const {normalizePrivateKey}=await import('../lib/sheets.js');
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=privateKey.export({type:'pkcs8',format:'pem'});
  const samples=[pem,JSON.stringify(pem),JSON.stringify({private_key:pem}),pem.replace(/\n/g,'\\n'),pem.replace(/\n/g,'\\\\n'),'"'+pem.replace(/\n/g,'\\n')+'",'];
  for(const sample of samples) assert.equal(createPrivateKey(normalizePrivateKey(sample)).export({type:'pkcs8',format:'pem'}),pem);
});
