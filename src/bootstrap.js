import { firebaseReady } from "./firebase.js";
import { authService, friendlyError, normalizeUsername, validateCredentials } from "./auth.js";
import { createFamily, familyExists, startCloud } from "./cloud.js";
import { photoLimits, readPhoto } from "./photoStorage.js";

window.familyPhotoStorage = Object.freeze({ photoLimits, readPhoto });
document.documentElement.dataset.firebase = firebaseReady ? "configured" : "not-configured";

const root = () => document.getElementById("modal-root");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let startedUid = null;
let pendingSetup = null;

function toast(message) {
  let element = document.querySelector(".app-toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "app-toast";
    element.setAttribute("role", "alert");
    document.body.appendChild(element);
  }
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 4500);
}
window.familyToast = toast;

function screen(content) {
  document.body.classList.add("auth-pending");
  root().innerHTML = `<main class="login-screen"><div class="login-card">${content}</div></main>`;
}

function messageScreen(title, body, { logout = false } = {}) {
  screen(`<div class="brand-mark">LF</div><p class="eyebrow">FAMILY HUB</p><h1>${esc(title)}</h1><p class="subtitle">${esc(body)}</p>${logout ? `<button class="primary" type="button" data-auth-logout>다른 계정으로 로그인</button>` : ""}`);
  root().querySelector("[data-auth-logout]")?.addEventListener("click", () => authService.signOut());
}

function busy(form, isBusy) {
  form.querySelectorAll("button, input").forEach(element => { element.disabled = isBusy; });
}

function loginScreen(notice = "") {
  screen(`<form id="login-form"><div class="brand-mark">LF</div><p class="eyebrow">FAMILY HUB</p><h1>LEE_FAMILY</h1><p class="subtitle">관리자가 만들어 준 가족 계정으로 로그인하세요.</p><label>아이디<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="예: mom"></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label><p class="login-error" id="login-error" role="alert">${esc(notice)}</p><button class="primary">로그인</button><small class="login-help">계정이 없나요? 가족 관리자에게 계정 생성을 요청해주세요.<br><button type="button" class="link-btn" data-setup>처음 설치하셨나요? 최초 관리자 계정 만들기</button></small></form>`);
  const form = document.getElementById("login-form");
  form.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    busy(form, true);
    try {
      await authService.signIn(data.username, data.password);
    } catch (error) {
      busy(form, false);
      document.getElementById("login-error").textContent = friendlyError(error);
    }
  };
  form.querySelector("[data-setup]").onclick = () => setupScreen();
}

function setupScreen(user = null) {
  screen(`<form id="setup-form"><div class="brand-mark">LF</div><p class="eyebrow">FIRST SETUP</p><h1>최초 관리자 만들기</h1><p class="subtitle">가족 공간을 처음 만들 때 한 번만 사용합니다. 이미 설정된 경우에는 만들 수 없어요.</p><label>가족 이름<input name="familyName" required maxlength="60" value="LEE_FAMILY"></label><label>관리자 표시 이름<input name="name" required maxlength="40" value="관리자"></label>${user ? "" : `<label>관리자 아이디<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="예: admin"></label><label>비밀번호 (6자 이상)<input name="password" type="password" autocomplete="new-password" required minlength="6"></label><label>비밀번호 확인<input name="confirm" type="password" autocomplete="new-password" required minlength="6"></label>`}<p class="login-error" id="setup-error" role="alert"></p><button class="primary">가족 공간 만들기</button><small class="login-help"><button type="button" class="link-btn" data-back>로그인으로 돌아가기</button></small></form>`);
  const form = document.getElementById("setup-form");
  const errorBox = document.getElementById("setup-error");
  form.querySelector("[data-back]").onclick = () => (user ? authService.signOut() : loginScreen());
  form.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const profile = { name: data.name.trim(), familyName: data.familyName.trim() };
    if (user) {
      busy(form, true);
      pendingSetup = profile;
      handleUser(user);
      return;
    }
    const invalid = validateCredentials(data.username, data.password);
    if (invalid) { errorBox.textContent = invalid; return; }
    if (data.password !== data.confirm) { errorBox.textContent = "비밀번호가 서로 달라요."; return; }
    busy(form, true);
    pendingSetup = profile;
    try {
      await authService.signUpSelf(normalizeUsername(data.username), data.password);
    } catch (error) {
      pendingSetup = null;
      busy(form, false);
      errorBox.textContent = error.code === "auth/email-already-in-use"
        ? "이미 있는 아이디예요. 로그인 화면에서 로그인해주세요."
        : friendlyError(error);
    }
  };
}

async function runSetup(user) {
  const profile = pendingSetup;
  pendingSetup = null;
  try {
    await createFamily(user, profile);
    return true;
  } catch (error) {
    console.error(error);
    if (error.code === "permission-denied") {
      // The family already exists; remove the account that was just created.
      await user.delete().catch(() => authService.signOut());
      loginScreen("이미 가족 공간이 설정되어 있어요. 관리자에게 계정을 요청해주세요.");
    } else {
      messageScreen("가족 공간을 만들지 못했어요", friendlyError(error), { logout: true });
    }
    return false;
  }
}

async function startApp(cloud, user) {
  startedUid = user.uid;
  window.familyCloud = cloud;
  cloud.onChange((type, detail) => {
    if (type === "error") toast(detail);
    if (type === "revoked") {
      toast("가족 구성원 권한이 해제되었어요.");
      setTimeout(() => cloud.signOut(), 1200);
    }
  });
  root().innerHTML = "";
  document.body.classList.remove("auth-pending");
  await import("../identity.js");
  await import("../app.js");
}

async function handleUser(user) {
  if (startedUid) {
    if (!user || user.uid !== startedUid) location.reload();
    return;
  }
  if (!user) {
    loginScreen();
    return;
  }
  if (pendingSetup && !(await runSetup(user))) return;
  messageScreen("불러오는 중", "가족 정보를 불러오고 있어요.");
  try {
    const cloud = await startCloud(user);
    await startApp(cloud, user);
  } catch (error) {
    console.error(error);
    if (error.code === "no-family") {
      setupScreen(user);
    } else if (error.code === "not-member") {
      const exists = await familyExists().catch(() => true);
      if (!exists) setupScreen(user);
      else messageScreen("접근 권한이 없어요", `${error.message} 관리자에게 등록을 요청해주세요.`, { logout: true });
    } else {
      messageScreen("불러오지 못했어요", friendlyError(error), { logout: true });
    }
  }
}

if (!firebaseReady) {
  messageScreen("Firebase 설정이 필요해요", ".env.local 또는 GitHub Secrets에 VITE_FIREBASE_* 값을 설정한 뒤 다시 빌드해주세요.");
} else {
  authService.observe(handleUser);
}
