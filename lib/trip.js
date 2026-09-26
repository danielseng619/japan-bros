// Only these named columns may reach the public app. Notes, owners, costs,
// booking references, and other workbook tabs are intentionally not returned.
const value = cell => String(cell?.formattedValue ?? cell?.effectiveValue?.stringValue ?? cell?.userEnteredValue?.stringValue ?? '').trim();
export function publicText(input) {
  return String(input || '').replace(/\b(?:(?:booking|confirmation|reservation|voucher|ticket)\s+(?:reference|ref|number|no|code|id)\.?|PNR|PIN|password|access code)\s*[:#=]?\s*[^\s;,]+/gi, '[private reference]').replace(/\b(?:booking|confirmation|reservation|voucher|ticket)\s*[:#=]\s*[^\s;,]+/gi, '[private reference]').slice(0, 1000);
}
export function dateKey(input) {
  const text = String(input || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
export function safeMaps(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (['maps.app.goo.gl', 'maps.google.com'].includes(url.hostname) ||
        (['google.com', 'www.google.com'].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
        (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/'))) return url.href;
  } catch {}
  return null;
}
export function mapsFor(cell, activity, area, route) {
  const formula = cell?.userEnteredValue?.formulaValue || '';
  const candidates = [cell?.hyperlink, ...(cell?.textFormatRuns || []).map(r => r.format?.link?.uri), value(cell), formula.match(/^=HYPERLINK\(\s*"([^"]+)"/i)?.[1]];
  for (const candidate of candidates) {
    const safe = safeMaps(candidate);
    if (safe) return { url: safe, source: 'sheet' };
  }
  if (/^(?:(?:hotel|hostel)\s+)?(?:wake(?:\s*up)?|get ready|rest|sleep|free time|pack(?:ing)?)(?:\b|\s|\/)/i.test(activity)) return null;
  const points = route.split(/\s*(?:→|->|⇒)\s*/).filter(Boolean);
  if (points.length >= 2) {
    const params = new URLSearchParams({ api: '1', origin: points[0], destination: points.at(-1) });
    if (points.length > 2) params.set('waypoints', points.slice(1, -1).join('|'));
    return { url: `https://www.google.com/maps/dir/?${params}`, source: 'generated' };
  }
  const query = [route || activity, area].filter(Boolean).join(' ');
  if (!query || /^(?:tbc|tbd|not planned|to be confirmed)$/i.test(query)) return null;
  return { url: `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`, source: 'generated' };
}
function table(sheet, required) {
  const rows = (sheet?.data || []).flatMap(block => block.rowData || []).map(row => row.values || []);
  const header = rows.findIndex(row => required.every(name => row.some(cell => value(cell).toLowerCase() === name.toLowerCase())));
  if (header < 0) throw new Error('SHEET_SCHEMA');
  const columns = new Map(rows[header].map((cell, i) => [value(cell).toLowerCase(), i]));
  return rows.slice(header + 1).map(row => name => row[columns.get(name.toLowerCase())]);
}
export function parseTrip(workbook) {
  const sheets = new Map((workbook.sheets || []).map(s => [s.properties?.title, s]));
  const summary = table(sheets.get('START HERE'), ['Date', 'Main Plan', 'Main Area', 'Base / Stay', 'Status']);
  const itinerary = table(sheets.get('ITINERARY'), ['Date', 'Time', 'Area', 'Plan / Activity', 'Travel / Route', 'Google Maps']);
  const days = new Map();
  const ensure = date => {
    if (!days.has(date)) days.set(date, { date, area: '', stay: '', title: '', status: '', activities: [] });
    return days.get(date);
  };
  for (const get of summary) {
    const date = dateKey(value(get('Date')));
    if (!date) continue;
    Object.assign(ensure(date), { area: publicText(value(get('Main Area'))), stay: publicText(value(get('Base / Stay'))), title: publicText(value(get('Main Plan'))), status: publicText(value(get('Status'))) });
  }
  for (const get of itinerary) {
    const date = dateKey(value(get('Date')));
    const title = publicText(value(get('Plan / Activity')));
    if (!date || !title) continue;
    const area = publicText(value(get('Area'))), route = publicText(value(get('Travel / Route')));
    const day = ensure(date);
    day.activities.push({ time: publicText(value(get('Time'))), title, area, route, maps: mapsFor(get('Google Maps'), title, area, route) });
    if (!day.area) day.area = area;
    if (!day.title) day.title = title;
  }
  const result = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!result.length) throw new Error('SHEET_EMPTY');
  return { days: result, fetchedAt: new Date().toISOString() };
}
