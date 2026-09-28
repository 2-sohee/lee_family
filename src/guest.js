// Read-only guest mode. Firestore rules already reject every guest write; this
// layer keeps the UI honest by stopping edit actions before they happen.
const GUEST_MESSAGE = "게스트는 구경만 할 수 있어요.";

// Controls that only change what is shown, never the family data.
const ALLOWED = [
  ".nav-item",
  ".logout-btn",
  "[data-go]",
  "[data-recommendation]",
  "[data-cal-shift]",
  "[data-page]",
  "[data-view-notice]",
  "[data-close]",
  "[data-shop-copy]",
  ".shop-links a",
  "[data-guest-allow]"
].join(",");

const INTERACTIVE = "button, a[href], input, select, textarea, label, summary, [role='button'], [data-toggle], [data-go], [onclick]";

export function isGuestAllowed(target) {
  return Boolean(target.closest(ALLOWED));
}

export function enableGuestMode({ toast }) {
  document.body.classList.add("guest-mode");

  const banner = document.createElement("div");
  banner.className = "guest-banner";
  banner.setAttribute("role", "status");
  banner.textContent = "👀 게스트 모드 · 구경만 할 수 있어요 (추가·수정·삭제·AI 기능 사용 불가)";
  document.body.prepend(banner);

  const block = event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (event.type === "submit" || event.type === "change") {
      if (target.closest(".login-card")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toast(GUEST_MESSAGE);
      return;
    }
    if (isGuestAllowed(target)) return;
    if (target.closest(".modal-backdrop") && !target.closest(".modal")) return;
    if (!target.closest(INTERACTIVE) && !target.closest(".brand-mark, #profile-summary")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toast(GUEST_MESSAGE);
  };
  ["click", "submit", "change"].forEach(type => document.addEventListener(type, block, true));
}
