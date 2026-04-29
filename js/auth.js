// ═══════════════════════════════════════════════════════════════
// AUTH.JS — Login, Logout, Session Guard
// ═══════════════════════════════════════════════════════════════

import { auth, provider } from "./firebase-config.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Login dengan Google
export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged akan handle redirect
  } catch (err) {
    console.error("Login gagal:", err);
    alert("Login gagal: " + err.message);
  }
}

// Logout
export async function logout() {
  await signOut(auth);
  window.location.href = "/index.html";
}

// Guard: pastikan user sudah login
// Jika belum login → redirect ke index.html
// Jika sudah login → jalankan callback(user)
export function requireAuth(callback) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "/index.html";
    } else {
      callback(user);
    }
  });
}

// Guard untuk halaman login:
// Jika sudah login → langsung redirect ke dashboard
export function redirectIfLoggedIn() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = "/dashboard.html";
    }
  });
}

export { auth };
