// FogCast v0.8.8 – Snap loop hard fix (no programmatic scroll, guarded selection)

// Build tag
document.getElementById('buildId').textContent = '0.8.8';
document.getElementById('buildHash').textContent = Math.random().toString(36).slice(2,8);

// Elements
const daysEl = document.getElementById('days');
const hourTitle = document.getElementById('hourTitle');
const hourSubtitle = document.getElementById('hourSubtitle');
const hourGrid = document.getElementById('hourGrid');
const hourAxis = document.getElementById('hourAxis');
const sunAxis = document.getElementById('sunAxis');

// ---- status helper (safe even if #status is missing) ----
const _statusEl = document.getElementById('status');
function setStatus(msg){ if(_statusEl) _statusEl.textContent = msg; }

// --- Selection state & snap guards ---
let currentSelectedIndex = null;          // which card is selected
let suppressSnapUntil = 0;                // timestamp to temporarily ignore snap selection

// --- Sticky scroller snap helpers (no scrolling, guarded) ---
function findNearestCardIndex(container){
  const cards = container.querySelectorAll('.day');
  if(!cards.length) return null;
  const mid = container.getBoundingClientRect().left + container.clientWidth/2;
  let bestIdx = 0, bestDist = Infinity;
  cards.forEach((card, idx) => {
    const r = card.getBoundingClientRect();
    const center = (r.left + r.right)/2;
    const d = Math.abs(center - mid);
    if(d < bestDist){ bestDist = d; bestIdx = idx; }
  });
  return bestIdx;
}

// Only update selection after user scrolls (no scrollIntoView)
function selectNearestAfterScroll(container, data, label){
  if(Date.now() < suppressSnapUntil) return;           // guard recent programmatic changes
  const idx = findNearestCardIndex(container);
  if(idx === null) return;
  if(idx === currentSelectedIndex) return;             // already selected
  selectCard(idx, data, label, { fromSnap: true });
}

function initDaySnap(container, data, label){
  let t = null;
  container.addEventListener('scroll', () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => selectNearestAfterScroll(container, data, label), 150);
  }, { passive: true });
}

// --- Core functions ---
async function geocodeAndFetch(place){
  setStatus('Looking up location…');
  try {
    const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
    const geoData = await geoResp.json();
    if (!geoData.results || !geoData.results.length) {
      setStatus('Location not found.');
      return;
    }
    const loc = geoData.results[0];
    fetchForecast(loc.latitude, loc.longitude, `${loc.name}${loc.country ? ', '+loc.country : ''}`);
  } catch(err) {
    setStatus('Geocoding failed.');
  }
}

function getUserLocation(){
  if (!navigator.geolocation) { setStatus('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    fetchForecast(pos.coords.latitude, pos.coords.longitude, 'My location');
  }, () => setStatus('Geolocation failed.'));
}

async function fetchForecast(lat, lon, label){
  setStatus('Fetching forecast…');
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=visibility&daily=sunrise,sunset&timezone=auto`;
    const resp = await fetch(url);
    const data = await resp.json();
    buildDayCards(data, label);
    setStatus(`Showing forecast for ${label}`);
  } catch(err) {
    setStatus('Forecast fetch failed.');
  }
}

function buildDayCards(data, label){
  daysEl.innerHTML = '';
  currentSelectedIndex = null;

  const vis = data.hourly.visibility.map(v => v / 1000); // km
  const hourDt = data.hourly.time.map(t => new Date(t));
  const dayISO = data.daily.time.map(t => t.slice(0,10)); // 'YYYY-MM-DD'
  const sr = data.daily.sunrise.map(t => new Date(t));
  const ss = data.daily.sunset.map(t => new Date(t));

  // Build quick index for hour lookups
  const byDayHour = new Map(); // 'YYYY-MM-DD|HH' -> km
  for(let i=0;i<hourDt.length;i++){
    const d = hourDt[i];
    const key = d.toISOString().slice(0,10) + '|' + String(d.getHours()).padStart(2,'0');
    byDayHour.set(key, vis[i]);
  }

  dayISO.forEach((dayKey, dIdx) => {
    const dayDate = new Date(dayKey+'T00:00:00');
    const card = document.createElement('div');
    card.className = 'day';

    const ticks = Array.from({length:24}, (_,h)=>`<div>${String(h).padStart(2,'0')}</div>`).join('');
    const cols = Array.from({length:24}, (_,h)=>{
      const km = byDayHour.get(`${dayKey}|${String(h).padStart(2,'0')}`) ?? 0;
      const pct = Math.max(0, Math.min(100, (10 - km) * 10)); // 0km ->100%, 10km->0%
      const color = pct < 34 ? 'var(--ok)' : pct < 67 ? 'var(--warn)' : 'var(--bad)';
      return `<div class="hbar"><span style="width:${pct}%;background:${color}"></span></div>`;
    }).join('');

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between">
        <strong>${dayDate.toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'})}</strong>
        <div>🌫️</div>
      </div>
      <div class="mini-hourly">
        <div class="ticks">${ticks}</div>
        <div class="cols">${cols}</div>
      </div>
      <div class="small">↑ ${sr[dIdx].getHours().toString().padStart(2,'0')}:${sr[dIdx].getMinutes().toString().padStart(2,'0')} • ↓ ${ss[dIdx].getHours().toString().padStart(2,'0')}:${ss[dIdx].getMinutes().toString().padStart(2,'0')}</div>
    `;

    // Click selects only (NO scrollIntoView to avoid loops)
    card.addEventListener('click', () => {
      selectCard(dIdx, data, label, { fromClick: true });
      // If you later want a gentle center-on-click, re-enable below with guard:
      // suppressSnapUntil = Date.now() + 300;  // ignore snap while smooth scrolling
      // card.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    });

    daysEl.appendChild(card);
  });

  // Auto-select first card without scrolling
  if(daysEl.firstElementChild) selectCard(0, data, label, { initial: true });

  // Enable guarded snap selection
  initDaySnap(daysEl, data, label);
}

