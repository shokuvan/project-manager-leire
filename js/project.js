// ═══════════════════════════════════════════════════════════════
// PROJECT.JS — Detail Proyek: Setup, Gantt, Biaya, Realisasi, Deviasi
// Revisi: Gantt Planning+Realisasi bar per item | Report Harian
//         mulai dari tanggal realisasi dimulai yg diinput user
// ═══════════════════════════════════════════════════════════════

import { db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Helpers ───────────────────────────────────────────────────
const HEX = ['#3b82f6','#06b6d4','#8b5cf6','#f59e0b','#22c55e','#f43f5e'];
const UNITS = ["m¹","m²","m³","unit","buah","kg","ton","ls","set"];

function fmtRp(n) {
  return 'Rp ' + (Math.round(n)||0).toLocaleString('id-ID');
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function addDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function diffDays(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a + 'T00:00:00');
  const db_ = new Date(b + 'T00:00:00');
  return Math.round((db_ - da) / 86400000);
}

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
let proj        = null;
let currentUser = null;
let segCounter  = 0;
let actCounter  = 0;
let itemCounter = 0;

function getProjIdFromURL() {
  return new URLSearchParams(window.location.search).get('id');
}

// ─── Simpan ke Firestore ────────────────────────────────────────
const debouncedSave = debounce(async () => {
  if (!projId || !proj) return;
  try {
    await updateDoc(doc(db, 'projects', projId), {
      name:           proj.name          || '',
      startDate:      proj.startDate     || '',
      volumePlanning: proj.volumePlanning || 0,
      volumeUnit:     proj.volumeUnit    || 'm²',
      segments:       proj.segments      || [],
      activities:     proj.activities    || [],
      items:          proj.items         || []
    });
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

  const snap = await getDoc(doc(db, 'projects', projId));
  if (!snap.exists()) {
    alert('Proyek tidak ditemukan.');
    window.location.href = '/dashboard.html';
    return;
  }

  proj = { id: snap.id, ...snap.data() };
  proj.segments     = proj.segments   || [];
  proj.activities   = proj.activities || [];
  proj.items        = proj.items      || [];
  proj.volumePlanning = proj.volumePlanning || 0;
  proj.volumeUnit   = proj.volumeUnit  || 'm²';

  // Migrasi data lama
  if (proj.items.length && proj.items[0].startDay !== undefined && !proj.items[0].planStart) {
    const base = proj.startDate || new Date().toISOString().slice(0,10);
    proj.items.forEach(it => {
      if (!it.planStart) it.planStart = addDays(base, (it.startDay||1) - 1);
    });
  }

  proj.items.forEach(it => {
    if (it.planStart && it.dur) it.planEnd = addDays(it.planStart, it.dur - 1);
    if (it.realisasiStart && it.dur) it.realisasiEnd = addDays(it.realisasiStart, it.dur - 1);
    if (!it.dailyReports) it.dailyReports = [];
    // reportStartDate: tanggal awal user mulai input report harian
    // default = realisasiStart jika ada, atau kosong
    if (!it.reportStartDate) it.reportStartDate = it.realisasiStart || '';
  });

  segCounter  = proj.segments.length   ? Math.max(...proj.segments.map(s=>s.id))   : 0;
  actCounter  = proj.activities.length  ? Math.max(...proj.activities.map(a=>a.id)) : 0;
  itemCounter = proj.items.length       ? Math.max(...proj.items.map(i=>i.id))      : 0;

  document.getElementById('proj-name').value     = proj.name      || '';
  document.getElementById('proj-start').value    = proj.startDate || '';
  document.getElementById('proj-vol-qty').value  = proj.volumePlanning || 0;
  document.getElementById('proj-vol-unit').value = proj.volumeUnit    || 'm²';
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
  updateKPI(); saveProj();
});

document.getElementById('proj-start').addEventListener('input', (e) => {
  proj.startDate = e.target.value;
  updateKPI(); saveProj();
});

document.getElementById('proj-vol-qty').addEventListener('input', (e) => {
  proj.volumePlanning = parseFloat(e.target.value) || 0;
  saveProj();
});

document.getElementById('proj-vol-unit').addEventListener('change', (e) => {
  proj.volumeUnit = e.target.value;
  saveProj();
});

// ─── RENDER ALL ─────────────────────────────────────────────────
function renderAll() {
  updateKPI();
  renderSegments();
  renderActivities();
  renderItemsTable();
  updateActivitySelect();
}

// ─── KPI ────────────────────────────────────────────────────────
function updateKPI() {
  document.getElementById('kpi-seg').textContent  = proj.segments.length;
  document.getElementById('kpi-act').textContent  = proj.activities.length;
  document.getElementById('kpi-item').textContent = proj.items.length;

  if (proj.items.length && proj.startDate) {
    const starts = proj.items.filter(i=>i.planStart).map(i=>i.planStart);
    const ends   = proj.items.filter(i=>i.planEnd).map(i=>i.planEnd);
    if (starts.length) {
      const earliest = starts.sort()[0];
      const latest   = ends.sort().reverse()[0];
      const dur = diffDays(earliest, latest) + 1;
      document.getElementById('kpi-dur').textContent   = dur + ' hari';
      document.getElementById('kpi-start').textContent = fmtDate(earliest);
      document.getElementById('kpi-end').textContent   = fmtDate(latest);
      return;
    }
  }
  document.getElementById('kpi-dur').textContent   = '0 hari';
  document.getElementById('kpi-start').textContent = proj.startDate ? fmtDate(proj.startDate) : '—';
  document.getElementById('kpi-end').textContent   = '—';
}

// ─── SEGMEN ─────────────────────────────────────────────────────
window.addSegment = () => {
  const name = document.getElementById('new-seg-name').value.trim();
  if (!name) return alert('Masukkan nama segmen!');
  proj.segments.push({ id: ++segCounter, name });
  document.getElementById('new-seg-name').value = '';
  saveProj(); renderAll();
};

window.removeSegment = (id) => {
  if (!confirm('Hapus segmen beserta semua aktivitas dan item di dalamnya?')) return;
  const actIds = proj.activities.filter(a=>a.segId===id).map(a=>a.id);
  proj.segments   = proj.segments.filter(s => s.id !== id);
  proj.activities = proj.activities.filter(a => a.segId !== id);
  proj.items      = proj.items.filter(i => !actIds.includes(i.actId));
  saveProj(); renderAll();
};

function renderSegments() {
  const el = document.getElementById('segment-list');
  document.getElementById('seg-count-badge').textContent = proj.segments.length;
  if (!proj.segments.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="table-wrap mt8"><table>
    <tr><th>#</th><th>Nama Segmen</th><th>Aktivitas</th><th>Item</th><th></th></tr>
    ${proj.segments.map((s, i) => {
      const actIds  = proj.activities.filter(a=>a.segId===s.id).map(a=>a.id);
      const itemCnt = proj.items.filter(it=>actIds.includes(it.actId)).length;
      return `<tr>
        <td><span class="seg-strip bg${i%6}"></span></td>
        <td style="font-weight:600">${s.name}</td>
        <td class="mono">${actIds.length} aktivitas</td>
        <td class="mono">${itemCnt} item</td>
        <td><button class="btn btn-danger" onclick="removeSegment(${s.id})">Hapus</button></td>
      </tr>`;
    }).join('')}
  </table></div>`;
}

// ─── AKTIVITAS ──────────────────────────────────────────────────
window.addActivity = () => {
  const segId = parseInt(document.getElementById('new-act-seg').value);
  const name  = document.getElementById('new-act-name').value.trim();
  if (!segId) return alert('Pilih segmen!');
  if (!name)  return alert('Masukkan nama aktivitas!');
  proj.activities.push({ id: ++actCounter, segId, name });
  document.getElementById('new-act-name').value = '';
  saveProj(); renderAll();
};

window.removeActivity = (id) => {
  if (!confirm('Hapus aktivitas dan semua item di dalamnya?')) return;
  proj.activities = proj.activities.filter(a => a.id !== id);
  proj.items      = proj.items.filter(i => i.actId !== id);
  saveProj(); renderAll();
};

function renderActivities() {
  const el = document.getElementById('activity-list');
  document.getElementById('act-count-badge').textContent = proj.activities.length;

  const segSel = document.getElementById('new-act-seg');
  segSel.innerHTML = '<option value="">-- Pilih Segmen --</option>' +
    proj.segments.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  if (!proj.activities.length) { el.innerHTML = ''; return; }

  let html = '';
  proj.segments.forEach((seg, si) => {
    const acts = proj.activities.filter(a => a.segId === seg.id);
    if (!acts.length) return;
    html += `<div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:${HEX[si%6]};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding:4px 8px;background:${HEX[si%6]}18;border-radius:4px;display:inline-block">${seg.name}</div>
      <div class="table-wrap"><table>
        <tr><th>#</th><th>Nama Aktivitas</th><th>Item</th><th></th></tr>
        ${acts.map((a, ai) => {
          const cnt = proj.items.filter(i=>i.actId===a.id).length;
          return `<tr>
            <td class="mono" style="color:var(--muted)">${ai+1}</td>
            <td>${a.name}</td>
            <td class="mono">${cnt} item</td>
            <td><button class="btn btn-danger" onclick="removeActivity(${a.id})">Hapus</button></td>
          </tr>`;
        }).join('')}
      </table></div>
    </div>`;
  });
  el.innerHTML = html;
}

function updateActivitySelect() {
  const sel = document.getElementById('new-item-act');
  sel.innerHTML = '<option value="">-- Pilih Aktivitas --</option>';
  proj.segments.forEach((seg, si) => {
    const acts = proj.activities.filter(a => a.segId === seg.id);
    if (!acts.length) return;
    const grp = document.createElement('optgroup');
    grp.label = seg.name;
    acts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
}

// ─── ITEM PEKERJAAN ─────────────────────────────────────────────
window.addItem = () => {
  const actId     = parseInt(document.getElementById('new-item-act').value);
  const name      = document.getElementById('new-item-name').value.trim();
  const dur       = parseInt(document.getElementById('new-item-dur').value) || 1;
  const planStart = document.getElementById('new-item-planstart').value;

  if (!actId)     return alert('Pilih aktivitas!');
  if (!name)      return alert('Masukkan nama item!');
  if (!planStart) return alert('Masukkan tanggal mulai rencana!');

  const planEnd = addDays(planStart, dur - 1);

  proj.items.push({
    id: ++itemCounter, actId, name, dur, planStart, planEnd,
    realisasiStart: '', realisasiEnd: '',
    reportStartDate: '',
    planQty: 0, planUnit: 'm²',
    realisasiQty: 0,
    dailyReports: [],
    tenaga: [], material: [], costActual: 0, materialActual: []
  });
  document.getElementById('new-item-name').value      = '';
  document.getElementById('new-item-planstart').value = '';
  saveProj(); renderAll();
};

window.removeItem = (id) => {
  proj.items = proj.items.filter(i => i.id !== id);
  saveProj(); renderAll();
};

window.updRealisasiStart = (id, val) => {
  const it = proj.items.find(i => i.id === id);
  if (!it) return;
  it.realisasiStart = val;
  it.realisasiEnd   = val ? addDays(val, it.dur - 1) : '';
  // Set reportStartDate ke realisasiStart jika belum ada report
  if (!it.reportStartDate || !it.dailyReports.length) {
    it.reportStartDate = val;
    // Update date input di form report harian jika ada
    const rsEl = document.getElementById(`report-start-date-${id}`);
    if (rsEl) rsEl.value = val;
    const newRepDate = document.getElementById(`new-report-date-${id}`);
    if (newRepDate && val) newRepDate.value = val;
  }
  const endEl = document.getElementById(`real-end-${id}`);
  if (endEl) endEl.textContent = it.realisasiEnd ? fmtDate(it.realisasiEnd) : '—';
  const badgeEl = document.getElementById(`late-badge-${id}`);
  if (badgeEl) badgeEl.innerHTML = lateBadgeHtml(it);
  saveProj();
};

window.updReportStartDate = (id, val) => {
  const it = proj.items.find(i => i.id === id);
  if (!it) return;
  it.reportStartDate = val;
  // Update default tanggal di form tambah report
  const newRepDate = document.getElementById(`new-report-date-${id}`);
  if (newRepDate) newRepDate.value = val;
  saveProj();
};

function lateBadgeHtml(it) {
  const late = it.realisasiStart && it.planStart ? diffDays(it.planStart, it.realisasiStart) : null;
  if (late === null) return '<span style="color:var(--muted);font-size:11px">—</span>';
  if (late > 0) return `<span class="late-badge">+${late} hr terlambat</span>`;
  if (late < 0) return `<span class="early-badge">${Math.abs(late)} hr lebih awal</span>`;
  return '<span style="color:var(--green);font-size:11px">✅ Tepat waktu</span>';
}

window.updDur = (id, val) => {
  const it = proj.items.find(i => i.id === id);
  if (!it) return;
  it.dur = parseInt(val) || 1;
  it.planEnd       = it.planStart       ? addDays(it.planStart, it.dur - 1)       : '';
  it.realisasiEnd  = it.realisasiStart  ? addDays(it.realisasiStart, it.dur - 1)  : '';
  const planEndEl = document.getElementById(`plan-end-${id}`);
  if (planEndEl) planEndEl.textContent = fmtDate(it.planEnd);
  const realEndEl = document.getElementById(`real-end-${id}`);
  if (realEndEl) realEndEl.textContent = it.realisasiEnd ? fmtDate(it.realisasiEnd) : '—';
  saveProj();
};

function renderItemsTable() {
  const el = document.getElementById('items-table-wrap');
  document.getElementById('item-count-badge').textContent = proj.items.length;
  if (!proj.items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div>Belum ada item.</div>';
    return;
  }

  let html = '';
  proj.segments.forEach((seg, si) => {
    const segActs  = proj.activities.filter(a => a.segId === seg.id);
    const segItems = proj.items.filter(i => segActs.some(a => a.id === i.actId));
    if (!segItems.length) return;

    html += `<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:${HEX[si%6]};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding:6px 10px;background:${HEX[si%6]}15;border-radius:6px;border-left:3px solid ${HEX[si%6]}">${seg.name}</div>`;

    segActs.forEach(act => {
      const actItems = proj.items.filter(i => i.actId === act.id);
      if (!actItems.length) return;

      html += `<div style="margin-left:12px;margin-bottom:12px">
        <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:6px">▸ ${act.name}</div>
        <div class="table-wrap"><table>
          <tr>
            <th style="width:28px"></th><th>#</th><th>Nama Item</th>
            <th>Rencana Mulai</th><th>Durasi (hr)</th><th>Rencana Selesai</th>
            <th>Realisasi Mulai</th><th>Realisasi Selesai</th>
            <th>Keterlambatan</th><th></th>
          </tr>
          <tbody data-act-id="${act.id}">
          ${actItems.map((it, idx) => `<tr draggable="true">
              <td style="color:var(--muted);font-size:16px;text-align:center;cursor:grab">⠿</td>
              <td class="mono">${idx+1}</td>
              <td style="font-weight:600">${it.name}</td>
              <td class="mono">${fmtDate(it.planStart)}</td>
              <td><input type="number" value="${it.dur}" min="1" style="width:60px"
                onchange="updDur(${it.id},this.value)"></td>
              <td class="mono" id="plan-end-${it.id}">${fmtDate(it.planEnd)}</td>
              <td><input type="date" id="real-start-input-${it.id}" value="${it.realisasiStart||''}" style="width:150px"
                onchange="updRealisasiStart(${it.id},this.value)"></td>
              <td class="mono" id="real-end-${it.id}">${it.realisasiEnd ? fmtDate(it.realisasiEnd) : '—'}</td>
              <td id="late-badge-${it.id}">${lateBadgeHtml(it)}</td>
              <td><button class="btn btn-danger" onclick="removeItem(${it.id})">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
    });
    html += '</div>';
  });

  el.innerHTML = html;

  // Drag & drop
  el.querySelectorAll('tbody[data-act-id]').forEach(tbody => {
    const actId = parseInt(tbody.dataset.actId);
    let dragSrcIdx = null;
    tbody.querySelectorAll('tr[draggable]').forEach((row, idx) => {
      row.addEventListener('dragstart', e => {
        dragSrcIdx = idx; row.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '';
        tbody.querySelectorAll('tr').forEach(r => r.style.outline = '');
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        tbody.querySelectorAll('tr').forEach(r => r.style.outline = '');
        row.style.outline = '2px solid var(--blue)';
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (dragSrcIdx === null || dragSrcIdx === idx) return;
        const actItems = proj.items.filter(i => i.actId === actId);
        const [moved]  = actItems.splice(dragSrcIdx, 1);
        actItems.splice(idx, 0, moved);
        const others   = proj.items.filter(i => i.actId !== actId);
        const insertAt = proj.items.findIndex(i => i.actId === actId);
        others.splice(insertAt === -1 ? others.length : insertAt, 0, ...actItems);
        proj.items = others;
        saveProj(); renderAll();
      });
    });
  });
}

// ─── GANTT ─────────────────────────────────────────────────────
// Struktur per item: 2 baris
//   Baris 1 - Planning: bar dari planStart → planEnd (outline/warna segmen transparan)
//   Baris 2 - Realisasi: per hari yang ada daily report = 1 blok solid dengan % kumulatif di dalamnya
function renderGantt() {
  const el = document.getElementById('gantt-container');
  const itemsWithDates = proj.items.filter(i => i.planStart);

  if (!itemsWithDates.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📅</div>Belum ada data atau tanggal belum diisi.</div>';
    return;
  }

  // ─── Rentang tanggal global ───────────────────────────────────
  const allDates = [];
  proj.items.forEach(i => {
    if (i.planStart) allDates.push(i.planStart);
    if (i.planEnd)   allDates.push(i.planEnd);
    if (i.realisasiStart) allDates.push(i.realisasiStart);
    if (i.realisasiEnd)   allDates.push(i.realisasiEnd);
    (i.dailyReports||[]).forEach(r => { if (r.date) allDates.push(r.date); });
  });

  const sortedAll = allDates.slice().sort();
  const minDate   = sortedAll[0];
  const maxDate   = sortedAll[sortedAll.length - 1];
  const totalDays = diffDays(minDate, maxDate) + 1;

  const dates = [];
  for (let d = 0; d < totalDays; d++) dates.push(addDays(minDate, d));

  const todayStr = new Date().toISOString().slice(0, 10);

  // ─── Header bulan ─────────────────────────────────────────────
  const months = [];
  let lastMonth = '';
  dates.forEach(dt => {
    const mo = dt.slice(0, 7);
    if (mo !== lastMonth) { months.push({ mo, count: 0 }); lastMonth = mo; }
    months[months.length - 1].count++;
  });

  const monthHeader = months.map(m => {
    const label = new Date(m.mo + '-01').toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    return `<th colspan="${m.count}" style="text-align:center;border-left:2px solid var(--border);font-size:11px;background:var(--surface2);padding:3px 2px;white-space:nowrap">${label}</th>`;
  }).join('');

  // ─── Header hari ──────────────────────────────────────────────
  const dayHeader = dates.map(dt => {
    const d = new Date(dt + 'T00:00:00');
    const isFirst   = d.getDate() === 1;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isToday   = dt === todayStr;
    return `<th style="min-width:30px;width:30px;text-align:center;font-size:9px;padding:2px 0;box-sizing:border-box;
      ${isFirst   ? 'border-left:2px solid var(--border);' : ''}
      ${isWeekend ? 'background:rgba(0,0,0,0.08);color:var(--muted);' : ''}
      ${isToday   ? 'background:rgba(59,130,246,0.25);color:var(--blue);font-weight:800;' : ''}
    ">${d.getDate()}</th>`;
  }).join('');

  // ─── Build HTML per Segmen → Aktivitas → Item ─────────────────
  let cardsHtml = '';

  proj.segments.forEach((seg, si) => {
    const segColor = HEX[si % 6];
    const segActs  = proj.activities.filter(a => a.segId === seg.id);
    const segHasItems = proj.items.some(i => segActs.some(a => a.id === i.actId) && i.planStart);
    if (!segHasItems) return;

    cardsHtml += `
      <div style="border-left:4px solid ${segColor};padding:8px 12px;margin:16px 0 6px;background:${segColor}12;border-radius:0 6px 6px 0">
        <span style="color:${segColor};font-weight:700;font-size:13px">📦 ${seg.name}</span>
      </div>`;

    segActs.forEach(act => {
      const actItems = proj.items.filter(i => i.actId === act.id && i.planStart);
      if (!actItems.length) return;

      let tbodyRows = '';

      actItems.forEach((it, iti) => {
        const planStartIdx = diffDays(minDate, it.planStart);
        const planEndIdx   = planStartIdx + (it.dur || 1) - 1;

        const totalPlanQty = it.planQty || 0;
        const cumulReal    = calcCumulativeQty(it);
        const pctTotal     = totalPlanQty > 0 ? Math.min(100, (cumulReal / totalPlanQty * 100)) : 0;
        const pctTotalRnd  = Math.round(pctTotal);
        const pctColor     = pctTotalRnd >= 100 ? 'var(--green)' : pctTotalRnd > 0 ? 'var(--yellow)' : 'var(--muted)';

        const sortedReports = (it.dailyReports || [])
          .filter(r => r.date)
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date));
        const reportDateSet = new Set(sortedReports.map(r => r.date));

        // ── Baris 1: PLANNING ─────────────────────────────────
        const planCells = dates.map((dt, idx) => {
          const todayBg = dt === todayStr ? 'background:rgba(59,130,246,0.08);' : '';
          const inPlan  = idx >= planStartIdx && idx <= planEndIdx;

          if (!inPlan) return `<td class="gantt-cell" style="${todayBg}padding:2px 0"></td>`;

          const isF = idx === planStartIdx;
          const isL = idx === planEndIdx;
          const br  = isF && isL ? '4px' : isF ? '4px 0 0 4px' : isL ? '0 4px 4px 0' : '0';

          return `<td class="gantt-cell" style="${todayBg}padding:2px 0">
            <div style="
              height:14px;
              background:${segColor}22;
              border-top:2px solid ${segColor};
              border-bottom:2px solid ${segColor};
              ${isF ? 'border-left:2px solid '+segColor+';' : ''}
              ${isL ? 'border-right:2px solid '+segColor+';' : ''}
              border-radius:${br};
              box-sizing:border-box;
            "></div>
          </td>`;
        }).join('');

        // Baris planning: judul + info
        tbodyRows += `
          <tr style="${iti > 0 ? 'border-top:2px solid var(--border);' : ''}">
            <td class="gantt-label" rowspan="2" style="vertical-align:middle;font-weight:600;border-right:1px solid var(--border);padding:4px 8px;max-width:160px;font-size:12px" title="${it.name}">
              ${it.name}
            </td>
            <td rowspan="2" style="vertical-align:middle;text-align:center;padding:4px 6px;border-right:1px solid var(--border);min-width:46px">
              <div class="prog-bar" style="width:34px;margin:0 auto 3px">
                <div class="prog-fill" style="width:${pctTotalRnd}%;background:${pctColor}"></div>
              </div>
              <span style="font-size:9px;color:${pctColor};font-weight:700">${pctTotalRnd}%</span>
            </td>
            <td style="font-size:10px;color:${segColor};font-weight:700;padding:1px 6px;white-space:nowrap;background:${segColor}08;border-right:1px solid var(--border);min-width:170px">
              📅 Planning
              <span style="font-weight:400;color:var(--muted);margin-left:4px;font-size:9px">${fmtDate(it.planStart)}→${fmtDate(it.planEnd)} (${it.dur}hr)</span>
            </td>
            ${planCells}
          </tr>`;

        // ── Baris 2: REALISASI ────────────────────────────────
        // Tiap hari ada dailyReport → blok solid dengan % kumulatif
        const realCells = dates.map((dt, idx) => {
          const todayBg = dt === todayStr ? 'background:rgba(59,130,246,0.08);' : '';

          if (!reportDateSet.has(dt)) {
            return `<td class="gantt-cell" style="${todayBg}padding:2px 0"></td>`;
          }

          const cumQty    = calcCumulativeQtyUntil(it, dt);
          const pctDay    = totalPlanQty > 0 ? Math.min(100, (cumQty / totalPlanQty * 100)) : 100;
          const pctDayRnd = Math.round(pctDay);

          // Cek terlambat: tanggal realisasi melewati planEnd
          const isLate    = it.planEnd && dt > it.planEnd;
          const barColor  = isLate ? 'var(--red)' : '#22c55e';

          // Cek apakah awal/akhir blok untuk border-radius
          const sortedDates = [...reportDateSet].sort();
          const isFirst = dt === sortedDates[0];
          const isLast  = dt === sortedDates[sortedDates.length - 1];
          const br = isFirst && isLast ? '4px' : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0';

          const report = sortedReports.find(r => r.date === dt);
          const qty    = report ? (report.qty || 0) : 0;

          return `<td class="gantt-cell" style="${todayBg}padding:2px 0">
            <div style="
              height:14px;
              background:${barColor};
              border-radius:${br};
              display:flex;
              align-items:center;
              justify-content:center;
              overflow:hidden;
              box-sizing:border-box;
            " title="${fmtDate(dt)} | qty: ${qty} ${it.planUnit||''} | kumulatif: ${cumQty.toFixed(2)} (${pctDayRnd}%)">
              <span style="font-size:7px;font-weight:800;color:#fff;line-height:1;white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,0.6)">${pctDayRnd}%</span>
            </div>
          </td>`;
        }).join('');

        const firstRepDate = sortedReports.length ? sortedReports[0].date : null;
        const lastRepDate  = sortedReports.length ? sortedReports[sortedReports.length-1].date : null;
        const hasReal = sortedReports.length > 0;

        tbodyRows += `
          <tr>
            <td style="font-size:10px;color:${hasReal?'#22c55e':'var(--muted)'};font-weight:700;padding:1px 6px;white-space:nowrap;background:${hasReal?'rgba(34,197,94,0.05)':''};border-right:1px solid var(--border)">
              📊 Realisasi
              <span style="font-weight:400;color:var(--muted);font-size:9px;margin-left:4px">${hasReal ? fmtDate(firstRepDate)+(lastRepDate!==firstRepDate?' → '+fmtDate(lastRepDate):'') : '—'}</span>
            </td>
            ${realCells}
          </tr>`;
      });

      cardsHtml += `
        <div style="margin-left:20px;margin-bottom:14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <div style="padding:8px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:${segColor}08">
            <span style="color:${segColor};font-size:14px">🃏</span>
            <span style="font-weight:700;font-size:13px">${act.name}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:auto">${actItems.length} item</span>
          </div>
          <div class="gantt-wrap">
            <table class="gantt-table">
              <thead>
                <tr>
                  <th class="gantt-label" rowspan="2" style="text-align:left;vertical-align:bottom;min-width:150px;max-width:200px">Item Pekerjaan</th>
                  <th rowspan="2" style="min-width:48px;text-align:center">Prog</th>
                  <th rowspan="2" style="min-width:170px;text-align:left;border-right:1px solid var(--border)">Tipe</th>
                  ${monthHeader}
                </tr>
                <tr>${dayHeader}</tr>
              </thead>
              <tbody>${tbodyRows}</tbody>
            </table>
          </div>
        </div>`;
    });
  });

  // Legenda
  const todayInRange = todayStr >= minDate && todayStr <= maxDate;
  cardsHtml += `
    <div style="margin-top:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--muted);padding:12px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">
      <strong style="color:var(--text)">Legenda:</strong>
      <div style="display:flex;align-items:center;gap:5px">
        <div style="width:28px;height:14px;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:3px"></div>
        <span>Planning</span>
      </div>
      <div style="display:flex;align-items:center;gap:5px">
        <div style="width:28px;height:14px;background:#22c55e;border-radius:3px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:7px;color:#fff;font-weight:800">35%</span>
        </div>
        <span>Realisasi (tepat/awal)</span>
      </div>
      <div style="display:flex;align-items:center;gap:5px">
        <div style="width:28px;height:14px;background:var(--red);border-radius:3px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:7px;color:#fff;font-weight:800">80%</span>
        </div>
        <span>Realisasi Terlambat</span>
      </div>
      ${todayInRange ? `<div style="display:flex;align-items:center;gap:5px">
        <div style="width:28px;height:14px;background:rgba(59,130,246,0.25);border:1px solid var(--blue);border-radius:3px"></div>
        <span>Hari Ini</span>
      </div>` : ''}
      <span style="margin-left:auto;font-size:10px">💡 Hover bar realisasi untuk detail qty & kumulatif</span>
    </div>`;

  el.innerHTML = cardsHtml;
}

// ─── Helper: kumulatif qty ───────────────────────────────────────
function calcCumulativeQty(it) {
  return (it.dailyReports||[]).reduce((sum, r) => sum + (r.qty||0), 0);
}

function calcCumulativeQtyUntil(it, untilDate) {
  return (it.dailyReports||[])
    .filter(r => r.date <= untilDate)
    .reduce((sum, r) => sum + (r.qty||0), 0);
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
    const segActs  = proj.activities.filter(a => a.segId === seg.id);
    const segItems = proj.items.filter(i => segActs.some(a => a.id === i.actId));
    if (!segItems.length) return;

    html += `<div class="card" style="border-left:3px solid ${HEX[si%6]}">
      <div class="card-title c${si%6}">📌 ${seg.name}</div>`;

    segActs.forEach(act => {
      const actItems = proj.items.filter(i => i.actId === act.id);
      if (!actItems.length) return;

      html += `<div style="margin-bottom:8px;padding:6px 10px;background:${HEX[si%6]}10;border-radius:6px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">▸ ${act.name}</div>`;

      actItems.forEach(it => {
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

        const mActRows = (it.material||[]).map((m, mi) => {
          const ma  = (it.materialActual||[])[mi]||{volumeActual:0};
          const dev = (ma.volumeActual||0) - m.volume;
          return `<tr>
            <td>${m.nama||'—'}</td><td class="mono">${m.volume} ${m.satuan}</td>
            <td><input type="number" value="${ma.volumeActual||0}" min="0" onchange="updMA(${it.id},${mi},this.value)" style="width:90px"> ${m.satuan}</td>
            <td>${dev===0?'<span class="dev-zero">±0</span>':dev>0?`<span class="dev-neg">+${dev.toFixed(2)}</span>`:`<span class="dev-pos">${dev.toFixed(2)}</span>`}</td>
          </tr>`;
        }).join('');

        html += `<div class="item-block" style="margin-left:12px">
          <div class="item-block-header">
            <div style="font-weight:600">${it.name}
              <span class="mono" style="color:var(--muted);font-size:11px">| ${it.dur} hari | ${fmtDate(it.planStart)} – ${fmtDate(it.planEnd)}</span>
            </div>
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
          ${it.material && it.material.length ? `
          <div class="sub-label">📦 Realisasi Material</div>
          <div class="table-wrap"><table>
            <tr><th>Material</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th></tr>
            ${mActRows}
          </table></div>` : ''}
        </div>`;
      });
    });
    html += '</div>';
  });

  el.innerHTML = html;
  document.getElementById('kpi-total-cost').textContent    = fmtRp(tt + tm);
  document.getElementById('kpi-tenaga-cost').textContent   = fmtRp(tt);
  document.getElementById('kpi-material-cost').textContent = fmtRp(tm);
}

