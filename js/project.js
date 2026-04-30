// ═══════════════════════════════════════════════════════════════
// PROJECT.JS — Detail Proyek: Setup, Gantt, Biaya, Realisasi, Deviasi
// Revisi: Segmen → Aktivitas → Item | Tanggal Kalender | Realisasi Satuan
// ═══════════════════════════════════════════════════════════════

import { db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Helpers ───────────────────────────────────────────────────
const HEX = ['#3b82f6','#06b6d4','#8b5cf6','#f59e0b','#22c55e','#f43f5e'];

function fmtRp(n) {
  return 'Rp ' + (Math.round(n)||0).toLocaleString('id-ID');
}

// Format tanggal ke "15 Jan 2025"
function fmtDate(d) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

// Tambah hari ke tanggal (string YYYY-MM-DD)
// Pakai local date (bukan toISOString/UTC) supaya tidak geser di timezone WIB
function addDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Hitung selisih hari (positif = b lebih lambat dari a)
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
let _dragSrcIdx = null;

function getProjIdFromURL() {
  return new URLSearchParams(window.location.search).get('id');
}

// ─── Simpan ke Firestore ────────────────────────────────────────
const debouncedSave = debounce(async () => {
  if (!projId || !proj) return;
  try {
    await updateDoc(doc(db, 'projects', projId), {
      name:       proj.name      || '',
      startDate:  proj.startDate || '',
      segments:   proj.segments  || [],
      activities: proj.activities || [],
      items:      proj.items     || []
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
  proj.segments   = proj.segments   || [];
  proj.activities = proj.activities || [];
  proj.items      = proj.items      || [];

  // Migrasi data lama: jika ada items dengan startDay, convert ke tanggal
  if (proj.items.length && proj.items[0].startDay !== undefined && !proj.items[0].planStart) {
    const base = proj.startDate || new Date().toISOString().slice(0,10);
    proj.items.forEach(it => {
      if (!it.planStart) it.planStart = addDays(base, (it.startDay||1) - 1);
    });
  }

  // Selalu hitung ulang planEnd & realisasiEnd supaya data lama di Firestore terkoreksi
  proj.items.forEach(it => {
    if (it.planStart && it.dur) it.planEnd = addDays(it.planStart, it.dur - 1);
    if (it.realisasiStart && it.dur) it.realisasiEnd = addDays(it.realisasiStart, it.dur - 1);
  });

  // Counter
  segCounter  = proj.segments.length   ? Math.max(...proj.segments.map(s=>s.id))   : 0;
  actCounter  = proj.activities.length  ? Math.max(...proj.activities.map(a=>a.id)) : 0;
  itemCounter = proj.items.length       ? Math.max(...proj.items.map(i=>i.id))      : 0;

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
  updateKPI(); saveProj();
});

document.getElementById('proj-start').addEventListener('input', (e) => {
  proj.startDate = e.target.value;
  updateKPI(); saveProj();
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
  const totalItems = proj.items.length;
  document.getElementById('kpi-seg').textContent  = proj.segments.length;
  document.getElementById('kpi-act').textContent  = proj.activities.length;
  document.getElementById('kpi-item').textContent = totalItems;

  if (totalItems && proj.startDate) {
    // Cari tanggal mulai paling awal dan selesai paling akhir
    const starts = proj.items.filter(i=>i.planStart).map(i=>i.planStart);
    const ends   = proj.items.filter(i=>i.planEnd).map(i=>i.planEnd);
    if (starts.length) {
      const earliest = starts.sort()[0];
      const latest   = ends.sort().reverse()[0];
      const dur = diffDays(earliest, latest) + 1;
      document.getElementById('kpi-dur').textContent  = dur + ' hari';
      document.getElementById('kpi-start').textContent = fmtDate(earliest);
      document.getElementById('kpi-end').textContent   = fmtDate(latest);
      return;
    }
  }
  document.getElementById('kpi-dur').textContent  = '0 hari';
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
      const actIds = proj.activities.filter(a=>a.segId===s.id).map(a=>a.id);
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

  // Update select segmen di form aktivitas
  const segSel = document.getElementById('new-act-seg');
  segSel.innerHTML = '<option value="">-- Pilih Segmen --</option>' +
    proj.segments.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  if (!proj.activities.length) { el.innerHTML = ''; return; }

  // Kelompokkan per segmen
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
  const actId    = parseInt(document.getElementById('new-item-act').value);
  const name     = document.getElementById('new-item-name').value.trim();
  const dur      = parseInt(document.getElementById('new-item-dur').value) || 1;
  const planStart = document.getElementById('new-item-planstart').value;

  if (!actId)    return alert('Pilih aktivitas!');
  if (!name)     return alert('Masukkan nama item!');
  if (!planStart) return alert('Masukkan tanggal mulai rencana!');

  const planEnd = addDays(planStart, dur - 1);

  proj.items.push({
    id: ++itemCounter, actId, name, dur, planStart, planEnd,
    realisasiStart: '', realisasiEnd: '',
    planQty: 0, planUnit: 'm²',
    realisasiQty: 0,
    tenaga: [], material: [], costActual: 0, materialActual: []
  });
  document.getElementById('new-item-name').value = '';
  document.getElementById('new-item-planstart').value = '';
  saveProj(); renderAll();
};

window.removeItem = (id) => {
  proj.items = proj.items.filter(i => i.id !== id);
  saveProj(); renderAll();
};

// Update realisasi end otomatis saat realisasi start diubah
// + cascade ke item lain di aktivitas & aktivitas berikutnya dalam segmen yang sama
window.updRealisasiStart = (id, val) => {
  const it = proj.items.find(i => i.id === id);
  if (!it) return;

  const shift = it.realisasiStart && val ? diffDays(it.realisasiStart, val) : 0;
  it.realisasiStart = val;
  it.realisasiEnd   = val ? addDays(val, it.dur - 1) : '';

  // Update DOM item ini
  const endEl = document.getElementById(`real-end-${id}`);
  if (endEl) endEl.textContent = it.realisasiEnd ? fmtDate(it.realisasiEnd) : '—';

  // Cascade: geser semua item di aktivitas yang sama (kecuali item ini sendiri)
  // dan aktivitas berikutnya dalam segmen yang sama
  if (shift !== 0 && val) {
    const act = proj.activities.find(a => a.id === it.actId);
    if (act) {
      const seg = proj.segments.find(s => s.id === act.segId);
      if (seg) {
        // Urutan aktivitas dalam segmen ini
        const segActs = proj.activities.filter(a => a.segId === seg.id);
        const actIdx  = segActs.findIndex(a => a.id === act.id);

        // Aktivitas yang kena cascade: aktivitas saat ini + aktivitas sesudahnya
        const affectedActIds = segActs.slice(actIdx).map(a => a.id);

        proj.items.forEach(other => {
          if (other.id === it.id) return; // skip item yang diubah
          if (!affectedActIds.includes(other.actId)) return; // skip aktivitas sebelumnya
          if (!other.realisasiStart) return; // skip yang belum ada realisasinya

          other.realisasiStart = addDays(other.realisasiStart, shift);
          other.realisasiEnd   = addDays(other.realisasiStart, other.dur - 1);

          // Update DOM
          const otherStartEl = document.getElementById(`real-start-input-${other.id}`);
          if (otherStartEl) otherStartEl.value = other.realisasiStart;
          const otherEndEl = document.getElementById(`real-end-${other.id}`);
          if (otherEndEl) otherEndEl.textContent = fmtDate(other.realisasiEnd);
          const otherBadgeEl = document.getElementById(`late-badge-${other.id}`);
          if (otherBadgeEl) otherBadgeEl.innerHTML = lateBadgeHtml(other);
        });
      }
    }
  }

  // Update badge keterlambatan item ini
  const badgeEl = document.getElementById(`late-badge-${id}`);
  if (badgeEl) badgeEl.innerHTML = lateBadgeHtml(it);

  saveProj();
};

// Helper: generate HTML badge keterlambatan
function lateBadgeHtml(it) {
  const late = it.realisasiStart && it.planStart ? diffDays(it.planStart, it.realisasiStart) : null;
  if (late === null) return '<span style="color:var(--muted);font-size:11px">—</span>';
  if (late > 0) return `<span class="late-badge">+${late} hr terlambat</span>`;
  if (late < 0) return `<span class="early-badge">${Math.abs(late)} hr lebih awal</span>`;
  return '<span style="color:var(--green);font-size:11px">✅ Tepat waktu</span>';
}

// Update planEnd otomatis saat durasi diubah (dari tabel)
window.updDur = (id, val) => {
  const it = proj.items.find(i => i.id === id);
  if (!it) return;
  it.dur = parseInt(val) || 1;
  it.planEnd = it.planStart ? addDays(it.planStart, it.dur - 1) : '';
  it.realisasiEnd = it.realisasiStart ? addDays(it.realisasiStart, it.dur - 1) : '';
  // Update tampilan
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

  // Kelompokkan per segmen > aktivitas
  let html = '';
  proj.segments.forEach((seg, si) => {
    const segActs = proj.activities.filter(a => a.segId === seg.id);
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
          ${actItems.map((it, idx) => {
            const late = it.realisasiStart && it.planStart ? diffDays(it.planStart, it.realisasiStart) : 0;
            const lateLabel = late > 0
              ? `<span class="late-badge">+${late} hr terlambat</span>`
              : late < 0
                ? `<span class="early-badge">${late} hr lebih awal</span>`
                : it.realisasiStart ? `<span style="color:var(--green);font-size:11px">✅ Tepat waktu</span>` : `<span style="color:var(--muted);font-size:11px">—</span>`;
            return `<tr>
              <td style="color:var(--muted);font-size:16px;text-align:center">⠿</td>
              <td class="mono">${idx+1}</td>
              <td style="font-weight:600">${it.name}</td>
              <td class="mono">${fmtDate(it.planStart)}</td>
              <td><input type="number" value="${it.dur}" min="1" style="width:60px"
                onchange="updDur(${it.id},this.value)"></td>
              <td class="mono" id="plan-end-${it.id}">${fmtDate(it.planEnd)}</td>
              <td><input type="date" id="real-start-input-${it.id}" value="${it.realisasiStart||''}" style="width:150px"
                onchange="updRealisasiStart(${it.id},this.value)"></td>
              <td class="mono" id="real-end-${it.id}">${it.realisasiEnd ? fmtDate(it.realisasiEnd) : '—'}</td>
              <td id="late-badge-${it.id}">${lateLabel}</td>
              <td><button class="btn btn-danger" onclick="removeItem(${it.id})">✕</button></td>
            </tr>`;
          }).join('')}
        </table></div>
      </div>`;
    });
    html += '</div>';
  });

  el.innerHTML = html;
}

// ─── GANTT ──────────────────────────────────────────────────────
function renderGantt() {
  const el = document.getElementById('gantt-container');
  const itemsWithDates = proj.items.filter(i => i.planStart);

  if (!itemsWithDates.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📅</div>Belum ada data atau tanggal belum diisi.</div>';
    return;
  }

  // Hitung rentang tanggal keseluruhan
  const allStarts = itemsWithDates.map(i => i.planStart).concat(
    proj.items.filter(i=>i.realisasiStart).map(i=>i.realisasiStart)
  );
  const allEnds = itemsWithDates.map(i => i.planEnd).concat(
    proj.items.filter(i=>i.realisasiEnd).map(i=>i.realisasiEnd)
  );

  const minDate = allStarts.sort()[0];
  const maxDate = allEnds.sort().reverse()[0];
  const totalDays = diffDays(minDate, maxDate) + 1;

  // Buat array semua tanggal
  const dates = [];
  for (let d = 0; d < totalDays; d++) {
    dates.push(addDays(minDate, d));
  }

  // Header: bulan + tanggal
  // Kelompokkan tanggal per bulan
  const months = [];
  let lastMonth = '';
  dates.forEach((dt, idx) => {
    const mo = dt.slice(0, 7); // YYYY-MM
    if (mo !== lastMonth) { months.push({ mo, start: idx, count: 0 }); lastMonth = mo; }
    months[months.length-1].count++;
  });

  const monthHeader = months.map(m => {
    const d = new Date(m.mo + '-01');
    const label = d.toLocaleDateString('id-ID', { month:'short', year:'numeric' });
    return `<th colspan="${m.count}" style="text-align:center;border-left:1px solid var(--border);color:var(--text);font-size:11px;background:var(--surface2)">${label}</th>`;
  }).join('');

  const dayHeader = dates.map(dt => {
    const d = new Date(dt + 'T00:00:00');
    const isFirst = d.getDate() === 1;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    return `<th style="min-width:28px;text-align:center;font-size:10px;${isFirst?'border-left:1px solid var(--border)':''}${isWeekend?';color:#4a5568':''}">
      ${d.getDate()}
    </th>`;
  }).join('');

  // Body
  let bodyHtml = '';
  proj.segments.forEach((seg, si) => {
    const segActs = proj.activities.filter(a => a.segId === seg.id);
    const segItems = proj.items.filter(i => segActs.some(a => a.id === i.actId));
    if (!segItems.length) return;

    bodyHtml += `<tr style="background:#0d1220">
      <td colspan="${3 + totalDays}" style="padding:5px 10px;font-weight:700;font-size:11px;color:${HEX[si%6]};text-transform:uppercase;letter-spacing:1px">
        ${seg.name}
      </td>
    </tr>`;

    segActs.forEach(act => {
      const actItems = proj.items.filter(i => i.actId === act.id && i.planStart);
      if (!actItems.length) return;

      bodyHtml += `<tr style="background:#0a0f1a">
        <td colspan="${3 + totalDays}" style="padding:3px 10px 3px 24px;font-size:11px;color:var(--muted);font-style:italic">
          ▸ ${act.name}
        </td>
      </tr>`;

      actItems.forEach(it => {
        // Posisi bar dalam grid hari
        const planStartIdx = diffDays(minDate, it.planStart);
        const planSpan     = it.dur;

        // Pre-compute realisasi indices untuk item ini
        const planEndIdx = planStartIdx + planSpan - 1;
        let realStartIdx = -1;
        let realEndIdx   = -1;
        if (it.realisasiStart) {
          realStartIdx = diffDays(minDate, it.realisasiStart);
          realEndIdx   = realStartIdx + it.dur - 1;
        }

        // Cells untuk gantt
        const cells = dates.map((dt, idx) => {
          const tdStyle = 'padding:0;position:relative;height:28px;';

          // Apakah sel ini masuk rentang rencana?
          const inPlan = idx >= planStartIdx && idx <= planEndIdx;

          // Apakah sel ini masuk rentang realisasi?
          const inReal = realStartIdx >= 0 && idx >= realStartIdx && idx <= realEndIdx;

          // Realisasi melewati planEnd → merah
          const isOverdue = inReal && idx > planEndIdx;

          const planDiv = inPlan
            ? `<div style="position:absolute;inset:0;background:${HEX[si%6]}35;border-top:2px solid ${HEX[si%6]};border-bottom:2px solid ${HEX[si%6]};${idx===planStartIdx?`border-left:2px solid ${HEX[si%6]};`:''}${idx===planEndIdx?`border-right:2px solid ${HEX[si%6]};`:''}"></div>`
            : '';

          // Hijau = realisasi dalam rentang rencana, Merah = realisasi melewati rencana
          const realDiv = inReal
            ? `<div class="gantt-cell-overlay ${isOverdue ? 'gantt-cell-late' : 'gantt-cell-ontime'}"></div>`
            : '';

          if (planDiv || realDiv) {
            return `<td style="${tdStyle}">${planDiv}${realDiv}</td>`;
          }
          return `<td style="${tdStyle}"></td>`;
        }).join('');

        // Hitung % realisasi
        const pct = it.planQty > 0 ? Math.min(100, Math.round((it.realisasiQty||0) / it.planQty * 100)) : 0;

        bodyHtml += `<tr>
          <td class="gantt-label" title="${it.name}">${it.name}</td>
          <td class="mono" style="text-align:center;font-size:11px;white-space:nowrap">${it.dur}hr</td>
          <td style="text-align:center;font-size:11px;min-width:50px">
            <div class="prog-bar" style="width:40px;display:inline-block">
              <div class="prog-fill" style="width:${pct}%;background:${pct===100?'var(--green)':pct>0?'var(--yellow)':'var(--border)'}"></div>
            </div>
            <span class="mono" style="font-size:10px;color:var(--muted)">${pct}%</span>
          </td>
          ${cells}
        </tr>`;
      });
    });
  });

  const html = `<div class="gantt-wrap">
    <table class="gantt-table">
      <thead>
        <tr>
          <th class="gantt-label" rowspan="2" style="text-align:left;vertical-align:bottom">Item Pekerjaan</th>
          <th rowspan="2" style="min-width:36px">Dur</th>
          <th rowspan="2" style="min-width:60px">Progress</th>
          ${monthHeader}
        </tr>
        <tr>${dayHeader}</tr>
      </thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>
  <div style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--muted)">
    <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:8px;background:rgba(59,130,246,0.25);border:2px solid #3b82f6;border-radius:2px"></div>Rencana</div>
    <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:8px;background:var(--green);border-radius:2px;opacity:0.8"></div>Realisasi Tepat Waktu</div>
    <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:8px;background:var(--red);border-radius:2px;opacity:0.8"></div>Realisasi Terlambat</div>
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

// ─── REALISASI ──────────────────────────────────────────────────
const UNITS = ["m¹","m²","m³","unit","buah","kg","ton","ls","set"];

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
        const pct = (it.planQty||0) > 0
          ? Math.min(100, ((it.realisasiQty||0) / it.planQty * 100)).toFixed(1)
          : 0;
        const pctNum = parseFloat(pct);

        const late = it.realisasiStart && it.planStart ? diffDays(it.planStart, it.realisasiStart) : 0;
        const lateHtml = late > 0
          ? `<span class="late-badge">+${late} hr terlambat</span>`
          : late < 0
            ? `<span class="early-badge">${Math.abs(late)} hr lebih awal</span>`
            : it.realisasiStart ? `<span style="color:var(--green);font-size:11px">✅ Tepat waktu</span>` : '';

        const unitOpts = UNITS.map(u => `<option value="${u}" ${(it.planUnit||'m²')===u?'selected':''}>${u}</option>`).join('');

        // Sync materialActual
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
            <td>${dev===0?'<span class="dev-zero">±0</span>':dev>0?`<span class="dev-neg">+${dev.toFixed(2)}</span>`:`<span class="dev-pos">${dev.toFixed(2)}</span>`}</td>
          </tr>`;
        }).join('');

        html += `<div class="item-block" style="margin-left:12px;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <span>${it.name}</span>
            <span style="font-size:11px;color:var(--muted)">${fmtDate(it.planStart)} – ${fmtDate(it.planEnd)}</span>
          </div>

          <!-- Info Tanggal -->
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:12px">
            <div><span style="color:var(--muted)">Rencana: </span><span class="mono">${fmtDate(it.planStart)} → ${fmtDate(it.planEnd)}</span></div>
            <div><span style="color:var(--muted)">Realisasi: </span><span class="mono">${it.realisasiStart ? fmtDate(it.realisasiStart)+' → '+fmtDate(it.realisasiEnd) : '—'}</span></div>
            <div>${lateHtml}</div>
          </div>

          <!-- Progress Satuan -->
          <div class="sub-label" style="margin-top:0">📐 Progress Pekerjaan</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
            <div>
              <div class="sub-label" style="margin-top:0">Planning Satuan</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" value="${it.planQty||0}" min="0" onchange="updPlanQty(${it.id},this.value)" style="width:100px">
                <select onchange="updPlanUnit(${it.id},this.value)" style="width:70px">${unitOpts}</select>
              </div>
            </div>
            <div>
              <div class="sub-label" style="margin-top:0">Realisasi Satuan</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" value="${it.realisasiQty||0}" min="0" onchange="updRealQty(${it.id},this.value)" style="width:100px">
                <span class="mono" style="color:var(--muted);font-size:12px" id="real-unit-label-${it.id}">${it.planUnit||'m²'}</span>
              </div>
            </div>
            <div>
              <div class="sub-label" style="margin-top:0">Progress</div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="kpi-value ${pctNum>=100?'green':pctNum>=50?'yellow':'blue'}" style="font-size:20px" id="pct-display-${it.id}">${pct}%</span>
              </div>
              <div class="prog-bar" style="width:160px;margin-top:6px">
                <div class="prog-fill" id="pct-bar-${it.id}" style="width:${pct}%;background:${pctNum>=100?'var(--green)':pctNum>=50?'var(--yellow)':'var(--accent)'}"></div>
              </div>
            </div>
          </div>

          <!-- Biaya Aktual -->
          <div class="sub-label">💰 Biaya Aktual (Rp)</div>
          <input type="number" value="${it.costActual||0}" onchange="updCA(${it.id},this.value)" style="width:180px;margin-bottom:12px">

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
}

window.updPlanQty  = (id, v) => {
  const it = proj.items.find(i=>i.id===id);
  it.planQty = parseFloat(v)||0;
  refreshPctDisplay(it);
  saveProj();
};
window.updPlanUnit = (id, v) => {
  const it = proj.items.find(i=>i.id===id);
  it.planUnit = v;
  // Update label satuan di sebelah input realisasi langsung (tanpa refresh)
  const unitLabel = document.getElementById(`real-unit-label-${id}`);
  if (unitLabel) unitLabel.textContent = v;
  saveProj();
};
window.updRealQty  = (id, v) => {
  const it = proj.items.find(i=>i.id===id);
  it.realisasiQty = parseFloat(v)||0;
  refreshPctDisplay(it);
  saveProj();
};
window.updCA   = (id, v) => { const it=proj.items.find(i=>i.id===id); it.costActual=parseFloat(v)||0; saveProj(); };
window.updMA   = (id, mi, v) => {
  const it = proj.items.find(i=>i.id===id);
  if (!it.materialActual) it.materialActual = [];
  if (!it.materialActual[mi]) it.materialActual[mi] = {};
  it.materialActual[mi].volumeActual = parseFloat(v)||0;
  saveProj();
};

function refreshPctDisplay(it) {
  const pct = (it.planQty||0) > 0
    ? Math.min(100, ((it.realisasiQty||0) / it.planQty * 100)).toFixed(1)
    : 0;
  const pctNum = parseFloat(pct);
  const color = pctNum>=100?'var(--green)':pctNum>=50?'var(--yellow)':'var(--accent)';
  const disp = document.getElementById(`pct-display-${it.id}`);
  const bar  = document.getElementById(`pct-bar-${it.id}`);
  if (disp) { disp.textContent = pct+'%'; disp.style.color = color; }
  if (bar)  { bar.style.width = pct+'%'; bar.style.background = color; }
}

// ─── DEVIASI ────────────────────────────────────────────────────
function renderDeviasi() {
  // Hitung rata-rata progress berdasarkan satuan
  let totalPlanQty = 0, totalRealQty = 0;
  proj.items.forEach(i => {
    totalPlanQty += (i.planQty||0);
    totalRealQty += (i.realisasiQty||0);
  });
  const avgProg = totalPlanQty > 0 ? Math.min(100, (totalRealQty/totalPlanQty*100)).toFixed(1) : 0;

  const costPlan = proj.items.reduce((a, i) => {
    return a + (i.tenaga||[]).reduce((s,t) => s+t.jumlah*t.harga, 0)
             + (i.material||[]).reduce((s,m) => s+m.volume*m.harga, 0);
  }, 0);
  const costAct = proj.items.reduce((a,i) => a+(i.costActual||0), 0);
  const costDev = costAct - costPlan;

  // Hitung item terlambat
  const lateItems  = proj.items.filter(i => i.realisasiStart && diffDays(i.planStart, i.realisasiStart) > 0).length;
  const onTimeItems = proj.items.filter(i => i.realisasiStart && diffDays(i.planStart, i.realisasiStart) <= 0).length;

  document.getElementById('deviasi-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Avg Progress</div>
      <div class="kpi-value ${avgProg>=80?'green':avgProg>=50?'yellow':'red'}">${avgProg}%</div>
      <div class="prog-bar"><div class="prog-fill bg4" style="width:${avgProg}%"></div></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Selesai (100%)</div>
      <div class="kpi-value green">${proj.items.filter(i=>(i.planQty||0)>0 && (i.realisasiQty||0)>=(i.planQty||0)).length}</div>
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

  // Tabel Progress
  let ph = `<div class="table-wrap"><table>
    <tr><th>Segmen</th><th>Aktivitas</th><th>Item</th><th>Rencana Mulai</th><th>Realisasi Mulai</th><th>Keterlambatan</th><th>Plan Qty</th><th>Real Qty</th><th>Progress</th><th>Status</th></tr>`;

  proj.segments.forEach(seg => {
    const si = proj.segments.indexOf(seg);
    proj.activities.filter(a=>a.segId===seg.id).forEach(act => {
      proj.items.filter(i=>i.actId===act.id).forEach(it => {
        const late = it.realisasiStart && it.planStart ? diffDays(it.planStart, it.realisasiStart) : null;
        const pct = (it.planQty||0) > 0 ? Math.min(100, ((it.realisasiQty||0)/it.planQty*100)).toFixed(1) : 0;
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
          <td class="mono">${it.realisasiQty||0} ${it.planUnit||'—'}</td>
          <td class="mono" style="color:${pct>=100?'var(--green)':pct>0?'var(--yellow)':'var(--muted)'}">${pct}%</td>
          <td>${pct>=100?'✅ Selesai':pct>0?'🟠 Progress':'🔵 Belum'}</td>
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