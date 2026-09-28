import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasConfig = Object.values(config).every(Boolean);
const app = hasConfig
  ? getApps()[0] ?? initializeApp(config)
  : null;

export const firebaseReady = Boolean(app);
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export function requireFirebase() {
  if (!app || !auth || !db) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and provide all VITE_FIREBASE_* values."
    );
  }

  return { app, auth, db };
}