function refreshCostKPI() {
  let tt = 0, tm = 0;
  proj.items.forEach(it => {
    tt += (it.tenaga||[]).reduce((a,t) => a + t.jumlah*t.harga, 0);
    tm += (it.material||[]).reduce((a,m) => a + m.volume*m.harga, 0);
  });
  document.getElementById('kpi-total-cost').textContent    = fmtRp(tt + tm);
  document.getElementById('kpi-tenaga-cost').textContent   = fmtRp(tt);
  document.getElementById('kpi-material-cost').textContent = fmtRp(tm);
}

window.addT = (id) => { const it=proj.items.find(i=>i.id===id); it.tenaga.push({nama:'',jumlah:1,satuan:'OH',harga:0}); saveProj(); renderCost(); };
window.delT = (id,ti) => { const it=proj.items.find(i=>i.id===id); it.tenaga.splice(ti,1); saveProj(); renderCost(); };
window.updT = (id,ti,f,v) => {
  const it = proj.items.find(i=>i.id===id);
  it.tenaga[ti][f] = (f==='nama'||f==='satuan') ? v : parseFloat(v)||0;
  saveProj(); refreshCostKPI();
};
window.addM = (id) => { const it=proj.items.find(i=>i.id===id); it.material.push({nama:'',volume:0,satuan:'m³',harga:0}); saveProj(); renderCost(); };
window.delM = (id,mi) => { const it=proj.items.find(i=>i.id===id); it.material.splice(mi,1); saveProj(); renderCost(); };
window.updM = (id,mi,f,v) => {
  const it = proj.items.find(i=>i.id===id);
  it.material[mi][f] = (f==='nama'||f==='satuan') ? v : parseFloat(v)||0;
  saveProj(); refreshCostKPI();
};

// ─── REALISASI — Report Harian per Item ────────────────────────
// User bisa set "Tanggal Realisasi Dimulai" → itu jadi default tanggal
// pertama form tambah report. Bar Gantt realisasi = dari daily report.
function renderRealisasi() {
  const el = document.getElementById('realisasi-sections');
  if (!proj.items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📊</div>Belum ada data.</div>';
    return;
  }
  let html = '';

  proj.segments.forEach((seg, si) => {
    const segActs  = proj.activities.filter(a => a.segId === seg.id);
    const segItems = proj.items.filter(i => segActs.some(a => a.id === i.actId));
    if (!segItems.length) return;

    html += `<div class="card" style="border-left:3px solid ${HEX[si%6]}">
      <div class="card-title c${si%6}">📌 ${seg.name}</div>`;

    segActs.forEach(act => {
      const actItems = proj.items.filter(i => i.actId === act.id);
      if (!actItems.length) return;

      html += `<div style="margin-bottom:10px;padding:6px 10px;background:${HEX[si%6]}10;border-radius:6px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">▸ ${act.name}</div>`;

      actItems.forEach(it => {
        if (!it.dailyReports) it.dailyReports = [];
        const unitOpts = UNITS.map(u => `<option value="${u}" ${(it.planUnit||'m²')===u?'selected':''}>${u}</option>`).join('');

        const cumulReal = calcCumulativeQty(it);
        const pct       = (it.planQty||0) > 0 ? Math.min(100, (cumulReal / it.planQty * 100)).toFixed(1) : 0;
        const pctNum    = parseFloat(pct);
        const pctColor  = pctNum>=100?'var(--green)':pctNum>=50?'var(--yellow)':'var(--accent)';

        // Default tanggal form = reportStartDate > realisasiStart > today
        const defaultReportDate = it.reportStartDate || it.realisasiStart || new Date().toISOString().slice(0,10);

        const reportRows = it.dailyReports.map((r, ri) => {
          const runningQty = it.dailyReports.slice(0, ri+1).reduce((s,x)=>s+(x.qty||0),0);
          const runningPct = (it.planQty||0)>0 ? Math.min(100,(runningQty/it.planQty*100)).toFixed(1) : 0;
          const pctColRow  = parseFloat(runningPct)>=100?'var(--green)':parseFloat(runningPct)>=50?'var(--yellow)':'var(--accent)';
          return `<tr>
            <td class="mono" style="white-space:nowrap">${fmtDate(r.date)}</td>
            <td>
              <input type="text" value="${r.desc||''}" placeholder="Deskripsi pekerjaan hari ini..."
                onchange="updReport(${it.id},${ri},'desc',this.value)"
                style="width:100%;min-width:200px">
            </td>
            <td style="white-space:nowrap">
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" value="${r.qty||0}" min="0" step="0.01"
                  onchange="updReport(${it.id},${ri},'qty',this.value)"
                  style="width:80px">
                <span class="mono" style="font-size:12px;color:var(--muted)">${it.planUnit||'m²'}</span>
              </div>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                <div class="prog-bar" style="width:80px">
                  <div class="prog-fill" style="width:${runningPct}%;background:${pctColRow}"></div>
                </div>
                <span class="mono" style="font-size:11px;color:${pctColRow}">${runningPct}%</span>
              </div>
            </td>
            <td><button class="btn btn-danger" onclick="delReport(${it.id},${ri})">✕</button></td>
          </tr>`;
        }).join('');

        html += `<div class="item-block" style="margin-left:12px;margin-bottom:14px">
          <!-- Header item -->
          <div style="font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <span>${it.name}</span>
            <span style="font-size:11px;color:var(--muted)">${fmtDate(it.planStart)} – ${fmtDate(it.planEnd)}</span>
          </div>

          <!-- Konfigurasi tanggal & satuan -->
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;align-items:flex-end;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
            <div>
              <div class="sub-label" style="margin-top:0">Rencana Mulai</div>
              <span class="mono" style="font-size:13px">${fmtDate(it.planStart)}</span>
            </div>
            <div>
              <div class="sub-label" style="margin-top:0">Realisasi Mulai</div>
              <input type="date" id="real-start-input-${it.id}" value="${it.realisasiStart||''}"
                onchange="updRealisasiStart(${it.id},this.value)" style="width:160px">
            </div>
            <div id="late-badge-${it.id}">${lateBadgeHtml(it)}</div>
            <div>
              <div class="sub-label" style="margin-top:0">🗓️ Tanggal Mulai Report Harian</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="date" id="report-start-date-${it.id}" value="${it.reportStartDate||''}"
                  onchange="updReportStartDate(${it.id},this.value)" style="width:160px">
                <span style="font-size:10px;color:var(--muted)">← awal input laporan harian</span>
              </div>
            </div>
            <div style="margin-left:auto">
              <div class="sub-label" style="margin-top:0">Planning Satuan</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" value="${it.planQty||0}" min="0"
                  onchange="updPlanQty(${it.id},this.value)" style="width:100px">
                <select onchange="updPlanUnit(${it.id},this.value)" style="width:80px">${unitOpts}</select>
              </div>
            </div>
          </div>

          <!-- Progress summary -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:10px 12px;background:${pctNum>=100?'rgba(34,197,94,0.07)':'rgba(59,130,246,0.06)'};border-radius:6px;border:1px solid ${pctNum>=100?'rgba(34,197,94,0.2)':'rgba(59,130,246,0.15)'}">
            <span class="kpi-value" style="font-size:26px;font-family:'Syne',sans-serif;font-weight:800;color:${pctColor}" id="pct-display-${it.id}">${pct}%</span>
            <div style="flex:1">
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Kumulatif: <span style="color:var(--text)">${cumulReal.toFixed(2)} / ${it.planQty||0} ${it.planUnit||'—'}</span></div>
              <div class="prog-bar">
                <div class="prog-fill" id="pct-bar-${it.id}" style="width:${pct}%;background:${pctColor}"></div>
              </div>
            </div>
          </div>

          <!-- Form tambah report harian -->
          <div class="sub-label">📝 Report Harian</div>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;padding:10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
            <div class="form-group" style="min-width:150px;flex:0">
              <label>Tanggal Report</label>
              <input type="date" id="new-report-date-${it.id}" value="${defaultReportDate}">
            </div>
            <div class="form-group" style="flex:2;min-width:200px">
              <label>Deskripsi Pekerjaan</label>
              <input type="text" id="new-report-desc-${it.id}" placeholder="Pekerjaan yang dilakukan hari ini...">
            </div>
            <div class="form-group" style="min-width:100px;flex:0">
              <label>Realisasi Qty</label>
              <div style="display:flex;gap:4px;align-items:center">
                <input type="number" id="new-report-qty-${it.id}" min="0" step="0.01" value="0" style="width:80px">
                <span style="font-size:12px;color:var(--muted)">${it.planUnit||'m²'}</span>
              </div>
            </div>
            <button class="btn btn-success" onclick="addReport(${it.id})" style="white-space:nowrap">+ Tambah Report</button>
          </div>

          <!-- Tabel report -->
          ${it.dailyReports.length ? `
          <div class="table-wrap">
            <table>
              <tr><th>Tanggal</th><th>Deskripsi</th><th>Qty Hari Ini</th><th>Progress Kumulatif</th><th></th></tr>
              ${reportRows}
            </table>
          </div>` : `<div style="color:var(--muted);font-size:12px;padding:12px 0;text-align:center">Belum ada report. Tambahkan di atas. Tanggal default = tanggal realisasi dimulai.</div>`}
        </div>`;
      });
    });
    html += '</div>';
  });

  el.innerHTML = html;
}

// ─── Report Harian CRUD ─────────────────────────────────────────
window.addReport = (itemId) => {
  const it   = proj.items.find(i => i.id === itemId);
  const date = document.getElementById(`new-report-date-${itemId}`).value;
  const desc = document.getElementById(`new-report-desc-${itemId}`).value.trim();
  const qty  = parseFloat(document.getElementById(`new-report-qty-${itemId}`).value) || 0;

  if (!date) return alert('Masukkan tanggal report!');
  if (!it.dailyReports) it.dailyReports = [];

  if (it.dailyReports.find(r => r.date === date)) {
    return alert('Sudah ada report untuk tanggal ini. Hapus dulu atau edit langsung di tabel.');
  }

  it.dailyReports.push({ date, desc, qty });
  it.dailyReports.sort((a, b) => a.date.localeCompare(b.date));
  it.realisasiQty = calcCumulativeQty(it);

  // Set realisasiStart ke tanggal pertama report jika belum ada
  if (!it.realisasiStart && it.dailyReports.length) {
    it.realisasiStart = it.dailyReports[0].date;
    it.realisasiEnd   = addDays(it.realisasiStart, it.dur - 1);
  }

  // Maju ke hari berikutnya untuk form selanjutnya
  const nextDate = addDays(date, 1);
  document.getElementById(`new-report-desc-${itemId}`).value = '';
  document.getElementById(`new-report-qty-${itemId}`).value  = '0';
  const dateEl = document.getElementById(`new-report-date-${itemId}`);
  if (dateEl) dateEl.value = nextDate;

  saveProj();
  renderRealisasi();
  toast('Report ditambahkan!');
};

