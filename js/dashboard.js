// ═══════════════════════════════════════════════════════════════
// DASHBOARD.JS — Daftar Proyek (Firestore CRUD)
// ═══════════════════════════════════════════════════════════════

import { db } from "./firebase-config.js";
import { requireAuth, logout } from "./auth.js";
import {
  collection, doc,
  addDoc, getDocs, deleteDoc, query,
  orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Helpers ───────────────────────────────────────────────────
const HEX = ['#3b82f6','#06b6d4','#8b5cf6','#f59e0b','#22c55e','#f43f5e'];

function fmtDate(d) {
  if (!d) return '—';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── Main ───────────────────────────────────────────────────────
let currentUser = null;

requireAuth(async (user) => {
  currentUser = user;

  // Isi UI user
  document.getElementById('user-name').textContent = user.displayName || user.email;
  if (user.photoURL) {
    document.getElementById('user-avatar').src = user.photoURL;
    document.getElementById('user-avatar').style.display = '';
  }
  document.getElementById('btn-logout').addEventListener('click', logout);

  await loadProjects();
});

// ─── Load semua proyek milik user ──────────────────────────────
async function loadProjects() {
  const grid = document.getElementById('proj-grid');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div> Memuat proyek...</div>';

  try {
    const q = query(
    collection(db, 'projects'),
    orderBy('createdAt', 'desc')
  );
    const snap = await getDocs(q);
    const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProjects(projects);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Gagal memuat. Cek koneksi.</div>';
  }
}

// ─── Render kartu proyek ───────────────────────────────────────
function renderProjects(projects) {
  const grid = document.getElementById('proj-grid');
  if (!projects.length) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">📁</div>Belum ada proyek. Buat yang pertama!</div>';
    return;
  }
  grid.innerHTML = projects.map(p => {
    const segs  = (p.segments || []).length;
    const items = (p.items    || []).length;
    const totalDur = items ? Math.max(...(p.items||[]).map(i => (i.startDay||1) + (i.dur||1) - 1)) : 0;
    const avgProg  = items ? Math.round((p.items||[]).reduce((a,i) => a + (i.progressActual||0), 0) / items) : 0;
    return `
    <div class="proj-card" onclick="goToProject('${p.id}')">
      <button class="proj-card-del" onclick="event.stopPropagation(); confirmDelete('${p.id}', this)" title="Hapus proyek">✕</button>
      <div class="proj-card-name">${p.name || 'Tanpa Nama'}</div>
      <div class="proj-card-meta">${fmtDate(p.startDate)} · Dibuat ${fmtDate(p.createdAt)}</div>
      <div class="proj-card-stats">
        <div class="proj-stat"><span>${segs}</span> Segmen</div>
        <div class="proj-stat"><span>${items}</span> Item</div>
        <div class="proj-stat"><span>${totalDur}</span> Hari</div>
        <div class="proj-stat">Progress <span>${avgProg}%</span></div>
      </div>
      <div class="prog-bar" style="margin-top:12px">
        <div class="prog-fill bg0" style="width:${avgProg}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ─── Navigasi ke halaman proyek ────────────────────────────────
window.goToProject = (id) => {
  window.location.href = `/project.html?id=${id}`;
};

// ─── Hapus proyek ──────────────────────────────────────────────
window.confirmDelete = async (id, btn) => {
  if (!confirm('Hapus proyek ini? Semua data akan hilang permanen.')) return;
  btn.textContent = '...';
  try {
    await deleteDoc(doc(db, 'projects', id));
    toast('Proyek dihapus.');
    await loadProjects();
  } catch (err) {
    toast('Gagal menghapus.', 'error');
  }
};

// ─── Buat proyek baru ──────────────────────────────────────────
document.getElementById('btn-new-proj').addEventListener('click', () => {
  document.getElementById('modal-proj-name').value = '';
  document.getElementById('modal-proj-start').value = new Date().toISOString().slice(0, 10);
  openModal('modal-new-proj');
  setTimeout(() => document.getElementById('modal-proj-name').focus(), 200);
});

document.getElementById('btn-cancel-modal').addEventListener('click', () => closeModal('modal-new-proj'));
document.getElementById('modal-new-proj').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal('modal-new-proj');
});

document.getElementById('btn-create-proj').addEventListener('click', async () => {
  const name      = document.getElementById('modal-proj-name').value.trim() || 'Proyek Baru';
  const startDate = document.getElementById('modal-proj-start').value;
  const btn       = document.getElementById('btn-create-proj');

  btn.disabled = true;
  btn.textContent = 'Membuat...';

  try {
    const ref = await addDoc(collection(db, 'projects'), {
      uid:       currentUser.uid,
      name,
      startDate,
      createdAt: serverTimestamp(),
      segments:  [],
      items:     []
    });
    closeModal('modal-new-proj');
    toast('Proyek dibuat!');
    window.location.href = `/project.html?id=${ref.id}`;
  } catch (err) {
    toast('Gagal membuat proyek.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buat Proyek →';
  }
});
