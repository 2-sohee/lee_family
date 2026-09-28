import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { authService, emailToUsername, normalizeUsername, usernameToEmail } from "./auth.js";
import { db, familyId } from "./firebase.js";

export const STATE_COLLECTIONS = Object.freeze(["ingredients", "events", "chores", "notices", "shopping", "purchases", "budget"]);
export const SELF_EDITABLE_MEMBER_FIELDS = Object.freeze(["name", "englishName", "avatar", "photo", "color"]);
const MAX_DOC_BYTES = 950 * 1024;
const DEFAULT_THEME = "#b46b7d";
const MEMBER_COLORS = ["#d39a62", "#9a7899", "#7595ad", "#6ea38f", "#c7798a", "#8c8f5a"];

const familyRef = () => doc(db, "families", familyId);
const memberRef = username => doc(db, "families", familyId, "members", username);
const stateRef = name => doc(db, "families", familyId, "state", name);
const photoRef = id => doc(db, "families", familyId, "fridgePhotos", id);
const clean = value => JSON.parse(JSON.stringify(value ?? null));

export class CloudAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function memberDefaults(member, index = 0) {
  const username = normalizeUsername(member.username);
  return {
    username,
    email: usernameToEmail(username),
    name: String(member.name || username).trim(),
    englishName: String(member.englishName || "").trim(),
    avatar: String(member.avatar || String(member.name || username).slice(0, 2)).trim(),
    photo: String(member.photo || ""),
    color: /^#[0-9a-f]{6}$/i.test(member.color || "") ? member.color : MEMBER_COLORS[index % MEMBER_COLORS.length],
    activeCount: Math.max(0, Number(member.activeCount) || 0),
    role: member.role === "admin" ? "admin" : "user",
    active: member.active !== false,
    order: Number.isFinite(Number(member.order)) ? Number(member.order) : Date.now()
  };
}

function accessLists(members) {
  const active = members.filter(m => m.active);
  return {
    memberEmails: active.map(m => m.email),
    adminEmails: active.filter(m => m.role === "admin").map(m => m.email)
  };
}

function firstSnapshot(reference, onData, onError) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const unsubscribe = onSnapshot(
      reference,
      snapshot => {
        onData(snapshot);
        if (!settled) {
          settled = true;
          resolve(unsubscribe);
        }
      },
      error => {
        if (!settled) {
          settled = true;
          reject(error);
        } else {
          onError(error);
        }
      }
    );
  });
}

