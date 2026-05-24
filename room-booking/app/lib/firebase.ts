import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBaTK_neoIiJ99qxlgjDvt2HJlIE6kOgLs",
  authDomain: "room-book-d9304.firebaseapp.com",
  projectId: "room-book-d9304",
  storageBucket: "room-book-d9304.firebasestorage.app",
  messagingSenderId: "854882629980",
  appId: "1:854882629980:web:c327e40bee1ab31674e999"
};

// This prevents Next.js from initializing Firebase multiple times during hot-reloads
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };