// FogCast Lite v0.8.5 – external JS
const Build = { id:'v0.8.5-lite-ext', ts:new Date().toISOString(), hash:(Math.random().toString(36).slice(2,8)).toUpperCase(), model:'fogProbLite 1.0' };
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('buildId').textContent = Build.id;
  document.getElementById('buildHash').textContent = Build.hash;
});

const _cache=new Map();
const GEO_PROMPTED='fogcast.geo.prompted';
const GEO_APPROVED='fogcast.geo.approved';
const statusBox = document.getElementById('status');

function tell(cls,msg){ const line=document.createElement('div'); line.className=cls; line.textContent=msg; statusBox.appendChild(line); }
function clearStatus(){ statusBox.innerHTML=''; }

function clamp01(x){return Math.min(1,Math.max(0,x))}
function sigmoid(z){return 1/(1+Math.exp(-z))}
function fmtHM(d, tz){ if(!d) return null; try{ return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz||undefined}).format(d); }catch(e){ return d.toLocaleTimeString().slice(0,5);} }
function fmtSun(sr, ss, tz){ return { sr, ss, srStr: sr?fmtHM(sr,tz):'—', ssStr: ss?fmtHM(ss,tz):'—' }; }
function formatDayLabel(d){return d.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'})}
function riskClass(p){return p>=0.7?'high':(p>=0.4?'med':'low')}
function riskIcon(p){return p>=0.7?'🌫️':(p>=0.4?'☁️':'☀️')}

const W={base:-2.2,rh:0.05,spread:-0.5,calm:0.6,breeze:0.15,windy:0.25,lowCloud:0.012,press:0.01,night:0.7,freeze:0.25};
function fogProb({t,td,rh,wind,lowCloud,pressure,hour}){
  const spread=(t!=null&&td!=null)?(t-td):null;
  const _rh=rh ?? (spread!=null ? clamp01(1 - spread/20)*100 : null);
  const night=(hour>=21||hour<=6)?1:0;
  const nearFreezing=(t!=null&&t<=2)?1:0;
  let z=W.base;
  if(_rh!=null) z+=W.rh*(_rh-85);
  if(spread!=null) z+=W.spread*Math.min(4,Math.max(-2,spread));
  if(wind!=null){ if(wind<=3) z+=W.calm; else if(wind<=6) z+=W.breeze; else z-=W.windy*(wind-6)/4; }
  if(lowCloud!=null) z+=W.lowCloud*(lowCloud-40);
  if(pressure!=null) z+=W.press*(pressure-1015);
  z+=night*W.night+nearFreezing*W.freeze;
  return clamp01(sigmoid(z));
}

async function geocodePlace(q){
  const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const r=await fetch(url,{mode:'cors'}).then(r=>r.json()).catch(e=>{ throw new Error('Network/blocked geocoding'); });
  const g=r?.results?.[0];
  if(!g) throw new Error('Place not found');
  return {lat:g.latitude, lon:g.longitude, label:`${g.name}${g.admin1?', '+g.admin1:''}${g.country?', '+g.country:''}`, timezone:g.timezone};
}

async function openMeteo({lat,lon,timezone}){
  const key=`om:${lat.toFixed(3)},${lon.toFixed(3)}`; const now=Date.now(); const c=_cache.get(key); if(c&&now-c.ts<5*60*1000) return c.data;
  const params=new URLSearchParams({
    latitude:lat, longitude:lon, timezone:timezone||'auto', forecast_days:'10',
    hourly:['temperature_2m','dew_point_2m','relative_humidity_2m','wind_speed_10m','cloud_cover_low','surface_pressure'].join(','),
    daily:['sunrise','sunset'].join(','), timeformat:'iso8601'
  });
  const url=`https://api.open-meteo.com/v1/forecast?${params}`;
  const json=await fetch(url,{mode:'cors'}).then(r=>r.json()).catch(e=>{ throw new Error('Network/blocked forecast'); });
  if(!json?.hourly?.time) throw new Error('Open-Meteo: missing hourly');
  const H=json.hourly; const to=(a,i)=> (a&&a[i]!=null? Number(a[i]):null);
  const map=new Map();
  for(let i=0;i<H.time.length;i++){
    const tISO=H.time[i]; const d=new Date(tISO);
    const di=Math.floor((d.setHours(0,0,0,0)-(new Date()).setHours(0,0,0,0))/86400000); if(di<0||di>9) continue;
    const hour=new Date(tISO).getHours();
    const p=fogProb({ t:to(H.temperature_2m,i), td:to(H.dew_point_2m,i), rh:to(H.relative_humidity_2m,i), wind:to(H.wind_speed_10m,i), lowCloud:to(H.cloud_cover_low,i), pressure:to(H.surface_pressure,i), hour });
    if(!map.has(di)) map.set(di, Array(24).fill(null)); map.get(di)[hour]=p;
  }
  for(const [di,arr] of map.entries()){
    let last=0.2; for(let h=0;h<24;h++){ if(arr[h]==null) arr[h]=last; else last=arr[h]; }
    for(let h=22;h>=0;h--){ if(arr[h]==null) arr[h]=arr[h+1]; }
    for(let h=1;h<23;h++){ arr[h]=(arr[h-1]+arr[h]+arr[h+1])/3; }
  }
  const D=json.daily||{}; const SR=D.sunrise||[]; const SS=D.sunset||[];
  function getSun(i){ const sr=SR[i]?new Date(SR[i]):null; const ss=SS[i]?new Date(SS[i]):null; return fmtSun(sr,ss,timezone); }
  const out={ key:'openmeteo', label:'Open-Meteo', getDay:(i)=>map.get(i), getSun };
  _cache.set(key,{ts:now,data:out}); return out;
}

function renderHourly(locLabel, date, hourlyArr, provider){
  const title=document.getElementById('hourTitle');
  const sub=document.getElementById('hourSubtitle');
  const grid=document.getElementById('hourGrid');
  const axis=document.getElementById('hourAxis');
  const sunAxis=document.getElementById('sunAxis');
  title.textContent = `${formatDayLabel(date)} – ${locLabel}`;
  const peak=Math.max(...hourlyArr); const peakH=hourlyArr.indexOf(peak);
  sub.textContent = `Peak ${String(peakH).padStart(2,'0')}:00 · ${Math.round(peak*100)}%`;
  grid.innerHTML='';
  hourlyArr.forEach((p,h)=>{
    const bar=document.createElement('div'); bar.className='bar';
    const span=document.createElement('span');
    span.style.height=(Math.max(0.05,p)*100)+'%';
    span.style.background=p>=0.7?'var(--bad)':(p>=0.4?'var(--warn)':'var(--ok)');
    span.title=`${String(h).padStart(2,'0')}:00 — ${Math.round(p*100)}%`;
    bar.appendChild(span); grid.appendChild(bar);
  });
  grid.removeAttribute('aria-hidden');
  axis.innerHTML=''; for(let h=0;h<24;h++){ const t=document.createElement('div'); t.className='tick'; t.textContent=String(h).padStart(2,'0'); axis.appendChild(t); }
  sunAxis.innerHTML='';
  const di = Math.floor((new Date(date).setHours(0,0,0,0)-(new Date()).setHours(0,0,0,0))/86400000);
  const sun = provider.getSun ? provider.getSun(di) : {srStr:'—',ssStr:'—'};
  const srH = sun.sr ? new Date(sun.sr).getHours() : null;
  const ssH = sun.ss ? new Date(sun.ss).getHours() : null;
  for(let h=0;h<24;h++){
    const t=document.createElement('div'); t.className='tick';
    if(srH!==null && ssH!==null){ t.textContent = h===srH?'🌅':(h===ssH?'🌇':(h>srH && h<ssH ? '☀️':'🌙')); } else t.textContent=' ';
    sunAxis.appendChild(t);
  }
  if(sun.srStr||sun.ssStr){ sub.textContent += ` · ↑ ${sun.srStr} ↓ ${sun.ssStr}`; }
}

function buildDayCards(provider, locLabel){
  const list=document.getElementById('days'); list.innerHTML='';
  for(let i=0;i<10;i++){
    const date=new Date(); date.setDate(date.getDate()+i);
    const hours = provider.getDay(i) || Array(24).fill(0.2);
    const dailyAgg = Math.max(...hours); const pct=Math.round(dailyAgg*100);
    const ticks = Array.from({length:24},(_,h)=>`<div>${h%3===0?String(h).padStart(2,'0'):''}</div>`).join('');
    const miniBars = hours.map((p,h)=>{ const w=Math.round(p*100); const c=p>=0.7?'var(--bad)':(p>=0.4?'var(--warn)':'var(--ok)'); return `<div class="hbar" title="${String(h).padStart(2,'0')}:00 — ${w}%"><span style="width:${w}%;background:${c}"></span></div>`; }).join('');
    const sun = provider.getSun ? provider.getSun(i) : {srStr:'—',ssStr:'—'};
    const card=document.createElement('div'); card.className='day'; card.setAttribute('role','listitem'); card.setAttribute('tabindex','0');
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between"><strong>${formatDayLabel(date)}</strong><div>${riskIcon(dailyAgg)}</div></div>
      <div style="display:flex;justify-content:space-between"><span class="muted">Aggregated fog risk</span><span class="risk ${riskClass(dailyAgg)}">${pct}%</span></div>
      <div class="bar"><span style="width:${pct}%;background:${dailyAgg>=0.7?'var(--bad)':(dailyAgg>=0.4?'var(--warn)':'var(--ok)')}"></span></div>
      <div class="mini-hourly"><div class="ticks">${ticks}</div><div class="cols">${miniBars}</div></div>
      <div style="display:flex;justify-content:space-between"><span class="pill">${locLabel}</span><span class="small">↑ ${sun.srStr} • ↓ ${sun.ssStr}</span></div>`;
    function select(){document.querySelectorAll('.day').forEach(d=>d.classList.remove('selected')); card.classList.add('selected'); renderHourly(locLabel,date,hours,provider);}
    card.addEventListener('click', select); card.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); select(); }});
    if(i===0) setTimeout(select,0);
    list.appendChild(card);
  }
}

async function buildDays(){
  clearStatus();
  const q=document.getElementById('location').value.trim();
  if(!q){ tell('err','Enter a place'); alert('Enter a place'); return; }
  tell('info', 'Geocoding…');
  let g=null;
  try{ g=await geocodePlace(q); tell('ok', 'Geocoding OK: '+g.label); }
  catch(e){ tell('err', 'Geocoding failed. '+e.message+' — try a simpler place name (e.g., London)'); return; }
  tell('info', 'Fetching forecast…');
  let provider=null;
  try{ provider=await openMeteo({lat:g.lat, lon:g.lon, timezone:g.timezone}); tell('ok','Forecast OK'); }
  catch(e){ tell('err','Forecast failed. '+e.message+' — GitHub Pages should be HTTPS; check extensions / network.'); return; }
  buildDayCards(provider, g.label);
  tell('ok','Done.');
}

function showGeo(){ const b=document.getElementById('geoBanner'); if(b) b.hidden=false; }
function useGeo(){
  if(!('geolocation' in navigator)){ tell('err','Geolocation not supported (needs HTTPS).'); alert('Geolocation not supported'); return; }
  navigator.geolocation.getCurrentPosition(async(pos)=>{
    const label=`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
    document.getElementById('location').value=label; buildDays();
  }, (err)=>{ tell('err','Location failed: '+(err?.message||'Permission denied')); alert('Location failed: '+(err?.message||'Permission denied')); }, {timeout:8000,maximumAge:300000});
}