function selectCard(idx, data, label, opts={}){
  if(idx === currentSelectedIndex) return;   // no redundant work
  currentSelectedIndex = idx;

  // Update card selection
  document.querySelectorAll('.day').forEach((d,i) => {
    if(i===idx) d.classList.add('selected'); else d.classList.remove('selected');
  });

  // Update hourly panel
  buildHourlyForDay(idx, data, label);

  // If selection came from a click, briefly suppress snap selection loop
  if(opts.fromClick) suppressSnapUntil = Date.now() + 250;
}

function buildHourlyForDay(dayIndex, data, label){
  const vis = data.hourly.visibility.map(v => v / 1000);
  const hourDt = data.hourly.time.map(t => new Date(t));
  const dayKey = data.daily.time[dayIndex].slice(0,10);

  hourTitle.textContent = new Date(dayKey+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'short'});
  hourSubtitle.textContent = label;
  hourGrid.innerHTML = '';
  hourAxis.innerHTML = '';
  sunAxis.innerHTML = '';

  // map for quick lookup
  const byHour = new Map();
  for(let i=0;i<hourDt.length;i++){
    const d = hourDt[i];
    if(d.toISOString().slice(0,10)===dayKey){
      byHour.set(d.getHours(), vis[i]);
    }
  }

  for(let h = 0; h < 24; h++){
    const km = byHour.get(h) ?? 0;
    const pct = Math.max(0, Math.min(100, (10 - km) * 10));
    const color = pct < 34 ? 'var(--ok)' : pct < 67 ? 'var(--warn)' : 'var(--bad)';

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `<span style="height:${pct}%;background:${color}"></span>`;
    hourGrid.appendChild(bar);

    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.textContent = String(h).padStart(2,'0');
    hourAxis.appendChild(tick);
  }

  // sunrise/sunset markers
  const sr = new Date(data.daily.sunrise[dayIndex]);
  const ss = new Date(data.daily.sunset[dayIndex]);
  for(let h = 0; h < 24; h++){
    const tick = document.createElement('div');
    tick.className = 'tick';
    if(h === sr.getHours()) tick.textContent = '↑';
    else if(h === ss.getHours()) tick.textContent = '↓';
    else tick.textContent = '';
    sunAxis.appendChild(tick);
  }
  hourGrid.removeAttribute('aria-hidden');
}

// --- Self-test diagnostics ---
async function runSelfCheck(){
  const results = [];
  const log = (ok,msg)=>results.push(`${ok?'✅':'❌'} ${msg}`);
  try {
    const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=London&count=1');
    log(g.ok,'Geocoding API reachable');
  } catch { log(false,'Geocoding API unreachable'); }
  try {
    const f = await fetch('https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&hourly=visibility');
    log(f.ok,'Forecast API reachable');
  } catch { log(false,'Forecast API unreachable'); }
  alert(results.join('\n'));
}

// Auto-load default location
geocodeAndFetch(document.getElementById('location').value);