window.updReport = (itemId, ri, field, val) => {
  const it = proj.items.find(i => i.id === itemId);
  if (!it || !it.dailyReports[ri]) return;
  if (field === 'qty') {
    it.dailyReports[ri].qty = parseFloat(val) || 0;
    it.realisasiQty = calcCumulativeQty(it);
  } else {
    it.dailyReports[ri][field] = val;
  }
  saveProj();
  const cumulReal = calcCumulativeQty(it);
  const pct       = (it.planQty||0)>0 ? Math.min(100,(cumulReal/it.planQty*100)).toFixed(1) : 0;
  const pctColor  = parseFloat(pct)>=100?'var(--green)':parseFloat(pct)>=50?'var(--yellow)':'var(--accent)';
  const disp = document.getElementById(`pct-display-${itemId}`);
  const bar  = document.getElementById(`pct-bar-${itemId}`);
  if (disp) { disp.textContent = pct+'%'; disp.style.color = pctColor; }
  if (bar)  { bar.style.width = pct+'%'; bar.style.background = pctColor; }
};

window.delReport = (itemId, ri) => {
  const it = proj.items.find(i => i.id === itemId);
  if (!it) return;
  it.dailyReports.splice(ri, 1);
  it.realisasiQty = calcCumulativeQty(it);
  if (!it.dailyReports.length) { it.realisasiStart = ''; it.realisasiEnd = ''; }
  saveProj();
  renderRealisasi();
};

