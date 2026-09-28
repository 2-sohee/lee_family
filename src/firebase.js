import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const familyId = import.meta.env.VITE_FAMILY_ID || "lee";
export const loginEmailDomain = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || "lee-family.example.com";
export const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "";

const required = ["apiKey", "authDomain", "projectId", "appId"];
const hasConfig = required.every(name => Boolean(firebaseConfig[name]));
const app = hasConfig ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;

export const firebaseReady = Boolean(app);
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (app && emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

export function requireFirebase() {
  if (!app || !auth || !db) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and provide the VITE_FIREBASE_* values."
    );
  }
  return { app, auth, db };
}

export const firebaseApp = app;
