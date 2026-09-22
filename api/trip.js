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
      return res.status(503).json({ error: configured ? 'The trip sheet is temporarily unavailable. Please retry.' : 'The private Google Sheets connection needs to be configured in Vercel.' });
    }
  };
}
export default createHandler();