window.updPlanQty = (id, v) => {
  const it = proj.items.find(i=>i.id===id);
  it.planQty = parseFloat(v)||0;
  it.realisasiQty = calcCumulativeQty(it);
  const pct      = it.planQty>0 ? Math.min(100,(it.realisasiQty/it.planQty*100)).toFixed(1) : 0;
  const pctColor = parseFloat(pct)>=100?'var(--green)':parseFloat(pct)>=50?'var(--yellow)':'var(--accent)';
  const disp = document.getElementById(`pct-display-${id}`);
  const bar  = document.getElementById(`pct-bar-${id}`);
  if (disp) { disp.textContent = pct+'%'; disp.style.color = pctColor; }
  if (bar)  { bar.style.width = pct+'%'; bar.style.background = pctColor; }
  saveProj();
};
window.updPlanUnit = (id, v) => { const it=proj.items.find(i=>i.id===id); it.planUnit=v; saveProj(); };
window.updRealQty  = (id, v) => { const it=proj.items.find(i=>i.id===id); it.realisasiQty=parseFloat(v)||0; saveProj(); };
window.updCA       = (id, v) => { const it=proj.items.find(i=>i.id===id); it.costActual=parseFloat(v)||0; saveProj(); };
window.updMA       = (id, mi, v) => {
  const it = proj.items.find(i=>i.id===id);
  if (!it.materialActual) it.materialActual = [];
  if (!it.materialActual[mi]) it.materialActual[mi] = {};
  it.materialActual[mi].volumeActual = parseFloat(v)||0;
  saveProj();
};

// ─── DEVIASI ────────────────────────────────────────────────────
function renderDeviasi() {
  const volPlan = proj.volumePlanning || 0;
  let totalRealQty = 0;
  proj.items.forEach(i => { totalRealQty += calcCumulativeQty(i); });
  const avgProg = volPlan > 0
    ? Math.min(100, (totalRealQty / volPlan * 100)).toFixed(1)
    : (() => {
        let tPlan = 0, tReal = 0;
        proj.items.forEach(i => { tPlan += (i.planQty||0); tReal += calcCumulativeQty(i); });
        return tPlan > 0 ? Math.min(100, (tReal/tPlan*100)).toFixed(1) : 0;
      })();

  const costPlan = proj.items.reduce((a, i) => {
    return a + (i.tenaga||[]).reduce((s,t) => s+t.jumlah*t.harga, 0)
             + (i.material||[]).reduce((s,m) => s+m.volume*m.harga, 0);
  }, 0);
  const costAct = proj.items.reduce((a,i) => a+(i.costActual||0), 0);
  const costDev = costAct - costPlan;

  const lateItems   = proj.items.filter(i => i.realisasiStart && diffDays(i.planStart, i.realisasiStart) > 0).length;
  const onTimeItems = proj.items.filter(i => i.realisasiStart && diffDays(i.planStart, i.realisasiStart) <= 0).length;

  document.getElementById('deviasi-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Avg Progress</div>
      <div class="kpi-value ${parseFloat(avgProg)>=80?'green':parseFloat(avgProg)>=50?'yellow':'red'}">${avgProg}%</div>
      <div class="prog-bar"><div class="prog-fill bg4" style="width:${avgProg}%"></div></div>
      <div class="kpi-sub" style="margin-top:6px">Real Qty: ${totalRealQty.toFixed(2)} / Vol Plan: ${volPlan} ${proj.volumeUnit||'—'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Selesai (100%)</div>
      <div class="kpi-value green">${proj.items.filter(i=>(i.planQty||0)>0 && calcCumulativeQty(i)>=(i.planQty||0)).length}</div>
      <div class="kpi-sub">dari ${proj.items.length} item</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Terlambat</div>
      <div class="kpi-value red">${lateItems}</div>
      <div class="kpi-sub">${onTimeItems} tepat/lebih awal</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Biaya Rencana</div>
      <div class="kpi-value blue" style="font-size:15px">${fmtRp(costPlan)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Deviasi Biaya</div>
      <div class="kpi-value ${costDev<=0?'green':'red'}" style="font-size:15px">${costDev<=0?'':'+'}${fmtRp(costDev)}</div>
      <div class="kpi-sub">${costDev<=0?'✅ Under Budget':'⚠️ Over Budget'}</div>
    </div>`;

  const totalPlanQtyAll = proj.items.reduce((s, i) => s + (i.planQty||0), 0);

  let ph = `<div class="table-wrap"><table>
    <tr>
      <th>Segmen</th><th>Aktivitas</th><th>Item</th>
      <th>Rencana Mulai</th><th>Realisasi Mulai</th><th>Keterlambatan</th>
      <th>Plan Qty</th><th>Real Qty</th><th>Progress</th>
      <th>Bobot Aktivitas</th><th>Avg Progress Aktivitas</th><th>Status</th>
    </tr>`;

  proj.segments.forEach(seg => {
    const si = proj.segments.indexOf(seg);
    proj.activities.filter(a=>a.segId===seg.id).forEach(act => {
      const actItems       = proj.items.filter(i=>i.actId===act.id);
      const actPlanQtySum  = actItems.reduce((s,i)=>s+(i.planQty||0),0);
      const bobot          = totalPlanQtyAll > 0 ? (actPlanQtySum / totalPlanQtyAll * 100).toFixed(1) : '—';
      const actRealQtySum  = actItems.reduce((s,i)=>s+calcCumulativeQty(i),0);
      const actAvgProg     = actPlanQtySum > 0
        ? Math.min(100, (actRealQtySum / actPlanQtySum * 100)).toFixed(1)
        : '—';

      actItems.forEach((it, iti) => {
        const late    = it.realisasiStart && it.planStart ? diffDays(it.planStart, it.realisasiStart) : null;
        const realQty = calcCumulativeQty(it);
        const pct     = (it.planQty||0) > 0 ? Math.min(100, (realQty/it.planQty*100)).toFixed(1) : 0;
        const lateCell = late === null ? '—'
          : late > 0 ? `<span class="dev-neg">+${late} hari</span>`
          : late < 0 ? `<span class="dev-pos">${late} hari</span>`
          : `<span class="dev-zero">Tepat</span>`;

        ph += `<tr>
          <td><span class="c${si%6}" style="font-weight:600">${seg.name}</span></td>
          <td style="color:var(--muted);font-size:12px">${act.name}</td>
          <td>${it.name}</td>
          <td class="mono">${fmtDate(it.planStart)}</td>
          <td class="mono">${it.realisasiStart ? fmtDate(it.realisasiStart) : '—'}</td>
          <td>${lateCell}</td>
          <td class="mono">${it.planQty||0} ${it.planUnit||'—'}</td>
          <td class="mono">${realQty.toFixed(2)} ${it.planUnit||'—'}</td>
          <td class="mono" style="color:${parseFloat(pct)>=100?'var(--green)':parseFloat(pct)>0?'var(--yellow)':'var(--muted)'}">${pct}%</td>
          ${iti === 0
            ? `<td class="mono" rowspan="${actItems.length}" style="vertical-align:middle;font-weight:700;color:var(--yellow);background:rgba(245,158,11,0.05)">
                ${bobot !== '—' ? bobot+'%' : '—'}
              </td>
              <td rowspan="${actItems.length}" style="vertical-align:middle;background:rgba(59,130,246,0.05)">
                <div style="text-align:center">
                  <div class="prog-bar" style="width:80px;margin:0 auto">
                    <div class="prog-fill" style="width:${actAvgProg !== '—' ? actAvgProg : 0}%;background:${parseFloat(actAvgProg)>=100?'var(--green)':parseFloat(actAvgProg)>=50?'var(--yellow)':'var(--accent)'}"></div>
                  </div>
                  <span class="mono" style="font-size:11px;color:${parseFloat(actAvgProg)>=100?'var(--green)':parseFloat(actAvgProg)>=50?'var(--yellow)':'var(--accent)'}">${actAvgProg !== '—' ? actAvgProg+'%' : '—'}</span>
                </div>
              </td>`
            : ''}
          <td>${parseFloat(pct)>=100?'✅ Selesai':parseFloat(pct)>0?'🟠 Progress':'🔵 Belum'}</td>
        </tr>`;
      });
    });
  });
  document.getElementById('dev-progress').innerHTML = proj.items.length ? ph+'</table></div>' : '<div class="empty">Belum ada data.</div>';

  // Tabel Material
  let mRows = [];
  proj.items.forEach(it => {
    const act = proj.activities.find(a=>a.id===it.actId);
    const seg = proj.segments.find(s=> act && s.id===act.segId);
    const si  = seg ? proj.segments.indexOf(seg) : 0;
    (it.material||[]).forEach((m,mi) => {
      const ma  = (it.materialActual||[])[mi]||{volumeActual:0};
      const dev = (ma.volumeActual||0) - m.volume;
      mRows.push({seg,si,act,it,m,ma,dev});
    });
  });
  let mh = `<div class="table-wrap"><table>
    <tr><th>Segmen</th><th>Aktivitas</th><th>Item</th><th>Material</th><th>Satuan</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th><th>%</th></tr>`;
  mRows.forEach(({seg,si,act,it,m,ma,dev}) => {
    const pct = m.volume>0 ? ((ma.volumeActual||0)/m.volume*100).toFixed(0) : 0;
    mh += `<tr>
      <td><span class="c${si%6}" style="font-weight:600">${seg?.name||'—'}</span></td>
      <td style="color:var(--muted);font-size:12px">${act?.name||'—'}</td>
      <td>${it.name}</td><td>${m.nama||'—'}</td><td class="mono">${m.satuan}</td>
      <td class="mono">${m.volume}</td><td class="mono">${ma.volumeActual||0}</td>
      <td class="mono">${dev===0?'<span class="dev-zero">±0</span>':dev>0?`<span class="dev-neg">+${dev.toFixed(2)} ▲</span>`:`<span class="dev-pos">${dev.toFixed(2)} ▼</span>`}</td>
      <td class="mono" style="color:${pct>=100?'var(--green)':pct>0?'var(--yellow)':'var(--muted)'}">${pct}%</td>
    </tr>`;
  });
  document.getElementById('dev-material').innerHTML = mRows.length ? mh+'</table></div>' : '<div class="empty"><div class="empty-icon">📦</div>Belum ada material.</div>';

  // Tabel Biaya
  let ch = `<div class="table-wrap"><table>
    <tr><th>Segmen</th><th>Aktivitas</th><th>Item</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th><th>Status</th></tr>`;
  proj.items.forEach(it => {
    const act  = proj.activities.find(a=>a.id===it.actId);
    const seg  = proj.segments.find(s=>act && s.id===act.segId);
    const si   = seg ? proj.segments.indexOf(seg) : 0;
    const plan = (it.tenaga||[]).reduce((a,t)=>a+t.jumlah*t.harga,0)+(it.material||[]).reduce((a,m)=>a+m.volume*m.harga,0);
    const act_ = it.costActual||0;
    const dev  = act_ - plan;
    ch += `<tr>
      <td><span class="c${si%6}" style="font-weight:600">${seg?.name||'—'}</span></td>
      <td style="color:var(--muted);font-size:12px">${act?.name||'—'}</td>
      <td>${it.name}</td>
      <td class="mono">${fmtRp(plan)}</td>
      <td class="mono">${fmtRp(act_)}</td>
      <td class="mono">${dev===0?'<span class="dev-zero">±0</span>':dev>0?`<span class="dev-neg">+${fmtRp(dev)} ▲</span>`:`<span class="dev-pos">${fmtRp(Math.abs(dev))} ▼</span>`}</td>
      <td>${dev<=0?'✅ Under':'⚠️ Over'}</td>
    </tr>`;
  });
  document.getElementById('dev-cost').innerHTML = proj.items.length ? ch+'</table></div>' : '<div class="empty">Belum ada data.</div>';
}