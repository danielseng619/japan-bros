import { readSheets } from '../lib/sheets.js';
import { parseTrip } from '../lib/trip.js';
export function createHandler(read = readSheets) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    try { return res.status(200).json(parseTrip(await read())); }
    catch (error) {
      // Never return upstream errors, tokens, keys, workbook data, or identifiers.
      const configured = error.message !== 'SHEETS_NOT_CONFIGURED';
      const known = ['SHEETS_NOT_CONFIGURED', 'SHEETS_AUTH', 'SHEETS_UNAVAILABLE', 'SHEET_SCHEMA', 'SHEET_EMPTY'];
      const code = known.includes(error.message) ? error.message :
        ['ERR_OSSL_UNSUPPORTED', 'ERR_OSSL_PEM_NO_START_LINE', 'ERR_OSSL_ASN1_WRONG_TAG', 'ERR_OSSL_ASN1_TOO_LONG'].includes(error.code) ? 'CREDENTIAL_FORMAT' : 'CONNECTION_ERROR';
      return res.status(503).json({ code, error: configured ? 'The trip sheet is temporarily unavailable. Please retry.' : 'The private Google Sheets connection needs to be configured in Vercel.' });
    }
  };
}
export default createHandler();
