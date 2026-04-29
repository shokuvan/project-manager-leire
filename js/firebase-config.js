// ═══════════════════════════════════════════════════════════════
// FIREBASE CONFIG
// Ganti nilai di bawah dengan config Firebase project kamu!
// Cara dapat config: Firebase Console → Project Settings → Your Apps
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCR6FsIlF5O2zCvgcvOhvdwHVPNU9SROnk",
  authDomain: "project-manajer-1282d.firebaseapp.com",
  projectId: "project-manajer-1282d",
  storageBucket: "project-manajer-1282d.firebasestorage.app",
  messagingSenderId: "508017148161",
  appId: "1:508017148161:web:de5eca71190b14180e9b00"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider };
