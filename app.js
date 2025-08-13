// FogCast v0.8.6 – Sticky Scroller Edition
// Baseline: Open-Meteo hourly visibility, sunrise/sunset (24h)
// Build tagging
document.getElementById('buildId').textContent = '0.8.6';
document.getElementById('buildHash').textContent = Math.random().toString(36).slice(2,8);

// Elements
const daysEl = document.getElementById('days');
const hourTitle = document.getElementById('hourTitle');
const hourSubtitle = document.getElementById('hourSubtitle');
const hourGrid = document.getElementById('hourGrid');
const hourAxis = document.getElementById('hourAxis');
const sunAxis = document.getElementById('sunAxis');
const statusEl = document.getElementById('status');

// Event bindings
document.getElementById('go').addEventListener('click', () => {
  const q = document.getElementById('location').value.trim();
  if (q) geocodeAndFetch(q);
});
document.getElementById('useGeo').addEventListener('click', () => {
  getUserLocation();
});
document.getElementById('geoAllow').addEventListener('click', () => {
  localStorage.setItem('geoAllowed', '1');
  getUserLocation();
  document.getElementById('geoBanner').hidden = true;
});
document.getElementById('geoDismiss').addEventListener('click', () => {
  localStorage.setItem('geoAllowed', '0');
  document.getElementById('geoBanner').hidden = true;
});
document.getElementById('selfTest').addEventListener('click', runSelfCheck);

// Geolocation prompt once per session
if (!sessionStorage.getItem('geoPrompted')) {
  if (localStorage.getItem('geoAllowed') !== '0') {
    document.getElementById('geoBanner').hidden = false;
  }
  sessionStorage.setItem('geoPrompted', '1');
}

// --- Sticky scroller snap helpers ---
function findNearestCard(container){
  const mid = container.getBoundingClientRect().left + container.clientWidth/2;
  let best = null, bestDist = 1e9;
  for(const card of container.querySelectorAll('.day')){
    const r = card.getBoundingClientRect();
    const center = (r.left + r.right)/2;
    const d = Math.abs(center - mid);
    if(d < bestDist){ bestDist = d; best = card; }
  }
  return best;
}

function snapDays(container){
  const target = findNearestCard(container);
  if(!target) return;
  target.scrollIntoView({behavior:'smooth', inline:'start', block:'nearest'});
  target.click();
}

function initDaySnap(container){
  let t = null;
  container.addEventListener('scroll', () => {
    if(t) clearTimeout(t);
    t = setTimeout(() => snapDays(container), 120);
  }, { passive: true });
}

// --- Core functions ---
async function geocodeAndFetch(place){
  statusEl.textContent = 'Looking up location…';
  try {
    const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
    const geoData = await geoResp.json();
    if (!geoData.results || !geoData.results.length) {
      statusEl.textContent = 'Location not found.';
      return;
    }
    const loc = geoData.results[0];
    fetchForecast(loc.latitude, loc.longitude, `${loc.name}, ${loc.country}`);
  } catch(err) {
    statusEl.textContent = 'Geocoding failed.';
  }
}

function getUserLocation(){
  if (!navigator.geolocation) {
    statusEl.textContent = 'Geolocation not supported.';
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    fetchForecast(pos.coords.latitude, pos.coords.longitude, 'My location');
  }, err => {
    statusEl.textContent = 'Geolocation failed.';
  });
}

async function fetchForecast(lat, lon, label){
  statusEl.textContent = 'Fetching forecast…';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=visibility&daily=sunrise,sunset&timezone=auto`;
    const resp = await fetch(url);
    const data = await resp.json();
    buildDayCards(data, label);
    statusEl.textContent = `Showing forecast for ${label}`;
  } catch(err) {
    statusEl.textContent = 'Forecast fetch failed.';
  }
}

function buildDayCards(data, label){
  daysEl.innerHTML = '';
  const vis = data.hourly.visibility.map(v => v / 1000); // km
  const hours = data.hourly.time.map(t => new Date(t));
  const sr = data.daily.sunrise.map(t => new Date(t));
  const ss = data.daily.sunset.map(t => new Date(t));

  for(let d = 0; d < data.daily.time.length; d++){
    const dayDate = new Date(data.daily.time[d]);
    const card = document.createElement('div');
    card.className = 'day';
    card.innerHTML = `
      <div style="font-weight:700">${dayDate.toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'})}</div>
      <div class="muted">${label}</div>
      <div class="mini-hourly">
        <div class="ticks">${Array.from({length:24}, (_,i)=>`<div>${String(i).padStart(2,'0')}</div>`).join('')}</div>
        <div class="cols">
          ${Array.from({length:24}, (_,h) => {
            const idx = hours.findIndex(dt => dt.getDate() === dayDate.getDate() && dt.getHours() === h);
            const km = vis[idx] || 0;
            const pct = Math.max(0, Math.min(100, (10 - km) * 10));
            const color = pct < 34 ? 'var(--ok)' : pct < 67 ? 'var(--warn)' : 'var(--bad)';
            return `<div class="hbar"><span style="width:${pct}%;background:${color}"></span></div>`;
          }).join('')}
        </div>
      </div>
      <div class="small">↑ ${sr[d].getHours().toString().padStart(2,'0')}:${sr[d].getMinutes().toString().padStart(2,'0')} • ↓ ${ss[d].getHours().toString().padStart(2,'0')}:${ss[d].getMinutes().toString().padStart(2,'0')}</div>
    `;
    card.addEventListener('click', () => buildHourlyForDay(d, data, label));
    daysEl.appendChild(card);
  }
  initDaySnap(daysEl);
}
function buildHourlyForDay(dayIndex, data, label){
  document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
  document.querySelectorAll('.day')[dayIndex].classList.add('selected');

  const vis = data.hourly.visibility.map(v => v / 1000);
  const hours = data.hourly.time.map(t => new Date(t));

  const startDate = new Date(data.daily.time[dayIndex]);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  hourTitle.textContent = startDate.toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'short'});
  hourSubtitle.textContent = label;
  hourGrid.innerHTML = '';
  hourAxis.innerHTML = '';
  sunAxis.innerHTML = '';

  for(let h = 0; h < 24; h++){
    const idx = hours.findIndex(dt => dt >= startDate && dt < endDate && dt.getHours() === h);
    const km = vis[idx] || 0;
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

  // sunrise/sunset markers in sunAxis row
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
  let out = [];
  function log(msg, ok=true){ out.push((ok?'✅':'❌') + ' ' + msg); }
  try {
    const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=London&count=1');
    log('Geocoding API reachable', g.ok);
  } catch { log('Geocoding API unreachable', false); }
  try {
    const f = await fetch('https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&hourly=visibility');
    log('Forecast API reachable', f.ok);
  } catch { log('Forecast API unreachable', false); }
  alert(out.join('\n'));
}

// Auto-load default location
geocodeAndFetch(document.getElementById('location').value);
