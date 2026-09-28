import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { auth, requireFirebase } from "./firebase.js";

// This boundary keeps the future login UI independent from Firebase SDK calls.
export const authService = {
  observe(callback) {
    requireFirebase();
    return onAuthStateChanged(auth, callback);
  },

  async signInWithGoogle() {
    requireFirebase();
    return signInWithPopup(auth, new GoogleAuthProvider());
  },

  async signOut() {
    requireFirebase();
    return signOut(auth);
  }
};