async function selfCheck(){
  clearStatus();
  tell('info', 'Running deploy self-check…');
  const isHttps = location.protocol === 'https:';
  tell(isHttps?'ok':'err', (isHttps?'✓':'✗')+' Page served over '+location.protocol);
  try{
    const pong = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=London&count=1&language=en&format=json',{mode:'cors'}).then(r=>r.ok? r.json():Promise.reject(r.status));
    tell(pong?.results?.length? 'ok':'err', (pong?.results?.length? '✓':'✗')+' Geocoding fetch');
  }catch(e){ tell('err','✗ Geocoding fetch blocked'); }
  try{
    const params=new URLSearchParams({latitude:51.5, longitude:-0.12, timezone:'auto', forecast_days:'1', hourly:'temperature_2m', daily:'sunrise,sunset'});
    const url=`https://api.open-meteo.com/v1/forecast?${params}`;
    const pong = await fetch(url,{mode:'cors'}).then(r=>r.ok? r.json():Promise.reject(r.status));
    tell(pong?.hourly?.time? 'ok':'err', (pong?.hourly?.time? '✓':'✗')+' Forecast fetch');
  }catch(e){ tell('err','✗ Forecast fetch blocked'); }
  tell('info','If anything is ✗, try disabling strict ad-blockers for this page, then reload.');
}

// Wire events after DOM is ready
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('go').addEventListener('click', buildDays);
  document.getElementById('useGeo').addEventListener('click', useGeo);
  document.getElementById('geoAllow').addEventListener('click', ()=>{ sessionStorage.setItem(GEO_PROMPTED,'1'); localStorage.setItem(GEO_APPROVED,'1'); document.getElementById('geoBanner').hidden=true; useGeo(); });
  document.getElementById('geoDismiss').addEventListener('click', ()=>{ sessionStorage.setItem(GEO_PROMPTED,'1'); document.getElementById('geoBanner').hidden=true; });
  document.getElementById('selfTest').addEventListener('click', selfCheck);

  const approved=localStorage.getItem(GEO_APPROVED);
  const prompted=sessionStorage.getItem(GEO_PROMPTED);
  if(approved){ useGeo(); } else if(!prompted){ const b=document.getElementById('geoBanner'); if(b) b.hidden=false; }

  // Initial build with default placeholder
  buildDays();
});