export async function startCloud(user) {
  const email = user.email.toLowerCase();
  const username = emailToUsername(email);
  const listeners = new Set();
  const unsubscribers = [];
  const emit = (type, detail) => listeners.forEach(listener => {
    try {
      listener(type, detail);
    } catch (error) {
      console.error(error);
    }
  });

  const settings = { familyName: "LEE_FAMILY", logo: "LF", logoPhoto: "", themeColor: DEFAULT_THEME, members: [] };
  const state = { ingredients: [], events: [], chores: [], notices: [], shopping: [], purchases: [], budget: [], fridgePhotos: [] };
  const lastSaved = {};
  let knownPhotoIds = new Set();
  let lastFamilyJson = "";
  let lastMembersJson = "";
  let lastPhotosJson = "";

  const handleListenerError = error => {
    console.error(error);
    if (error.code === "permission-denied") emit("revoked");
    else emit("error", "실시간 동기화에 문제가 생겼어요. 새로고침해주세요.");
  };

  const reportWrite = promise => promise.catch(error => {
    console.error(error);
    emit("error", error.code === "permission-denied"
      ? "저장 권한이 없어요. 관리자에게 문의해주세요."
      : "저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해주세요.");
    throw error;
  });

  try {
    const familySnapshot = await getDoc(familyRef());
    if (!familySnapshot.exists()) throw new CloudAccessError("no-family", "가족 정보가 아직 만들어지지 않았어요.");
    if (!(familySnapshot.data().memberEmails || []).includes(email)) {
      throw new CloudAccessError("not-member", "이 계정은 가족 구성원으로 등록되어 있지 않아요.");
    }
  } catch (error) {
    if (error.code === "permission-denied") {
      throw new CloudAccessError("not-member", "이 계정은 가족 구성원으로 등록되어 있지 않아요.");
    }
    throw error;
  }

  unsubscribers.push(await firstSnapshot(familyRef(), snapshot => {
    const data = snapshot.data() || {};
    if (!(data.memberEmails || []).includes(email)) {
      emit("revoked");
      return;
    }
    const next = {
      familyName: data.familyName || "LEE_FAMILY",
      logo: data.logo || "LF",
      logoPhoto: data.logoPhoto || "",
      themeColor: /^#[0-9a-f]{6}$/i.test(data.themeColor || "") ? data.themeColor : DEFAULT_THEME
    };
    const json = JSON.stringify(next);
    if (json === lastFamilyJson) return;
    lastFamilyJson = json;
    Object.assign(settings, next);
    emit("settings");
  }, handleListenerError));

  unsubscribers.push(await firstSnapshot(collection(db, "families", familyId, "members"), snapshot => {
    const members = snapshot.docs
      .map((item, index) => ({ ...memberDefaults({ ...item.data(), username: item.id }, index) }))
      .sort((a, b) => a.order - b.order || a.username.localeCompare(b.username));
    const json = JSON.stringify(members);
    if (json === lastMembersJson) return;
    lastMembersJson = json;
    settings.members = members.map(member => ({ ...member, id: member.username }));
    emit("settings");
  }, handleListenerError));

  for (const name of STATE_COLLECTIONS) {
    unsubscribers.push(await firstSnapshot(stateRef(name), snapshot => {
      const items = Array.isArray(snapshot.data()?.items) ? snapshot.data().items : [];
      const json = JSON.stringify(items);
      if (json === lastSaved[name]) return;
      lastSaved[name] = json;
      state[name] = items;
      emit("state", name);
    }, handleListenerError));
  }

  unsubscribers.push(await firstSnapshot(collection(db, "families", familyId, "fridgePhotos"), snapshot => {
    const photos = snapshot.docs
      .map(item => ({ ...item.data(), id: item.id }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const json = JSON.stringify(photos.map(photo => photo.id));
    knownPhotoIds = new Set(photos.map(photo => photo.id));
    if (json === lastPhotosJson) return;
    lastPhotosJson = json;
    state.fridgePhotos = photos;
    emit("state", "fridgePhotos");
  }, handleListenerError));

  const me = () => settings.members.find(member => member.username === username);
  const isAdmin = () => me()?.role === "admin" && me()?.active;

  function saveState() {
    const writes = [];
    for (const name of STATE_COLLECTIONS) {
      const items = clean(Array.isArray(state[name]) ? state[name] : []);
      const json = JSON.stringify(items);
      if (json === lastSaved[name]) continue;
      if (json.length > MAX_DOC_BYTES) {
        emit("error", "저장할 데이터가 너무 많아요. 오래된 항목을 정리해주세요.");
        continue;
      }
      lastSaved[name] = json;
      writes.push(setDoc(stateRef(name), { items, updatedAt: serverTimestamp(), updatedBy: username }));
    }

    const photos = Array.isArray(state.fridgePhotos) ? state.fridgePhotos : [];
    photos.forEach((photo, index) => {
      if (!photo.id) photo.id = `photo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    });
    const currentIds = new Set(photos.map(photo => photo.id));
    photos.forEach((photo, index) => {
      if (knownPhotoIds.has(photo.id)) return;
      if (String(photo.dataUrl || "").length > MAX_DOC_BYTES) {
        emit("error", "사진 용량이 너무 커요. 더 작은 사진을 선택해주세요.");
        return;
      }
      writes.push(setDoc(photoRef(photo.id), {
        dataUrl: photo.dataUrl,
        name: photo.name || "",
        type: photo.type || "",
        size: Number(photo.size) || 0,
        order: Date.now() + index,
        createdBy: username,
        createdAt: serverTimestamp()
      }));
    });
    for (const id of knownPhotoIds) {
      if (!currentIds.has(id)) writes.push(deleteDoc(photoRef(id)));
    }
    knownPhotoIds = currentIds;
    lastPhotosJson = JSON.stringify(photos.map(photo => photo.id));

    return reportWrite(Promise.all(writes)).catch(() => {});
  }

  function saveProfile(member) {
    const changes = {};
    SELF_EDITABLE_MEMBER_FIELDS.forEach(field => {
      changes[field] = String(member[field] ?? "");
    });
    return reportWrite(updateDoc(memberRef(member.username), changes));
  }

  // Administrator-only: writes brand settings, every member profile and the
  // access lists that Firestore rules use for authorization.
  function saveFamily() {
    if (!isAdmin()) return Promise.reject(new CloudAccessError("forbidden", "관리자만 변경할 수 있어요."));
    const members = settings.members.map((member, index) => memberDefaults({ ...member, order: member.order ?? index }, index));
    const lists = accessLists(members);
    if (!lists.adminEmails.length) return Promise.reject(new CloudAccessError("invalid", "활성 관리자 계정이 하나 이상 필요합니다."));
    if (!lists.adminEmails.includes(email)) {
      return Promise.reject(new CloudAccessError("invalid", "현재 로그인한 관리자 본인의 관리자 권한은 해제할 수 없어요."));
    }
    const batch = writeBatch(db);
    batch.update(familyRef(), {
      familyName: settings.familyName,
      logo: settings.logo || "LF",
      logoPhoto: settings.logoPhoto || "",
      themeColor: settings.themeColor,
      ...lists,
      updatedAt: serverTimestamp()
    });
    members.forEach(member => batch.set(memberRef(member.username), member, { merge: true }));
    return reportWrite(batch.commit());
  }

  // Family accounts are always regular users; the single system admin is provisioned server-side.
  async function createMember({ username: rawUsername, password, name }) {
    if (!isAdmin()) throw new CloudAccessError("forbidden", "관리자만 계정을 만들 수 있어요.");
    const newUsername = normalizeUsername(rawUsername);
    // Creating an account for an existing profile acts as a password reset
    // after the old login was deleted in the Firebase console.
    const existing = settings.members.find(member => member.username === newUsername);
    await authService.createAccount(newUsername, password);
    if (existing) {
      const members = settings.members.map(member => member.username === newUsername ? { ...member, active: true } : member);
      const batch = writeBatch(db);
      batch.update(memberRef(newUsername), { active: true });
      batch.update(familyRef(), { ...accessLists(members), updatedAt: serverTimestamp() });
      await reportWrite(batch.commit());
      return;
    }
    const member = memberDefaults({
      username: newUsername,
      name,
      role: "user",
      order: settings.members.length ? Math.max(...settings.members.map(m => m.order || 0)) + 1 : 0
    }, settings.members.length);
    const members = [...settings.members, member];
    const batch = writeBatch(db);
    batch.set(memberRef(newUsername), { ...member, createdAt: serverTimestamp() });
    batch.update(familyRef(), { ...accessLists(members), updatedAt: serverTimestamp() });
    await reportWrite(batch.commit());
  }

  async function removeMember(targetUsername) {
    if (!isAdmin()) throw new CloudAccessError("forbidden", "관리자만 구성원을 삭제할 수 있어요.");
    if (targetUsername === username) throw new CloudAccessError("invalid", "본인 계정은 삭제할 수 없어요.");
    const members = settings.members.filter(member => member.username !== targetUsername);
    const lists = accessLists(members);
    if (!lists.adminEmails.length) throw new CloudAccessError("invalid", "활성 관리자 계정이 하나 이상 필요합니다.");
    const batch = writeBatch(db);
    batch.delete(memberRef(targetUsername));
    batch.update(familyRef(), { ...lists, updatedAt: serverTimestamp() });
    await reportWrite(batch.commit());
  }

  return {
    familyId,
    username,
    email,
    settings,
    state,
    me,
    isAdmin,
    saveState,
    saveProfile,
    saveFamily,
    createMember,
    removeMember,
    changePassword: (current, next) => authService.changePassword(current, next),
    signOut: async () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      await authService.signOut();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
