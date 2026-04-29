// ═══════════════════════════════════════════════════════════════
// FIREBASE CONFIG
// Ganti nilai di bawah dengan config Firebase project kamu!
// Cara dapat config: Firebase Console → Project Settings → Your Apps
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA56JF8eTcBQ0fRNih1GlKQnjOsR06PQ4k",
  authDomain: "project-manager-new-2fc5b.firebaseapp.com",
  projectId: "project-manager-new-2fc5b",
  storageBucket: "project-manager-new-2fc5b.firebasestorage.app",
  messagingSenderId: "155178880635",
  appId: "1:155178880635:web:4d1fc8bf94928737da5cde"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider };
