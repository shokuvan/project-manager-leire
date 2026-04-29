// ═══════════════════════════════════════════════════════════════
// PROJECT.JS — Detail Proyek: Setup, Gantt, Biaya, Realisasi, Deviasi
// ═══════════════════════════════════════════════════════════════

import { db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  doc, getDoc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Helpers ───────────────────────────────────────────────────
const HEX = ['#3b82f6','#06b6d4','#8b5cf6','#f59e0b','#22c55e','#f43f5e'];

function fmtRp(n) {
  return 'Rp ' + (Math.round(n)||0).toLocaleString('id-ID');
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

// Debounce: delay simpan supaya tidak spam Firestore setiap ketikan
function debounce(fn, ms = 800) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── State ─────────────────────────────────────────────────────
let projId      = null;
let proj        = null;          // data proyek lokal
let currentUser = null;
let segCounter  = 0;
let itemCounter = 0;
let saveTimeout = null;
let _dragSrcIdx = null;

// ─── Ambil ID proyek dari URL ───────────────────────────────────
function getProjIdFromURL() {
  return new URLSearchParams(window.location.search).get('id');
}

// ─── Simpan proyek ke Firestore (debounced) ────────────────────
const debouncedSave = debounce(async () => {
  if (!projId || !proj) return;
  try {
    await updateDoc(doc(db, 'projects', projId), {
      name:      proj.name      || '',
      startDate: proj.startDate || '',
      segments:  proj.segments  || [],
      items:     proj.items     || []
    });
    // Indikator simpan
    const ind = document.getElementById('save-indicator');
    if (ind) { ind.textContent = '✅ Tersimpan'; ind.style.color = 'var(--green)'; setTimeout(()=>{ ind.textContent=''; }, 2000); }
  } catch (err) {
    console.error('Simpan gagal:', err);
    toast('Gagal menyimpan. Cek koneksi.', 'error');
  }
}, 1000);

function saveProj() {
  const ind = document.getElementById('save-indicator');
  if (ind) { ind.textContent = '⏳ Menyimpan...'; ind.style.color = 'var(--muted)'; }
  debouncedSave();
}

// ─── INIT ───────────────────────────────────────────────────────
requireAuth(async (user) => {
  currentUser = user;
  projId = getProjIdFromURL();

  if (!projId) { window.location.href = '/dashboard.html'; return; }

  // Load data proyek
  const snap = await getDoc(doc(db, 'projects', projId));
  if (!snap.exists() || snap.data().uid !== user.uid) {
    alert('Proyek tidak ditemukan atau bukan milikmu.');
    window.location.href = '/dashboard.html';
    return;
  }

  proj = { id: snap.id, ...snap.data() };
  proj.segments = proj.segments || [];
  proj.items    = proj.items    || [];

  segCounter  = proj.segments.length ? Math.max(...proj.segments.map(s => s.id)) : 0;
  itemCounter = proj.items.length    ? Math.max(...proj.items.map(i => i.id))    : 0;

  // Isi field
  document.getElementById('proj-name').value  = proj.name      || '';
  document.getElementById('proj-start').value = proj.startDate || '';
  document.getElementById('header-proj-name').textContent = proj.name || 'Tanpa Nama';

  renderAll();
});

// ─── NAVIGASI ───────────────────────────────────────────────────
window.switchTab = (name, el) => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'gantt')     renderGantt();
  if (name === 'cost')      renderCost();
  if (name === 'realisasi') renderRealisasi();
  if (name === 'deviasi')   renderDeviasi();
};

// ─── INFO PROYEK ────────────────────────────────────────────────
document.getElementById('proj-name').addEventListener('input', (e) => {
  proj.name = e.target.value;
  document.getElementById('header-proj-name').textContent = proj.name || 'Tanpa Nama';
  updateKPI();
  saveProj();
});

document.getElementById('proj-start').addEventListener('input', (e) => {
  proj.startDate = e.target.value;
  updateKPI();
  saveProj();
});

// ─── RENDER ALL (setup) ─────────────────────────────────────────
function renderAll() {
  updateKPI();
  renderSegments();
  renderItemsTable();
  updateItemSelect();
}

// ─── KPI ────────────────────────────────────────────────────────
function calcTotalDur() {
  if (!proj.items.length) return 0;
  return Math.max(...proj.items.map(i => (i.startDay||1) + (i.dur||1) - 1));
}

function updateKPI() {
  const totalDur = calcTotalDur();
  document.getElementById('kpi-seg').textContent  = proj.segments.length;
  document.getElementById('kpi-item').textContent = proj.items.length;
  document.getElementById('kpi-dur').textContent  = totalDur + ' hari';

  if (proj.startDate) {
    const s = new Date(proj.startDate);
    document.getElementById('kpi-start').textContent = fmtDate(proj.startDate);
    const e = new Date(s);
    e.setDate(e.getDate() + totalDur - 1);
    document.getElementById('kpi-end').textContent = fmtDate(e);
  } else {
    document.getElementById('kpi-start').textContent = '—';
    document.getElementById('kpi-end').textContent   = '—';
  }
}

// ─── SEGMEN ─────────────────────────────────────────────────────
window.addSegment = () => {
  const name = document.getElementById('new-seg-name').value.trim();
  if (!name) return alert('Masukkan nama segmen!');
  proj.segments.push({ id: ++segCounter, name });
  document.getElementById('new-seg-name').value = '';
  saveProj();
  renderAll();
};

window.removeSegment = (id) => {
  if (!confirm('Hapus segmen dan semua item di dalamnya?')) return;
  proj.segments = proj.segments.filter(s => s.id !== id);
  proj.items    = proj.items.filter(i => i.segId !== id);
  saveProj();
  renderAll();
};

