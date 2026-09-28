import { deleteApp, initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { auth, emulatorHost, firebaseConfig, loginEmailDomain, requireFirebase } from "./firebase.js";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,29}$/;
export const MIN_PASSWORD_LENGTH = 6;
// Read-only guest login. Visitors type guest/guest (or press the guest button);
// Firebase needs 6+ characters, so the real password is derived here. Firestore
// rules, not this password, keep the guest read-only.
export const GUEST_USERNAME = "guest";
export const GUEST_PASSWORD = "guest";
const GUEST_AUTH_PASSWORD = "guest-lee-view";

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function usernameToEmail(username) {
  const id = normalizeUsername(username);
  return id.includes("@") ? id : `${id}@${loginEmailDomain}`;
}

export function emailToUsername(email) {
  const value = String(email || "").toLowerCase();
  const suffix = `@${loginEmailDomain}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

export function validateCredentials(username, password) {
  if (!USERNAME_PATTERN.test(normalizeUsername(username))) {
    return "아이디는 영문 소문자/숫자로 시작하고, 영문·숫자·. _ - 를 사용해 2~30자로 입력해주세요.";
  }
  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`;
  }
  return "";
}

const messages = {
  "auth/invalid-credential": "아이디 또는 비밀번호를 확인해주세요.",
  "auth/wrong-password": "비밀번호를 확인해주세요.",
  "auth/user-not-found": "등록되지 않은 아이디예요.",
  "auth/invalid-email": "아이디 형식을 확인해주세요.",
  "auth/email-already-in-use": "이미 사용 중인 아이디예요.",
  "auth/weak-password": `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`,
  "auth/too-many-requests": "시도가 너무 많아요. 잠시 후 다시 시도해주세요.",
  "auth/network-request-failed": "네트워크 연결을 확인해주세요.",
  "auth/operation-not-allowed": "Firebase Console에서 이메일/비밀번호 로그인을 활성화해주세요.",
  "auth/requires-recent-login": "보안을 위해 다시 로그인한 뒤 시도해주세요.",
  "permission-denied": "권한이 없어요. 관리자에게 가족 구성원 등록을 요청해주세요."
};

export function friendlyError(error) {
  return messages[error?.code] || error?.message || "알 수 없는 오류가 발생했어요.";
}

export const authService = {
  observe(callback) {
    requireFirebase();
    return onAuthStateChanged(auth, callback);
  },

  signIn(username, password) {
    requireFirebase();
    const isGuest = normalizeUsername(username) === GUEST_USERNAME && password === GUEST_PASSWORD;
    return signInWithEmailAndPassword(auth, usernameToEmail(username), isGuest ? GUEST_AUTH_PASSWORD : password);
  },

  signInGuest() {
    return this.signIn(GUEST_USERNAME, GUEST_PASSWORD);
  },

  signUpSelf(username, password) {
    requireFirebase();
    return createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
  },

  // Uses a throwaway app instance so creating another member's account does
  // not replace the administrator's current session.
  async createAccount(username, password) {
    requireFirebase();
    const secondary = initializeApp(firebaseConfig, `account-creator-${Date.now()}`);
    try {
      const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
      if (emulatorHost) connectAuthEmulator(secondaryAuth, `http://${emulatorHost}:9099`, { disableWarnings: true });
      const credential = await createUserWithEmailAndPassword(secondaryAuth, usernameToEmail(username), password);
      await signOut(secondaryAuth);
      return credential.user.uid;
    } finally {
      await deleteApp(secondary);
    }
  },

  async changePassword(currentPassword, nextPassword) {
    requireFirebase();
    const user = auth.currentUser;
    if (!user) throw new Error("로그인이 필요해요.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, nextPassword);
  },

  signOut() {
    requireFirebase();
    return signOut(auth);
  }
};
