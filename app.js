/* ...existing code... */

/* Minimal VitalTrack single-file logic:
   - stores profile & measurements in localStorage
   - evaluates vitals against simple reference ranges adjusted by age/sex
   - renders results, history and a Chart.js line chart
*/

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

/* --- State & Storage --- */
const STORAGE_KEYS = { profile: 'vt_profile', measurements: 'vt_measurements' };
function loadProfile(){ return JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) || '{}'); }
function saveProfile(p){ localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(p)); }
function loadMeasurements(){ return JSON.parse(localStorage.getItem(STORAGE_KEYS.measurements) || '[]'); }
function saveMeasurements(arr){ localStorage.setItem(STORAGE_KEYS.measurements, JSON.stringify(arr)); }

/* --- Simple reference ranges by age group (examples, simplified) --- */
function getRefs(age = 30, sex = 'other'){
  // returns object with {min,max,unit,desc} for each vital
  // Ranges are general and simplified; intended for consumer guidance only.
  const refs = {};
  // Heart rate (resting). Adults: 60-100, children younger have higher rates.
  if (age < 2) refs.heartRate = {min:80,max:160,unit:'lpm',desc:'Pulso en reposo típico para infantes'};
  else if (age < 12) refs.heartRate = {min:70,max:110,unit:'lpm',desc:'Pulso en reposo típico para niños'};
  else refs.heartRate = {min:60,max:100,unit:'lpm',desc:'Pulso en reposo típico para adultos'};
  // Respiratory rate
  if (age < 2) refs.respRate = {min:20,max:40,unit:'rpm',desc:'Frecuencia respiratoria infantil'};
  else if (age < 12) refs.respRate = {min:18,max:30,unit:'rpm',desc:'Frecuencia respiratoria niños'};
  else refs.respRate = {min:12,max:20,unit:'rpm',desc:'Frecuencia respiratoria en reposo'};
  // Blood pressure (general adult references; children vary widely)
  if (age < 18){
    refs.sys = {min:80,max:110,unit:'mmHg',desc:'Presión arterial aproximada para menores (variable)'};
    refs.dia = {min:50,max:75,unit:'mmHg',desc:'Presión arterial diastólica (menores)'};
  } else {
    refs.sys = {min:90,max:120,unit:'mmHg',desc:'Presión sistólica normal para adultos'};
    refs.dia = {min:60,max:80,unit:'mmHg',desc:'Presión diastólica normal para adultos'};
    // adjust slightly for older adults
    if (age > 65){ refs.sys.max = 140; refs.dia.max = 90; }
  }
  // Temp (C)
  refs.temp = {min:36.1,max:37.2,unit:'°C',desc:'Temperatura corporal normal aproximada'};
  // SpO2
  refs.spo2 = {min:95,max:100,unit:'%',desc:'Saturación de oxígeno óptima en aire ambiente'};
  return refs;
}

/* --- Evaluation --- */
function evaluate(value, ref){
  if (value === null || value === undefined || isNaN(value)) return {status:'unknown'};
  if (value < ref.min) return {status:'low'};
  if (value > ref.max) return {status:'high'};
  return {status:'normal'};
}

/* --- UI helpers --- */
function el(html){ const div = document.createElement('div'); div.innerHTML = html; return div.firstElementChild; }

function renderResults(measurement, refs){
  const container = qs('#resultsList');
  container.innerHTML = '';
  const items = [
    {key:'heartRate', label:'Pulso', icon:'❤️'},
    {key:'respRate', label:'Respiración', icon:'🌬️'},
    {key:'sys', label:'Sistólica', icon:'⬆️'},
    {key:'dia', label:'Diastólica', icon:'⬇️'},
    {key:'temp', label:'Temperatura', icon:'🌡️'},
    {key:'spo2', label:'SpO₂', icon:'🩸'}
  ];
  let anyAbnormal = false;
  items.forEach(it=>{
    const val = measurement[it.key];
    const ref = refs[it.key];
    const evalr = evaluate(+val, ref);
    if (evalr.status !== 'normal') anyAbnormal = true;
    const statusClass = evalr.status === 'normal' ? 'indicator-normal' : (evalr.status === 'low' ? 'indicator-low' : (evalr.status === 'high' ? 'indicator-high' : ''));
    const valText = (val===null||val===undefined)? '—' : `${val} ${ref?.unit||''}`;
    const msg = evalr.status === 'normal' ? 'Dentro del rango esperado' :
                evalr.status === 'low' ? 'Por debajo del rango esperado' :
                evalr.status === 'high' ? 'Por encima del rango esperado' : 'Sin datos';
    const item = el(`<div class="result-item">
      <div class="result-left">
        <div class="badge ${statusClass}">${it.icon}</div>
        <div>
          <div style="font-weight:600">${it.label}</div>
          <div style="font-size:.85rem;color:var(--muted)">${ref?.desc||''}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700">${valText}</div>
        <div style="font-size:.85rem;color:var(--muted)">${msg}</div>
      </div>
    </div>`);
    container.appendChild(item);
  });

  const adviceEl = qs('#globalAdvice');
  adviceEl.textContent = anyAbnormal ? 'Se detectaron valores fuera del rango. Si persisten o hay síntomas, considere consultar a un profesional de salud.' : 'Todos los valores están dentro del rango esperado.';
}

