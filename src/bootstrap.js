import { firebaseReady } from "./firebase.js";
import { authService, friendlyError } from "./auth.js";
import { startCloud } from "./cloud.js";
import { photoLimits, readPhoto, readRecognitionPhoto } from "./photoStorage.js";

window.familyPhotoStorage = Object.freeze({ photoLimits, readPhoto, readRecognitionPhoto });
window.familyRecognizer = Object.freeze({
  recognize: dataUrls => import("./ingredientRecognizer.js").then(module => module.recognizeIngredients(dataUrls))
});
window.familyPricer = Object.freeze({
  estimate: items => import("./priceEstimator.js").then(module => module.estimatePrices(items))
});
document.documentElement.dataset.firebase = firebaseReady ? "configured" : "not-configured";

const root = () => document.getElementById("modal-root");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let startedUid = null;

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
  screen(`<form id="login-form"><div class="brand-mark">LF</div><p class="eyebrow">FAMILY HUB</p><h1>LEE_FAMILY</h1><p class="subtitle">관리자가 만들어 준 가족 계정으로 로그인하세요.</p><label>아이디<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="예: mom"></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label><p class="login-error" id="login-error" role="alert">${esc(notice)}</p><button class="primary">로그인</button><small class="login-help">계정이 없나요? 가족 관리자에게 계정 생성을 요청해주세요.</small></form>`);
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
  messageScreen("불러오는 중", "가족 정보를 불러오고 있어요.");
  try {
    const cloud = await startCloud(user);
    await startApp(cloud, user);
  } catch (error) {
    console.error(error);
    if (error.code === "no-family") {
      messageScreen("시스템 초기화가 필요해요", "가족 공간이 아직 준비되지 않았어요. 시스템 관리자에게 문의해주세요.", { logout: true });
    } else if (error.code === "not-member") {
      messageScreen("접근 권한이 없어요", `${error.message} 관리자에게 등록을 요청해주세요.`, { logout: true });
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
