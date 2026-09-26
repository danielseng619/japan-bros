let days = [], idx = 0, loading = false, voter = 'Daniel';
let votes = {};
try { votes = JSON.parse(localStorage.getItem('jbvotes') || '{}'); } catch {}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLabel = date => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(date + 'T00:00:00Z'));
const statusIcon = status => /locked|booked|confirmed|planned/i.test(status) ? '🟢' : '🟡';
const mapLink = maps => maps ? `<a class="btn map" href="${escapeHtml(maps.url)}" target="_blank" rel="noopener noreferrer">📍 ${maps.source === 'generated' ? 'Find on Maps' : 'Google Maps'}</a>` : '';
document.querySelector('#app').innerHTML = `<div class="wrap"><div class="top"><div><div class="muted small">DANIEL · SEAN · KEITH · BK</div><h1>Japan Bros 🇯🇵</h1><div class="muted" id="trip-dates">Osaka Brother Trip</div></div><span class="pill">4 bros</span></div><div id="sync" class="card small" role="status" aria-live="polite"></div><div class="tabs">${['today','trip','vote','places','money'].map((id,i)=>`<section id="${id}" class="${i ? '' : 'on'}"></section>`).join('')}</div><div class="card"><b>🤖 Ask the trip</b><div class="ask"><input id="q" aria-label="Ask the trip" placeholder="what are we doing tomorrow?"><button id="ask">Ask</button></div><div id="ans" class="muted small" style="margin-top:9px">Try “tomorrow”, “hotel” or “unplanned”.</div></div></div><nav class="nav">${[['today','☀️','Today'],['trip','🗓️','Trip'],['vote','🗳️','Vote'],['places','📍','Places'],['money','💴','Money']].map(([id,icon,label],i)=>`<button class="${i ? '' : 'on'}" data-tab="${id}">${icon}<br><span class="small">${label}</span></button>`).join('')}</nav>`;
function tab(id) {
  document.querySelectorAll('.tabs section').forEach(el => el.classList.toggle('on', el.id === id));
  document.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('on', el.dataset.tab === id));
}
document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => tab(el.dataset.tab)));
function render() {
  const day = days[idx];
  if (!day) {
    for (const id of ['today','trip','places']) document.querySelector('#'+id).innerHTML = '<div class="card muted">The itinerary will appear here when the Sheet loads.</div>';
    return;
  }
  document.querySelector('#trip-dates').textContent = `${dateLabel(days[0].date)} ${days[0].date.slice(0,4)} → ${dateLabel(days.at(-1).date)} ${days.at(-1).date.slice(0,4)}`;
  document.querySelector('#today').innerHTML = `<div class="card"><select id="day-select" aria-label="Trip day">${days.map((d,i)=>`<option value="${i}" ${i===idx?'selected':''}>${dateLabel(d.date)} · ${escapeHtml(d.area)}</option>`).join('')}</select><h2>${escapeHtml(day.title)}</h2><span class="pill">${statusIcon(day.status)} ${escapeHtml(day.status || 'Planning')}</span>${day.stay ? `<p class="muted small">Base / stay: ${escapeHtml(day.stay)}</p>` : ''}</div><h2>Timeline</h2>${day.activities.length ? day.activities.map(a=>`<div class="card row timeline"><div class="time">${escapeHtml(a.time || 'TBC')}</div><div class="grow"><b>${escapeHtml(a.title)}</b>${a.route ? `<div class="muted small">${escapeHtml(a.route)}</div>` : ''}${mapLink(a.maps)}</div></div>`).join('') : '<div class="card muted">No detailed activities in ITINERARY for this day yet.</div>'}${days[idx+1] ? `<div class="card"><div class="small muted">NEXT DAY · ${dateLabel(days[idx+1].date)}</div><b>${escapeHtml(days[idx+1].area)}</b><div>${escapeHtml(days[idx+1].title)}</div></div>` : '<div class="card muted">Last day of the trip.</div>'}`;
  document.querySelector('#day-select').addEventListener('change', e => { idx = Number(e.target.value); render(); });
  document.querySelector('#trip').innerHTML = '<h2>Full trip</h2>' + days.map((d,i)=>`<button class="card row trip-day" data-day="${i}"><b class="date">${dateLabel(d.date)}</b><span class="grow"><b>${escapeHtml(d.area)}</b><span class="small muted block">${escapeHtml(d.title)}</span><span class="small muted block">${d.activities.length} activities · ${escapeHtml(d.status || 'Planning')}</span></span><span class="status">${statusIcon(d.status)}</span></button>`).join('');
  document.querySelectorAll('[data-day]').forEach(el => el.addEventListener('click', () => { idx = Number(el.dataset.day); render(); tab('today'); window.scrollTo(0,0); }));
  const seen = new Set();
  const places = days.flatMap(d => d.activities).filter(a => a.maps && !seen.has(a.maps.url) && seen.add(a.maps.url));
  document.querySelector('#places').innerHTML = '<h2>Quick places 📍</h2>' + places.map(a=>`<div class="card"><b>${escapeHtml(a.title)}</b><div class="small muted">${escapeHtml(a.area)}</div>${mapLink(a.maps)}</div>`).join('');
}
function syncMessage(message, error = false) {
  const el = document.querySelector('#sync');
  el.classList.toggle('warn', error);
  el.innerHTML = `<span>${escapeHtml(message)}</span> <button class="pill" id="refresh" ${loading ? 'disabled' : ''}>${loading ? 'Loading…' : 'Refresh'}</button>`;
  document.querySelector('#refresh').addEventListener('click', loadTrip);
}
async function loadTrip() {
  if (loading) return;
  loading = true;
  syncMessage(days.length ? 'Refreshing from Google Sheets…' : 'Loading from Google Sheets…');
  try {
    const response = await fetch('/api/trip', { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (!Array.isArray(data.days) || !data.days.length) throw new Error('empty');
    const selected = days[idx]?.date;
    const japanToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    days = data.days;
    idx = days.findIndex(d => d.date === (selected || japanToday));
    if (idx < 0) idx = days.findIndex(d => d.date >= japanToday);
    if (idx < 0) idx = days.length - 1;
    render();
    loading = false;
    syncMessage(`Loaded from Google Sheets · ${new Date(data.fetchedAt).toLocaleTimeString()}`);
  } catch {
    loading = false;
    syncMessage(days.length ? 'Refresh failed. Showing the last loaded itinerary; it may be out of date.' : 'Could not load the trip Sheet. Check your connection and retry. The private Sheets connection may need setup.', true);
  }
}
// Retain the local voting prototype, but do not present an obsolete Kobe poll as a current plan.
document.querySelector('#vote').innerHTML = '<h2>Bros decide 🗳️</h2><div class="card muted">No active shared poll. Use the Google Sheet to agree on the itinerary. Previous local votes are preserved on this device.</div>';
document.querySelector('#money').innerHTML = '<h2>Trip money 💴</h2><div class="card muted">Open the private MONEY &amp; SPLIT tab in Google Sheets for current costs and settlement. Financial and booking details are not published in this app.</div>';
document.querySelector('#ask').addEventListener('click', () => {
  const q = document.querySelector('#q').value.trim().toLowerCase();
  let answer = 'Try “tomorrow”, “hotel”, “unplanned”, or a place name.';
  if (!days.length) answer = 'Load the trip Sheet first, then try again.';
  else if (q.includes('tomorrow')) { const d=days[idx+1]; answer=d ? `${dateLabel(d.date)} · ${d.title}` : 'You are viewing the last day of the trip.'; }
  else if (q.includes('hotel')) answer=[...new Set(days.map(d=>d.stay).filter(Boolean))].join(' · ');
  else if (q.includes('unplan')) answer=days.filter(d=>!d.activities.length || /planning|tbc/i.test(d.status)).map(d=>`${dateLabel(d.date)} · ${d.title}`).join('\n') || 'Every day has detailed activities. Check the Sheet for remaining decisions.';
  else if (q) { const matches=days.filter(d=>JSON.stringify(d).toLowerCase().includes(q)); if(matches.length) answer=matches.map(d=>`${dateLabel(d.date)} · ${d.title}`).join('\n'); }
  document.querySelector('#ans').textContent=answer;
});
render();
loadTrip();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg=>reg.update()).catch(()=>{});
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!reloading){ reloading=true; location.reload(); } });
}