/* --- History & Chart --- */
let chart = null;
function renderHistoryList(measurements){
  const list = qs('#historyList');
  list.innerHTML = '';
  measurements.slice().reverse().forEach(m=>{
    const dt = new Date(m.t).toLocaleString();
    const label = `${dt} — Pulso ${m.heartRate} lpm · SpO₂ ${m.spo2}%`;
    const li = document.createElement('li');
    li.innerHTML = `<div>${label}</div><div style="color:var(--muted);font-size:.85rem">${m.note||''}</div>`;
    list.appendChild(li);
  });
}

function renderChart(measurements){
  const ctx = qs('#historyChart');
  const last = measurements.slice(-30);
  const labels = last.map(m => new Date(m.t).toLocaleDateString());
  const hr = last.map(m => m.heartRate);
  const spo2 = last.map(m => m.spo2);
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {label:'Pulso (lpm)', data:hr, borderColor:'#0b6efd', backgroundColor:'rgba(11,110,253,0.06)', tension:0.2},
        {label:'SpO₂ (%)', data:spo2, borderColor:'#0a8f3b', backgroundColor:'rgba(10,143,59,0.06)', tension:0.2}
      ]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      scales:{ y:{beginAtZero:false} },
      plugins:{legend:{position:'bottom'}}
    }
  });
}

/* --- Profile modal handling & references UI --- */
function openProfile(){ const modal = qs('#profileModal'); modal.setAttribute('aria-hidden','false'); }
function closeProfile(){ const modal = qs('#profileModal'); modal.setAttribute('aria-hidden','true'); }

function populateProfileForm(){
  const p = loadProfile();
  const f = qs('#profileForm');
  f.age.value = p.age || 30;
  f.sex.value = p.sex || 'other';
}

function renderReferenceList(){
  const p = loadProfile();
  const refs = getRefs(p.age || 30, p.sex || 'other');
  const ul = qs('#referenceList');
  ul.innerHTML = '';
  for (const [k,v] of Object.entries(refs)){
    const li = document.createElement('li');
    li.textContent = `${k}: ${v.min} — ${v.max} ${v.unit} — ${v.desc}`;
    ul.appendChild(li);
  }
}

/* --- Form submit & data flow --- */
function currentMeasurementFromForm(form){
  return {
    heartRate: Number(form.heartRate.value) || null,
    respRate: Number(form.respRate.value) || null,
    sys: Number(form.sys.value) || null,
    dia: Number(form.dia.value) || null,
    temp: Number(form.temp.value) || null,
    spo2: Number(form.spo2.value) || null,
    t: Date.now()
  };
}

function addMeasurement(m){
  const arr = loadMeasurements();
  arr.push(m);
  saveMeasurements(arr);
  refreshUI();
}

function refreshUI(){
  const p = loadProfile();
  const refs = getRefs(p.age || 30, p.sex || 'other');
  const measurements = loadMeasurements();
  const latest = measurements[measurements.length-1] || {};
  renderResults(latest, refs);
  renderHistoryList(measurements);
  renderChart(measurements);
  renderReferenceList();
}

/* --- Export CSV --- */
function exportCSV(){
  const rows = loadMeasurements();
  if (!rows.length){ alert('No hay datos para exportar'); return; }
  const headers = ['timestamp,iso,heartRate,respRate,sys,dia,temp,spo2'];
  const lines = rows.map(r => {
    return `${r.t},${new Date(r.t).toISOString()},${r.heartRate},${r.respRate},${r.sys},${r.dia},${r.temp},${r.spo2}`;
  });
  const csv = headers.concat(lines).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vitaltrack_export_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* --- Init & Event Listeners --- */
document.addEventListener('DOMContentLoaded', ()=>{
  // Profile modal
  qs('#profileBtn').addEventListener('click', ()=>{ populateProfileForm(); openProfile(); });
  qs('#closeProfile').addEventListener('click', ()=> closeProfile());
  qs('#profileForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const form = e.target;
    const profile = { age: Number(form.age.value), sex: form.sex.value };
    saveProfile(profile);
    closeProfile();
    refreshUI();
  });

  // Form submit
  qs('#vitalsForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const m = currentMeasurementFromForm(e.target);
    addMeasurement(m);
    e.target.reset();
    alert('Medición guardada');
  });

  qs('#quickNormal').addEventListener('click', ()=>{
    const f = qs('#vitalsForm');
    f.heartRate.value = 72; f.respRate.value = 16; f.sys.value = 118; f.dia.value = 76; f.temp.value = 36.6; f.spo2.value = 98;
  });

  qs('#clearForm').addEventListener('click', ()=>{
    const f = qs('#vitalsForm');
    // clear all inputs in the vitals form
    Array.from(f.elements).forEach(el=>{
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') el.value = '';
    });
  });

  qs('#exportCsv').addEventListener('click', exportCSV);
  qs('#clearHistory').addEventListener('click', ()=>{
    if (confirm('Limpiar todo el historial?')){ saveMeasurements([]); refreshUI(); }
  });

  // initial profile default
  const p = loadProfile();
  if (!p.age) { saveProfile({age:30,sex:'other'}); }
  refreshUI();
});