function renderSegments() {
  const el = document.getElementById('segment-list');
  document.getElementById('seg-count-badge').textContent = proj.segments.length;
  if (!proj.segments.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="table-wrap mt8"><table>
    <tr><th>#</th><th>Nama Segmen</th><th>Jumlah Item</th><th></th></tr>
    ${proj.segments.map((s, i) => {
      const cnt = proj.items.filter(it => it.segId === s.id).length;
      return `<tr>
        <td><span class="seg-strip bg${i%6}"></span></td>
        <td style="font-weight:600">${s.name}</td>
        <td class="mono">${cnt} item</td>
        <td><button class="btn btn-danger" onclick="removeSegment(${s.id})">Hapus</button></td>
      </tr>`;
    }).join('')}
  </table></div>`;
}

// ─── ITEM PEKERJAAN ─────────────────────────────────────────────
window.addItem = () => {
  const segId = parseInt(document.getElementById('new-item-seg').value);
  const name  = document.getElementById('new-item-name').value.trim();
  const dur   = parseInt(document.getElementById('new-item-dur').value)   || 1;
  const start = parseInt(document.getElementById('new-item-start').value) || 1;
  if (!segId) return alert('Pilih segmen!');
  if (!name)  return alert('Masukkan nama item!');
  proj.items.push({
    id: ++itemCounter, segId, name, dur, startDay: start,
    tenaga: [], material: [], progressActual: 0, costActual: 0, materialActual: []
  });
  document.getElementById('new-item-name').value = '';
  saveProj();
  renderAll();
};

window.removeItem = (id) => {
  proj.items = proj.items.filter(i => i.id !== id);
  saveProj();
  renderAll();
};

function renderItemsTable() {
  const el = document.getElementById('items-table-wrap');
  document.getElementById('item-count-badge').textContent = proj.items.length;
  if (!proj.items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div>Belum ada item.</div>';
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table id="items-drag-table">
    <tr><th style="width:28px"></th><th>#</th><th>Segmen</th><th>Item Pekerjaan</th><th>Mulai Hari</th><th>Selesai Hari</th><th>Durasi</th><th></th></tr>
    ${proj.items.map((it, idx) => {
      const seg = proj.segments.find(s => s.id === it.segId);
      const si  = proj.segments.indexOf(seg);
      return `<tr draggable="true" data-idx="${idx}" style="cursor:grab"
        ondragstart="itemDragStart(event,${idx})"
        ondragover="itemDragOver(event)"
        ondrop="itemDrop(event,${idx})"
        ondragend="itemDragEnd(event)">
        <td style="color:var(--muted);font-size:16px;text-align:center">⠿</td>
        <td class="mono">${idx+1}</td>
        <td><span class="c${si%6}" style="font-weight:600">${seg?.name||'—'}</span></td>
        <td>${it.name}</td>
        <td class="mono">${it.startDay}</td>
        <td class="mono">${it.startDay+it.dur-1}</td>
        <td class="mono">${it.dur} hari</td>
        <td><button class="btn btn-danger" onclick="removeItem(${it.id})">✕</button></td>
      </tr>`;
    }).join('')}
  </table></div>`;
}

function updateItemSelect() {
  const sel = document.getElementById('new-item-seg');
  sel.innerHTML = '<option value="">-- Pilih Segmen --</option>' +
    proj.segments.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

// ─── DRAG & DROP ITEMS ──────────────────────────────────────────
window.itemDragStart = (e, idx) => {
  _dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.4';
};
window.itemDragOver = (e) => {
  e.preventDefault();
  document.querySelectorAll('#items-drag-table tr[data-idx]').forEach(r => r.style.borderTop = '');
  e.currentTarget.style.borderTop = '2px solid var(--accent)';
};
window.itemDragEnd = (e) => {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('#items-drag-table tr[data-idx]').forEach(r => r.style.borderTop = '');
};
window.itemDrop = (e, toIdx) => {
  e.preventDefault();
  if (_dragSrcIdx === null || _dragSrcIdx === toIdx) return;
  const moved = proj.items.splice(_dragSrcIdx, 1)[0];
  proj.items.splice(toIdx, 0, moved);
  _dragSrcIdx = null;
  saveProj();
  renderAll();
};

// ─── GANTT ──────────────────────────────────────────────────────
function renderGantt() {
  const el = document.getElementById('gantt-container');
  if (!proj.items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📅</div>Belum ada data.</div>';
    return;
  }
  const totalDur = calcTotalDur();
  let html = `<div class="gantt-wrap"><table class="gantt-table"><thead><tr>
    <th class="gantt-label" style="text-align:left">Item Pekerjaan</th><th>Dur</th>
    ${Array.from({length:totalDur},(_,i)=>`<th>H${i+1}</th>`).join('')}
  </tr></thead><tbody>`;

  proj.segments.forEach((seg, si) => {
    const items = proj.items.filter(i => i.segId === seg.id);
    if (!items.length) return;
    html += `<tr style="background:#0d1220"><td colspan="${3+totalDur}" style="padding:5px 10px;font-weight:700;font-size:11px;color:${HEX[si%6]};text-transform:uppercase;letter-spacing:1px">${seg.name}</td></tr>`;
    items.forEach(it => {
      const prog  = it.progressActual || 0;
      const planL = (((it.startDay-1)/totalDur)*100).toFixed(2)+'%';
      const planW = ((it.dur/totalDur)*100).toFixed(2)+'%';
      const actW  = (((it.dur*prog/100)/totalDur)*100).toFixed(2)+'%';
      html += `<tr>
        <td class="gantt-label" title="${it.name}">${it.name}</td>
        <td class="mono" style="text-align:center;font-size:11px">${it.dur}h</td>
        <td colspan="${totalDur}" style="position:relative;height:28px;padding:0">
          <div class="gantt-bar bg${si%6}" style="left:${planL};width:${planW};opacity:0.8"></div>
          ${prog > 0 ? `<div class="gantt-bar" style="left:${planL};width:${actW};background:rgba(255,255,255,0.12);border:1.5px solid ${HEX[si%6]};font-size:9px;font-weight:700;color:#fff">${prog}%</div>` : ''}
        </td></tr>`;
    });
  });

  html += '</tbody></table></div>';
  html += `<div style="margin-top:10px;display:flex;gap:16px;font-size:11px;color:var(--muted)">
    <div style="display:flex;align-items:center;gap:5px"><div style="width:14px;height:6px;background:#3b82f6;border-radius:2px;opacity:0.8"></div>Rencana</div>
    <div style="display:flex;align-items:center;gap:5px"><div style="width:14px;height:6px;border:1.5px solid #3b82f6;border-radius:2px"></div>Aktual</div>
  </div>`;
  el.innerHTML = html;
}

// ─── BIAYA ──────────────────────────────────────────────────────
function renderCost() {
  const el = document.getElementById('cost-sections');
  if (!proj.items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">💰</div>Belum ada item.</div>';
    return;
  }
  let tt = 0, tm = 0, html = '';

  proj.segments.forEach((seg, si) => {
    const items = proj.items.filter(i => i.segId === seg.id);
    if (!items.length) return;
    html += `<div class="card" style="border-left:3px solid ${HEX[si%6]}">
      <div class="card-title c${si%6}">📌 ${seg.name}</div>`;

    items.forEach(it => {
      const st = (it.tenaga||[]).reduce((a,t) => a + t.jumlah*t.harga, 0);
      const sm = (it.material||[]).reduce((a,m) => a + m.volume*m.harga, 0);
      tt += st; tm += sm;

      const tRows = (it.tenaga||[]).map((t,ti) => `<tr>
        <td><input type="text" value="${t.nama}" onchange="updT(${it.id},${ti},'nama',this.value)" placeholder="Mandor, Tukang..." style="width:140px"></td>
        <td><input type="number" value="${t.jumlah}" onchange="updT(${it.id},${ti},'jumlah',this.value)" style="width:60px"></td>
        <td><input type="text" value="${t.satuan}" onchange="updT(${it.id},${ti},'satuan',this.value)" style="width:65px"></td>
        <td><input type="number" value="${t.harga}" onchange="updT(${it.id},${ti},'harga',this.value)" style="width:110px"></td>
        <td class="mono">${fmtRp(t.jumlah*t.harga)}</td>
        <td><button class="btn btn-danger" onclick="delT(${it.id},${ti})">✕</button></td>
      </tr>`).join('');

      const mRows = (it.material||[]).map((m,mi) => `<tr>
        <td><input type="text" value="${m.nama}" onchange="updM(${it.id},${mi},'nama',this.value)" placeholder="Beton, Besi..." style="width:140px"></td>
        <td><input type="number" value="${m.volume}" onchange="updM(${it.id},${mi},'volume',this.value)" style="width:80px"></td>
        <td><input type="text" value="${m.satuan}" onchange="updM(${it.id},${mi},'satuan',this.value)" style="width:60px"></td>
        <td><input type="number" value="${m.harga}" onchange="updM(${it.id},${mi},'harga',this.value)" style="width:110px"></td>
        <td class="mono">${fmtRp(m.volume*m.harga)}</td>
        <td><button class="btn btn-danger" onclick="delM(${it.id},${mi})">✕</button></td>
      </tr>`).join('');

      html += `<div class="item-block">
        <div class="item-block-header">
          <div style="font-weight:600">${it.name} <span class="mono" style="color:var(--muted);font-size:11px">| ${it.dur} hari | Hari ${it.startDay}–${it.startDay+it.dur-1}</span></div>
          <div class="mono" style="color:var(--yellow);font-weight:700">${fmtRp(st+sm)}</div>
        </div>
        <div class="sub-label">👷 Tenaga Kerja</div>
        <div class="table-wrap"><table>
          <tr><th>Jenis</th><th>Jml</th><th>Satuan</th><th>Harga/Satuan</th><th>Subtotal</th><th></th></tr>
          ${tRows}
        </table></div>
        <button class="btn btn-ghost mt8" onclick="addT(${it.id})" style="font-size:11px;padding:4px 10px">+ Tenaga</button>
        <div class="sub-label">📦 Material</div>
        <div class="table-wrap"><table>
          <tr><th>Nama</th><th>Volume</th><th>Satuan</th><th>Harga/Satuan</th><th>Subtotal</th><th></th></tr>
          ${mRows}
        </table></div>
        <button class="btn btn-ghost mt8" onclick="addM(${it.id})" style="font-size:11px;padding:4px 10px">+ Material</button>
      </div>`;
    });
    html += '</div>';
  });

  el.innerHTML = html;
  document.getElementById('kpi-total-cost').textContent   = fmtRp(tt + tm);
  document.getElementById('kpi-tenaga-cost').textContent  = fmtRp(tt);
  document.getElementById('kpi-material-cost').textContent = fmtRp(tm);
}

function refreshCostKPI() {
  let tt = 0, tm = 0;
  proj.items.forEach(it => {
    tt += (it.tenaga||[]).reduce((a,t) => a + t.jumlah*t.harga, 0);
    tm += (it.material||[]).reduce((a,m) => a + m.volume*m.harga, 0);
  });
  document.getElementById('kpi-total-cost').textContent   = fmtRp(tt + tm);
  document.getElementById('kpi-tenaga-cost').textContent  = fmtRp(tt);
  document.getElementById('kpi-material-cost').textContent = fmtRp(tm);
}

window.addT = (id) => { const it=proj.items.find(i=>i.id===id); it.tenaga.push({nama:'',jumlah:1,satuan:'OH',harga:0}); saveProj(); renderCost(); };
window.delT = (id,ti) => { const it=proj.items.find(i=>i.id===id); it.tenaga.splice(ti,1); saveProj(); renderCost(); };
window.updT = (id,ti,f,v) => {
  const it = proj.items.find(i=>i.id===id);
  it.tenaga[ti][f] = (f==='nama'||f==='satuan') ? v : parseFloat(v)||0;
  saveProj(); refreshCostKPI();
};
window.addM = (id) => { const it=proj.items.find(i=>i.id===id); it.material.push({nama:'',volume:0,satuan:'m3',harga:0}); saveProj(); renderCost(); };
window.delM = (id,mi) => { const it=proj.items.find(i=>i.id===id); it.material.splice(mi,1); saveProj(); renderCost(); };
window.updM = (id,mi,f,v) => {
  const it = proj.items.find(i=>i.id===id);
  it.material[mi][f] = (f==='nama'||f==='satuan') ? v : parseFloat(v)||0;
  saveProj(); refreshCostKPI();
};

// ─── REALISASI ──────────────────────────────────────────────────
function renderRealisasi() {
  const el = document.getElementById('realisasi-sections');
  if (!proj.items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📊</div>Belum ada data.</div>';
    return;
  }
  let html = '';

  proj.segments.forEach((seg, si) => {
    const items = proj.items.filter(i => i.segId === seg.id);
    if (!items.length) return;
    html += `<div class="card" style="border-left:3px solid ${HEX[si%6]}"><div class="card-title c${si%6}">📌 ${seg.name}</div>`;

    items.forEach(it => {
      // Sync materialActual length
      while ((it.materialActual||[]).length < (it.material||[]).length) {
        if (!it.materialActual) it.materialActual = [];
        const m = it.material[it.materialActual.length];
        it.materialActual.push({ ...m, volumeActual: 0 });
      }

      const mActRows = (it.material||[]).map((m, mi) => {
        const ma  = (it.materialActual||[])[mi] || { volumeActual: 0 };
        const dev = (ma.volumeActual||0) - m.volume;
        return `<tr>
          <td>${m.nama||'—'}</td>
          <td class="mono">${m.volume} ${m.satuan}</td>
          <td><input type="number" value="${ma.volumeActual||0}" min="0" onchange="updMA(${it.id},${mi},this.value)" style="width:90px"> ${m.satuan}</td>
          <td>${dev===0 ? '<span class="dev-zero">±0</span>' : dev>0 ? `<span class="dev-neg">+${dev.toFixed(2)}</span>` : `<span class="dev-pos">${dev.toFixed(2)}</span>`}</td>
        </tr>`;
      }).join('');

      html += `<div class="item-block">
        <div style="font-weight:600;margin-bottom:12px">${it.name}</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <div class="sub-label" style="margin-top:0">Progress Aktual (%)</div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" value="${it.progressActual||0}" min="0" max="100" onchange="updProg(${it.id},this.value)" style="width:80px">
              <span class="mono" style="color:var(--muted)">%</span>
            </div>
            <div class="prog-bar mt8" style="width:180px">
              <div class="prog-fill bg${si%6}" style="width:${it.progressActual||0}%"></div>
            </div>
          </div>
          <div>
            <div class="sub-label" style="margin-top:0">Biaya Aktual (Rp)</div>
            <input type="number" value="${it.costActual||0}" onchange="updCA(${it.id},this.value)" style="width:180px">
          </div>
        </div>
        ${it.material.length ? `
        <div class="sub-label">📦 Realisasi Material</div>
        <div class="table-wrap"><table>
          <tr><th>Material</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th></tr>
          ${mActRows}
        </table></div>` : ''}
      </div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

window.updProg = (id, v) => { const it=proj.items.find(i=>i.id===id); it.progressActual=parseFloat(v)||0; saveProj(); };
window.updCA   = (id, v) => { const it=proj.items.find(i=>i.id===id); it.costActual=parseFloat(v)||0; saveProj(); };
window.updMA   = (id, mi, v) => {
  const it = proj.items.find(i=>i.id===id);
  if (!it.materialActual) it.materialActual = [];
  if (!it.materialActual[mi]) it.materialActual[mi] = {};
  it.materialActual[mi].volumeActual = parseFloat(v)||0;
  saveProj();
};

// ─── DEVIASI ────────────────────────────────────────────────────
function renderDeviasi() {
  const avgProg = proj.items.length
    ? (proj.items.reduce((a,i) => a+(i.progressActual||0), 0) / proj.items.length).toFixed(1)
    : 0;

  const costPlan = proj.items.reduce((a, i) => {
    return a + (i.tenaga||[]).reduce((s,t) => s+t.jumlah*t.harga, 0)
             + (i.material||[]).reduce((s,m) => s+m.volume*m.harga, 0);
  }, 0);
  const costAct = proj.items.reduce((a,i) => a+(i.costActual||0), 0);
  const costDev = costAct - costPlan;

  document.getElementById('deviasi-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Avg Progress</div>
      <div class="kpi-value ${avgProg>=80?'green':avgProg>=50?'yellow':'red'}">${avgProg}%</div>
      <div class="prog-bar"><div class="prog-fill bg4" style="width:${avgProg}%"></div></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Selesai 100%</div>
      <div class="kpi-value green">${proj.items.filter(i=>i.progressActual>=100).length}</div>
      <div class="kpi-sub">dari ${proj.items.length} item</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Biaya Rencana</div>
      <div class="kpi-value blue" style="font-size:16px">${fmtRp(costPlan)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Biaya Aktual</div>
      <div class="kpi-value ${costAct<=costPlan?'green':'red'}" style="font-size:16px">${fmtRp(costAct)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Deviasi Biaya</div>
      <div class="kpi-value ${costDev<=0?'green':'red'}" style="font-size:16px">${costDev<=0?'-':'+'}${fmtRp(Math.abs(costDev))}</div>
      <div class="kpi-sub">${costDev<=0?'✅ Under Budget':'⚠️ Over Budget'}</div>
    </div>`;

  // Tabel Progress
  let ph = `<div class="table-wrap"><table>
    <tr><th>Segmen</th><th>Item</th><th>Durasi</th><th>Hari</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th><th>Status</th></tr>`;
  proj.items.forEach(it => {
    const seg = proj.segments.find(s => s.id === it.segId);
    const si  = proj.segments.indexOf(seg);
    const actual = it.progressActual||0;
    const dev    = actual - 100;
    ph += `<tr>
      <td><span class="c${si%6}" style="font-weight:600">${seg?.name||'—'}</span></td>
      <td>${it.name}</td>
      <td class="mono">${it.dur}h</td>
      <td class="mono">${it.startDay}–${it.startDay+it.dur-1}</td>
      <td class="mono">100%</td>
      <td class="mono">${actual}%</td>
      <td class="mono">${dev===0?'<span class="dev-zero">±0%</span>':dev>0?`<span class="dev-pos">+${dev}%</span>`:`<span class="dev-neg">${dev}%</span>`}</td>
      <td>${actual>=100?'✅ Selesai':actual>0?'🟠 On Progress':'🔵 Belum'}</td>
    </tr>`;
  });
  document.getElementById('dev-progress').innerHTML = proj.items.length ? ph+'</table></div>' : '<div class="empty">Belum ada data.</div>';

  // Tabel Material
  let mRows = [];
  proj.items.forEach(it => {
    const seg = proj.segments.find(s=>s.id===it.segId);
    const si  = proj.segments.indexOf(seg);
    (it.material||[]).forEach((m,mi) => {
      const ma  = (it.materialActual||[])[mi]||{volumeActual:0};
      const dev = (ma.volumeActual||0) - m.volume;
      mRows.push({seg,si,it,m,ma,dev});
    });
  });
  let mh = `<div class="table-wrap"><table>
    <tr><th>Segmen</th><th>Item</th><th>Material</th><th>Satuan</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th><th>%</th></tr>`;
  mRows.forEach(({seg,si,it,m,ma,dev}) => {
    const pct = m.volume>0 ? ((ma.volumeActual||0)/m.volume*100).toFixed(0) : 0;
    mh += `<tr>
      <td><span class="c${si%6}" style="font-weight:600">${seg?.name||'—'}</span></td>
      <td>${it.name}</td><td>${m.nama||'—'}</td><td class="mono">${m.satuan}</td>
      <td class="mono">${m.volume}</td><td class="mono">${ma.volumeActual||0}</td>
      <td class="mono">${dev===0?'<span class="dev-zero">±0</span>':dev>0?`<span class="dev-neg">+${dev.toFixed(2)} ▲</span>`:`<span class="dev-pos">${dev.toFixed(2)} ▼</span>`}</td>
      <td class="mono" style="color:${pct>=100?'var(--green)':pct>0?'var(--yellow)':'var(--muted)'}">${pct}%</td>
    </tr>`;
  });
  document.getElementById('dev-material').innerHTML = mRows.length ? mh+'</table></div>' : '<div class="empty"><div class="empty-icon">📦</div>Belum ada material.</div>';

  // Tabel Biaya
  let ch = `<div class="table-wrap"><table>
    <tr><th>Segmen</th><th>Item</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th><th>Status</th></tr>`;
  proj.items.forEach(it => {
    const seg  = proj.segments.find(s=>s.id===it.segId);
    const si   = proj.segments.indexOf(seg);
    const plan = (it.tenaga||[]).reduce((a,t)=>a+t.jumlah*t.harga,0)+(it.material||[]).reduce((a,m)=>a+m.volume*m.harga,0);
    const act  = it.costActual||0;
    const dev  = act - plan;
    ch += `<tr>
      <td><span class="c${si%6}" style="font-weight:600">${seg?.name||'—'}</span></td>
      <td>${it.name}</td>
      <td class="mono">${fmtRp(plan)}</td>
      <td class="mono">${fmtRp(act)}</td>
      <td class="mono">${dev===0?'<span class="dev-zero">±0</span>':dev>0?`<span class="dev-neg">+${fmtRp(dev)} ▲</span>`:`<span class="dev-pos">${fmtRp(Math.abs(dev))} ▼</span>`}</td>
      <td>${dev<=0?'✅ Under':'⚠️ Over'}</td>
    </tr>`;
  });
  document.getElementById('dev-cost').innerHTML = proj.items.length ? ch+'</table></div>' : '<div class="empty">Belum ada data.</div>';
}
