# PEM & REM — Project Manager
## Panduan Setup Firebase + Deploy Netlify

---

## 📁 Struktur File

```
project-manager/
├── index.html           ← Halaman login
├── dashboard.html       ← Daftar proyek
├── project.html         ← Detail proyek (semua tab)
├── css/
│   └── style.css        ← Styling global
├── js/
│   ├── firebase-config.js  ← ⚠️ WAJIB DIISI config Firebase
│   ├── auth.js          ← Login / logout / session guard
│   ├── dashboard.js     ← CRUD proyek
│   └── project.js       ← Semua fitur proyek
├── netlify.toml         ← Konfigurasi Netlify
└── README.md            ← File ini
```

---

## 🔥 LANGKAH 1 — Setup Firebase

### 1.1 Buat Firebase Project
1. Buka [https://console.firebase.google.com](https://console.firebase.google.com)
2. Klik **"Add Project"** → beri nama → klik Continue
3. Matikan Google Analytics (opsional) → klik **Create Project**

### 1.2 Aktifkan Firestore Database
1. Di sidebar kiri, klik **Firestore Database**
2. Klik **"Create database"**
3. Pilih **"Start in production mode"** → klik Next
4. Pilih region terdekat (misal: `asia-southeast2` untuk Jakarta)
5. Klik **Enable**

### 1.3 Set Firestore Rules (Security)
1. Di Firestore → tab **Rules**
2. Ganti isi rules dengan ini:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projId} {
      // Hanya user yang punya proyek bisa baca/tulis
      allow read, write: if request.auth != null
                         && request.auth.uid == resource.data.uid;
      // Boleh create kalau uid di data = uid user yang login
      allow create: if request.auth != null
                    && request.auth.uid == request.resource.data.uid;
    }
  }
}
```
3. Klik **Publish**

### 1.4 Aktifkan Google Auth
1. Di sidebar kiri, klik **Authentication**
2. Klik **"Get started"**
3. Pilih tab **"Sign-in method"**
4. Klik **Google** → toggle Enable → masukkan email support → klik **Save**

### 1.5 Daftarkan Web App & Ambil Config
1. Di Firebase Console → klik ikon ⚙️ **Project Settings**
2. Scroll ke bawah, klik ikon **`</>`** (Web App)
3. Beri nama app (misal: "project-manager-web") → klik **Register App**
4. Copy isi `firebaseConfig` yang muncul, contoh:
```js
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXX",
  authDomain: "nama-project.firebaseapp.com",
  projectId: "nama-project",
  storageBucket: "nama-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 1.6 Isi Config di Kode
Buka file **`js/firebase-config.js`**, ganti bagian ini:
```js
const firebaseConfig = {
  apiKey:            "GANTI_API_KEY_KAMU",        // ← ganti
  authDomain:        "GANTI_PROJECT_ID.firebaseapp.com",  // ← ganti
  projectId:         "GANTI_PROJECT_ID",          // ← ganti
  storageBucket:     "GANTI_PROJECT_ID.appspot.com",  // ← ganti
  messagingSenderId: "GANTI_MESSAGING_SENDER_ID", // ← ganti
  appId:             "GANTI_APP_ID"               // ← ganti
};
```

---

## 🚀 LANGKAH 2 — Deploy ke Netlify

### Cara A: Drag & Drop (Paling Mudah)
1. Buka [https://app.netlify.com](https://app.netlify.com)
2. Login / daftar akun Netlify (gratis)
3. Dari dashboard, cari tulisan **"drag and drop your site folder here"**
4. Drag seluruh folder `project-manager/` ke sana
5. Tunggu beberapa detik → Netlify akan memberi URL seperti:
   `https://amazing-name-123.netlify.app`

### Cara B: GitHub (Recommended untuk update mudah)
1. Upload folder ke GitHub repository baru
2. Di Netlify → klik **"Add new site"** → **"Import from Git"**
3. Pilih GitHub → pilih repo → klik **Deploy**
4. Setiap `git push` otomatis deploy ulang

---

## 🔒 LANGKAH 3 — Tambahkan Domain ke Firebase Auth

Setelah deploy, kamu perlu daftarkan domain Netlify ke Firebase:
1. Firebase Console → **Authentication** → tab **Settings**
2. Scroll ke **"Authorized domains"**
3. Klik **"Add domain"**
4. Masukkan domain dari Netlify (misal: `amazing-name-123.netlify.app`)
5. Klik **Add**

> ⚠️ Tanpa langkah ini, login Google akan error!

---

## ✅ Checklist Sebelum Share ke Tim

- [ ] `js/firebase-config.js` sudah diisi dengan config Firebase asli
- [ ] Firestore Rules sudah di-publish
- [ ] Google Auth sudah diaktifkan di Firebase
- [ ] Domain Netlify sudah ditambah ke Authorized Domains Firebase
- [ ] Test login dengan akun Google
- [ ] Test buat proyek baru
- [ ] Test semua tab (Setup, Gantt, Biaya, Realisasi, Deviasi)

---

## 🐛 Troubleshooting

| Error | Solusi |
|-------|--------|
| "auth/unauthorized-domain" | Tambahkan domain di Firebase Auth → Authorized Domains |
| "Missing or insufficient permissions" | Cek Firestore Rules sudah benar dan di-publish |
| Halaman putih saat refresh | Pastikan `netlify.toml` ikut ter-upload |
| Login popup tidak muncul | Pastikan browser tidak block popup |
| Data tidak tersimpan | Cek console browser (F12) untuk error detail |

---

## 💡 Tips

- Data tersimpan di Firebase Firestore, bisa diakses dari device manapun
- Setiap user hanya bisa lihat proyek miliknya sendiri (aman)
- Perubahan disimpan otomatis (auto-save) dengan delay 1 detik
- Firebase free tier (Spark) cukup untuk penggunaan tim kecil:
  - 1 GB storage Firestore
  - 50.000 reads/hari
  - 20.000 writes/hari
