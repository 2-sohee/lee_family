// Mart (shared shopping list) and Budget (family piggy bank) tabs.
// app.js calls init() once with its shared helpers and renders these views.
let C = null;
export function init(context) {
  C = context;
  document.addEventListener("submit", onSubmit);
}

export const CATEGORIES = ["채소·과일", "정육·수산", "유제품·계란", "가공·냉동식품", "양념·소스", "음료·간식", "생활용품", "기타"];
export const UNITS = ["개", "팩", "봉", "병", "캔", "단", "묶음", "망", "g", "kg", "ml", "L", "박스"];
const CATEGORY_INFO = {
  "채소·과일": ["🥬", "냉장실", 7],
  "정육·수산": ["🥩", "냉장실", 3],
  "유제품·계란": ["🥛", "냉장실", 10],
  "가공·냉동식품": ["🧊", "냉동실", 60],
  "양념·소스": ["🧂", "실온", 180],
  "음료·간식": ["🧃", "실온", 90],
  "생활용품": ["🧻", "실온", 0],
  "기타": ["🛒", "냉장실", 14]
};
const CATEGORY_WORDS = [
  ["유제품·계란", ["계란", "달걀", "우유", "치즈", "요거트", "요구르트", "버터", "생크림"]],
  ["정육·수산", ["고기", "돼지", "소고기", "닭", "삼겹", "목살", "베이컨", "생선", "고등어", "연어", "새우", "오징어", "조개", "멸치"]],
  ["채소·과일", ["파", "양파", "마늘", "감자", "고구마", "당근", "배추", "상추", "양상추", "양배추", "호박", "버섯", "오이", "토마토", "고추", "시금치", "콩나물", "숙주", "사과", "바나나", "딸기", "귤", "포도", "레몬", "브로콜리", "파프리카", "깻잎", "무"]],
  ["가공·냉동식품", ["두부", "햄", "소시지", "어묵", "만두", "라면", "면", "참치", "스팸", "김치", "식빵", "빵", "떡", "카레", "짜장", "춘장", "밥"]],
  ["양념·소스", ["간장", "된장", "고추장", "소금", "설탕", "식초", "기름", "마요네즈", "케첩", "소스", "후추", "참기름", "들기름", "굴소스"]],
  ["음료·간식", ["물", "주스", "콜라", "사이다", "커피", "차", "과자", "초콜릿", "아이스크림", "맥주"]],
  ["생활용품", ["휴지", "세제", "샴푸", "치약", "칫솔", "비누", "물티슈", "키친타월", "랩", "호일", "봉투", "건전지"]]
];
const DEFAULT_MAX = 300000;
const LOW_RATIO = 0.1;

let priceBusy = false;
let priceError = "";
let priceAutoBlockedUntil = 0;
let priceSuggestions = "";
let priceTimer = null;

const won = n => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
const esc = s => C.esc(s ?? "");
const me = () => C.currentMember();
const shopping = () => (Array.isArray(C.state.shopping) ? C.state.shopping : (C.state.shopping = []));
const purchases = () => (Array.isArray(C.state.purchases) ? C.state.purchases : (C.state.purchases = []));
const budgetLog = () => (Array.isArray(C.state.budget) ? C.state.budget : (C.state.budget = []));
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const categoryOf = item => (CATEGORIES.includes(item?.category) ? item.category : "기타");
const qtyText = item => `${Number(item.qty) || 1}${item.unit || "개"}`;
const priceKey = item => `${String(item.name).trim()}|${Number(item.qty) || 1}|${item.unit || "개"}`;
const hasFreshPrice = item => item.price && item.price.key === priceKey(item) && Number(item.price.total) > 0;
const closeModal = () => { document.getElementById("modal-root").innerHTML = ""; };
const openModal = html => { document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; };
const daysAgo = isoDate => Math.round((C.dateValue(C.iso(C.today)) - C.dateValue(isoDate)) / 86400000);
const relative = isoDate => { const d = daysAgo(isoDate); return d <= 0 ? "오늘" : d === 1 ? "어제" : `${d}일 전`; };
const shopSearchUrl = name => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(name)}&sort=price_asc`;

export function guessCategory(name) {
  const n = String(name || "").replace(/\s+/g, "");
  for (const [category, words] of CATEGORY_WORDS) if (words.some(w => n === w || (w.length >= 2 && n.includes(w)))) return category;
  return "기타";
}

function memberOptions(selectedName) {
  const members = C.familyMembers();
  const selected = selectedName || me()?.name;
  const hasSelected = members.some(m => m.name === selected);
  return (selected && !hasSelected ? `<option selected>${esc(selected)}</option>` : "") +
    members.map(m => `<option value="${esc(m.name)}" ${m.name === selected ? "selected" : ""}>${esc(m.name)}</option>`).join("");
}

/* ───────────────────────────── 마트 ───────────────────────────── */

export function lastShoppingDate() {
  return purchases().reduce((latest, p) => (p.date > latest ? p.date : latest), "");
}

export function estimatedTotal(items = shopping()) {
  const priced = items.filter(hasFreshPrice);
  return { total: priced.reduce((sum, item) => sum + Number(item.price.total), 0), priced: priced.length, count: items.length };
}

function priceLine(item) {
  if (hasFreshPrice(item)) {
    const p = item.price;
    const link = p.url || shopSearchUrl(item.name);
    return `<small class="shop-price"><b>${won(p.total)}</b>${Number(item.qty) > 1 ? ` <span class="muted">(개당 ${won(p.unitPrice)})</span>` : ""} · 📍 ${esc(p.store)}${p.source === "search" ? "" : ' <span class="price-tag">AI 추정</span>'}${p.note ? ` <span class="muted">· ${esc(p.note)}</span>` : ""} <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">최저가 보기 ↗</a></small>`;
  }
  return `<small class="shop-price pending">${priceBusy ? "💰 최저가 확인 중…" : `가격 미확인 · <a href="${esc(shopSearchUrl(item.name))}" target="_blank" rel="noopener noreferrer">최저가 검색 ↗</a>`}</small>`;
}

function shopRow(item) {
  const [emoji] = CATEGORY_INFO[categoryOf(item)];
  return `<div class="row shop-row"><span class="food">${esc(item.emoji || emoji)}</span><div class="row-main"><b>${esc(item.name)} <span class="shop-qty">${esc(qtyText(item))}</span></b><small>${esc(item.owner || "가족")}${item.memo ? ` · ${esc(item.memo)}` : ""}</small>${priceLine(item)}<small class="shop-links"><a href="https://www.coupang.com/np/search?q=${encodeURIComponent(item.name)}" target="_blank" rel="noopener noreferrer">쿠팡에서 찾기 ↗</a><a href="https://www.kurly.com/search?sword=${encodeURIComponent(item.name)}" target="_blank" rel="noopener noreferrer">컬리에서 찾기 ↗</a></small></div><div class="row-actions"><button class="mini" data-shop-edit="${esc(item.id)}">수정</button><button class="mini" data-shop-delete="${esc(item.id)}">삭제</button></div></div>`;
}

export function martView() {
  const items = shopping();
  const last = lastShoppingDate();
  const { total, priced, count } = estimatedTotal(items);
  const groups = CATEGORIES.map(category => [category, items.filter(item => categoryOf(item) === category)]).filter(([, list]) => list.length);
  const recent = [...purchases()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const stale = items.length - priced;
  return `<section class="page-grid mart-page">
    <article class="card wide">
      <div class="shop-last" data-shop-last>🧾 최근 장본 날짜 <b>${last ? `${esc(last)} <span class="muted">(${relative(last)})</span>` : "아직 기록이 없어요"}</b></div>
      <div class="toolbar"><div><h2>마트 리스트 <small class="muted">(${count})</small></h2><p class="subtitle">가족 누구나 추가·수정·삭제할 수 있어요. 삭제할 때 구매했다고 답하면 냉장고로 바로 옮겨져요.</p></div>
        <div class="toolbar-actions"><button class="mini" data-shop-copy ${count ? "" : "disabled"}>📋 리스트 복사</button><button class="mini" data-shop-price ${count && !priceBusy ? "" : "disabled"}>${priceBusy ? "⏳ 조회 중…" : "💰 최저가 조회"}</button><button class="primary" data-shop-add>＋ 품목 추가</button></div></div>
      ${priceError ? `<p class="photo-status photo-error" role="alert">${esc(priceError)}</p>` : ""}
      ${groups.length ? groups.map(([category, list]) => `<div class="shop-group"><div class="shop-group-title">${CATEGORY_INFO[category][0]} ${esc(category)} <small class="muted">${list.length}</small></div><div class="table-list">${list.map(shopRow).join("")}</div></div>`).join("") : `<div class="empty">마트 리스트가 비어 있어요.<br>＋ 품목 추가로 필요한 것을 담아보세요. 냉장고 추천 메뉴에서 부족한 재료를 바로 담을 수도 있어요.</div>`}
      ${priceSuggestions ? `<iframe class="search-suggestions" title="Google 검색 추천" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(priceSuggestions)}"></iframe>` : ""}
    </article>
    ${recent.length ? `<article class="card wide"><div class="card-title">최근 구매 내역</div><div class="table-list">${recent.map(p => `<div class="row"><span>🛍️</span><div class="row-main"><b>${esc(p.name)} <span class="shop-qty">${esc(qtyText(p))}</span></b><small>${esc(p.date)} · ${esc(p.by || "")}${p.toFridge ? " · 냉장고로 이동" : ""}</small></div></div>`).join("")}</div></article>` : ""}
    <div class="mart-total card wide" data-shop-total><span>예상가격 : <b>${won(total)}</b></span><small>${count ? `${count}개 품목 중 ${priced}개 가격 반영${stale ? ` · ${stale}개 미확인` : ""} · 인터넷 최저가 기준, 배송비 제외` : "품목을 추가하면 인터넷 최저가로 예상 금액을 계산해요."}</small></div>
  </section>`;
}

export function buildCopyText() {
  const items = shopping();
  const last = lastShoppingDate();
  const { total, priced, count } = estimatedTotal(items);
  const lines = [`🛒 ${C.familyName()} 마트 리스트 (${C.iso(C.today)})`];
  if (last) lines.push(`최근 장본 날짜: ${last}`);
  for (const category of CATEGORIES) {
    const list = items.filter(item => categoryOf(item) === category);
    if (!list.length) continue;
    lines.push("", `[${category}]`);
    for (const item of list) {
      const price = hasFreshPrice(item) ? ` - ${won(item.price.total)} (${item.price.store})` : "";
      lines.push(`☐ ${item.name} ${qtyText(item)}${item.owner ? ` · ${item.owner}` : ""}${item.memo ? ` · ${item.memo}` : ""}${price}`);
    }
  }
  lines.push("", `총 ${count}개 품목${priced < count ? ` (가격 확인 ${priced}개)` : ""}`, `예상가격 : ${won(total)}`);
  return lines.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function shopForm(item) {
  const editing = Boolean(item);
  const category = item ? categoryOf(item) : "채소·과일";
  return `<h2>${editing ? "품목 수정" : "마트 품목 추가"}</h2><form class="form" data-household-form="shop" ${editing ? `data-id="${esc(item.id)}"` : ""}>
    <label>품목명<input name="name" required maxlength="40" placeholder="예: 우유" value="${esc(item?.name || "")}" data-shop-name></label>
    <div class="form-row"><label>수량<input name="qty" type="number" inputmode="decimal" min="0.1" max="9999" step="any" required value="${esc(item?.qty ?? 1)}"></label>
    <label>단위<select name="unit">${UNITS.map(u => `<option ${u === (item?.unit || "개") ? "selected" : ""}>${u}</option>`).join("")}</select></label></div>
    <label>분류<select name="category" data-shop-category>${CATEGORIES.map(c => `<option ${c === category ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    <label>요청한 사람<select name="owner">${memberOptions(item?.owner)}</select></label>
    <label>메모 <small class="muted">(선택)</small><input name="memo" maxlength="60" placeholder="예: 저지방, 1+1이면 2개" value="${esc(item?.memo || "")}"></label>
    <div class="modal-actions"><button type="button" data-close>취소</button><button type="submit" class="primary">${editing ? "저장" : "추가"}</button></div></form>`;
}

function openShopForm(item) {
  openModal(shopForm(item));
  const name = document.querySelector("[data-shop-name]"), category = document.querySelector("[data-shop-category]");
  let touched = Boolean(item);
  category.addEventListener("change", () => { touched = true; });
  name.addEventListener("input", () => { if (!touched) category.value = guessCategory(name.value); });
  name.focus();
}

function saveShopItem(form) {
  const d = Object.fromEntries(new FormData(form));
  const name = String(d.name || "").trim().slice(0, 40);
  const qty = Math.round(Math.min(9999, Math.max(0.1, Number(d.qty) || 1)) * 100) / 100;
  if (!name) return;
  const owner = C.familyMembers().find(m => m.name === d.owner);
  const values = { name, qty, unit: UNITS.includes(d.unit) ? d.unit : "개", category: CATEGORIES.includes(d.category) ? d.category : guessCategory(name), owner: String(d.owner || me()?.name || ""), ownerId: owner?.username || "", memo: String(d.memo || "").trim().slice(0, 60) };
  const existing = form.dataset.id && shopping().find(item => String(item.id) === form.dataset.id);
  if (existing) Object.assign(existing, values, { updatedAt: Date.now(), updatedBy: me()?.name || "" });
  else shopping().push({ id: newId(), ...values, addedAt: Date.now(), addedBy: me()?.name || "" });
  C.save();
  closeModal();
  C.layout();
  schedulePriceRefresh();
}

export function addMissingToShopping(names) {
  const existing = new Set(shopping().map(item => C.canonicalName(item.name)));
  const added = [];
  for (const name of names.map(n => String(n).trim()).filter(Boolean)) {
    if (existing.has(C.canonicalName(name))) continue;
    existing.add(C.canonicalName(name));
    shopping().push({ id: newId(), name, qty: 1, unit: "개", category: guessCategory(name), owner: me()?.name || "", ownerId: me()?.username || "", memo: "추천 메뉴 재료", addedAt: Date.now(), addedBy: me()?.name || "" });
    added.push(name);
  }
  if (added.length) {
    C.save();
    schedulePriceRefresh();
  }
  C.toast(added.length ? `🛒 ${added.join(", ")}을(를) 마트 리스트에 담았어요.` : "이미 마트 리스트에 있는 재료예요.");
  return added;
}

function askPurchased(item) {
  openModal(`<h2>구매하였습니까?</h2><p class="subtitle"><b>${esc(item.name)} ${esc(qtyText(item))}</b>을(를) 리스트에서 지워요.<br>구매했다면 냉장고로 옮기고 수량을 맞출 수 있어요.</p>
    <div class="modal-actions purchase-actions"><button type="button" data-close>취소</button><button type="button" data-shop-remove="${esc(item.id)}">아니요, 그냥 삭제</button><button type="button" class="primary" data-shop-bought="${esc(item.id)}">예, 구매했어요</button></div>`);
}

const splitQty = text => { const m = /^\s*(\d+(?:\.\d+)?)\s*(.*)$/.exec(String(text || "")); return m ? [Number(m[1]), m[2].trim()] : [null, String(text || "").trim()]; };

export function mergeQty(current, addQty, addUnit) {
  const [n, unit] = splitQty(current);
  if (n !== null && (unit || "개") === (addUnit || "개")) return `${Math.round((n + Number(addQty)) * 100) / 100}${unit || addUnit || "개"}`;
  return current ? `${current} + ${addQty}${addUnit}` : `${addQty}${addUnit}`;
}

function openMoveToFridge(item) {
  const category = categoryOf(item);
  const [emoji, place, days] = CATEGORY_INFO[category];
  const match = C.state.ingredients.find(i => C.canonicalName(i.name) === C.canonicalName(item.name));
  const food = category !== "생활용품";
  openModal(`<h2>🧊 냉장고로 옮기기</h2><p class="subtitle">구매한 <b>${esc(item.name)} ${esc(qtyText(item))}</b>을(를) 냉장고에 넣어요. 수량을 확인하고 저장하세요.</p>
    <form class="form" data-household-form="bought" data-id="${esc(item.id)}">
      <label class="check-line"><input type="checkbox" name="toFridge" ${food ? "checked" : ""} data-to-fridge> 냉장고 재료로 추가${food ? "" : " (생활용품은 기본 해제)"}</label>
      <div data-fridge-fields ${food ? "" : "hidden"}>
      ${match ? `<div class="merge-note">냉장고에 이미 <b>${esc(match.name)} ${esc(match.qty)}</b>이(가) 있어요.<label class="check-line"><input type="radio" name="mode" value="merge" checked data-merge-mode> 기존 재료 수량 업데이트</label><label class="check-line"><input type="radio" name="mode" value="new" data-merge-mode> 새 항목으로 추가</label><input type="hidden" name="matchId" value="${esc(match.id)}"></div>` : `<input type="hidden" name="mode" value="new">`}
      <label>재료명<input name="name" required maxlength="40" value="${esc(match?.name || item.name)}"></label>
      <label>냉장고 수량<input name="qty" required maxlength="20" value="${esc(match ? mergeQty(match.qty, item.qty, item.unit) : qtyText(item))}" data-fridge-qty data-merged="${esc(match ? mergeQty(match.qty, item.qty, item.unit) : "")}" data-single="${esc(qtyText(item))}"></label>
      <label>보관 위치<select name="place">${["냉장실", "냉동실", "실온"].map(p => `<option ${p === (match?.place || place) ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label>유통기한<input name="expiry" type="date" required value="${esc(match?.expiry && !match.mode ? match.expiry : C.addDays(days || 14))}"></label>
      <input type="hidden" name="emoji" value="${esc(match?.emoji || item.emoji || emoji)}">
      </div>
      <div class="modal-actions"><button type="button" data-close>취소</button><button type="submit" class="primary">구매 완료</button></div></form>`);
  const toggle = document.querySelector("[data-to-fridge]"), fields = document.querySelector("[data-fridge-fields]");
  toggle.addEventListener("change", () => {
    fields.hidden = !toggle.checked;
    fields.querySelectorAll("input,select").forEach(input => { input.disabled = !toggle.checked; });
  });
  if (!food) fields.querySelectorAll("input,select").forEach(input => { input.disabled = true; });
  const qty = document.querySelector("[data-fridge-qty]");
  document.querySelectorAll("[data-merge-mode]").forEach(radio => radio.addEventListener("change", () => {
    qty.value = radio.value === "merge" ? qty.dataset.merged : qty.dataset.single;
  }));
}

function completePurchase(form) {
  const d = Object.fromEntries(new FormData(form));
  const item = shopping().find(x => String(x.id) === form.dataset.id);
  if (!item) return closeModal();
  const toFridge = d.toFridge === "on";
  let fridgeName = "";
  if (toFridge) {
    const values = { name: String(d.name || item.name).trim().slice(0, 40), qty: String(d.qty || qtyText(item)).trim().slice(0, 20), place: ["냉장실", "냉동실", "실온"].includes(d.place) ? d.place : "냉장실", expiry: d.expiry || C.addDays(7) };
    const match = d.mode === "merge" && C.state.ingredients.find(i => String(i.id) === String(d.matchId));
    if (match) Object.assign(match, values);
    else C.state.ingredients.push({ id: Date.now(), emoji: d.emoji || "🥕", ...values });
    fridgeName = values.name;
  }
  purchases().unshift({ id: newId(), name: item.name, qty: item.qty, unit: item.unit, category: categoryOf(item), date: C.iso(C.today), by: me()?.name || "", toFridge });
  C.state.purchases = purchases().slice(0, 100);
  C.state.shopping = shopping().filter(x => x !== item);
  C.save();
  closeModal();
  C.layout();
  C.toast(toFridge ? `🧊 ${fridgeName}을(를) 냉장고로 옮겼어요.` : `🛍️ ${item.name} 구매 완료로 기록했어요.`);
}

function removeShopItem(id) {
  C.state.shopping = shopping().filter(item => String(item.id) !== String(id));
  C.save();
  closeModal();
  C.layout();
}

function schedulePriceRefresh() {
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => refreshPrices(false), 1200);
}

export async function refreshPrices(force) {
  if (priceBusy || !window.familyPricer) return;
  if (!force && Date.now() < priceAutoBlockedUntil) return;
  const targets = shopping().filter(item => force || !hasFreshPrice(item));
  if (!targets.length) return;
  priceBusy = true;
  priceError = "";
  if (C.view() === "mart") C.layout();
  try {
    const { prices, suggestions } = await window.familyPricer.estimate(targets.map(item => ({ id: item.id, name: item.name, qty: item.qty, unit: item.unit, category: categoryOf(item) })));
    const at = Date.now();
    for (const p of prices) {
      const item = shopping().find(x => String(x.id) === String(p.id));
      const requested = targets.find(x => String(x.id) === String(p.id));
      if (!item || !requested || priceKey(item) !== priceKey(requested)) continue;
      item.price = { unitPrice: p.unitPrice, total: p.total, store: p.store, url: p.url, note: p.note, source: p.source, checkedAt: at, key: priceKey(item) };
    }
    priceSuggestions = suggestions || priceSuggestions;
    if (!prices.length) priceError = "가격 정보를 찾지 못했어요. 품목 이름을 더 구체적으로 적어보세요.";
    C.save();
  } catch (error) {
    priceError = error.message || "가격을 조회하지 못했어요.";
    priceAutoBlockedUntil = Date.now() + 60_000;
  } finally {
    priceBusy = false;
    if (C.view() === "mart") C.layout();
  }
}

/* ───────────────────────────── Budget ───────────────────────────── */

export function budgetStatus() {
  const log = budgetLog();
  const config = log[0] || null;
  // Settings saved before any balance was entered must not count as a 0원 balance.
  const latest = log.find(entry => !entry.settingsOnly) || null;
  const max = Math.max(1, Number(config?.max) || DEFAULT_MAX);
  const balance = Math.max(0, Number(latest?.balance) || 0);
  const ratio = latest ? Math.min(1, balance / max) : 0;
  return { latest, max, balance, ratio, low: Boolean(latest) && balance < max * LOW_RATIO, account: config?.account || "" };
}

const maskAccount = account => { const digits = String(account || "").replace(/\D/g, ""); return digits.length > 4 ? `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : digits; };

function piggy({ balance, ratio, latest }) {
  const top = 42, bottom = 158, level = bottom - (bottom - top) * ratio;
  const color = !latest ? "#e6d5da" : ratio < LOW_RATIO ? "#e5645b" : ratio < 0.5 ? "#f2b84b" : "#5dbb82";
  return `<svg class="piggy" viewBox="0 0 240 190" role="img" aria-label="예산 돼지 저금통 ${Math.round(ratio * 100)}% 채워짐, 현재 잔액 ${won(balance)}">
    <defs><clipPath id="piggy-body"><ellipse cx="112" cy="100" rx="82" ry="58"/><ellipse cx="192" cy="100" rx="18" ry="21"/></clipPath>
    <linearGradient id="piggy-liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="${color}" stop-opacity=".75"/></linearGradient></defs>
    <path d="M30 96c-14-2-18 12-8 16" fill="none" stroke="#d9859b" stroke-width="5" stroke-linecap="round"/>
    <rect x="62" y="140" width="22" height="30" rx="7" fill="#f6c3d0" stroke="#d9859b" stroke-width="4"/><rect x="138" y="140" width="22" height="30" rx="7" fill="#f6c3d0" stroke="#d9859b" stroke-width="4"/>
    <path d="M140 52 L160 22 L170 60 Z" fill="#f6c3d0" stroke="#d9859b" stroke-width="4" stroke-linejoin="round"/>
    <g clip-path="url(#piggy-body)"><rect x="0" y="0" width="240" height="190" fill="#fde7ee"/><rect class="piggy-fill" x="0" y="${level.toFixed(1)}" width="240" height="${(190 - level).toFixed(1)}" fill="url(#piggy-liquid)"/>
    <path d="M0 ${level.toFixed(1)} q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"/></g>
    <ellipse cx="112" cy="100" rx="82" ry="58" fill="none" stroke="#d9859b" stroke-width="5"/><ellipse cx="192" cy="100" rx="18" ry="21" fill="none" stroke="#d9859b" stroke-width="5"/>
    <circle cx="188" cy="96" r="3.5" fill="#b35d74"/><circle cx="198" cy="96" r="3.5" fill="#b35d74"/><circle cx="160" cy="80" r="5" fill="#5b3a44"/>
    <rect x="88" y="37" width="46" height="8" rx="4" fill="#b35d74"/>
    <text x="112" y="100" text-anchor="middle" class="piggy-amount">${esc(latest ? won(balance) : "잔액 미입력")}</text>
    <text x="112" y="124" text-anchor="middle" class="piggy-ratio">${latest ? `${Math.round(ratio * 100)}%` : ""}</text>
  </svg>`;
}

export function budgetView() {
  const status = budgetStatus();
  const { latest, max, balance, ratio, low, account } = status;
  const log = budgetLog().slice(0, 20);
  const updated = latest ? new Date(latest.at || Date.now()) : null;
  const minutes = updated ? Math.max(0, Math.round((Date.now() - updated.getTime()) / 60000)) : 0;
  const ago = !updated ? "" : minutes < 1 ? "방금 전" : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`;
  return `${low ? `<div class="budget-alert" role="alert">⚠️ 예산이 10%도 남지 않았어요! 현재 잔액 <b>${won(balance)}</b> / ${won(max)} (${Math.round(ratio * 100)}%) · 지출에 주의해주세요.</div>` : ""}
  <section class="page-grid budget-page">
    <article class="card wide budget-hero">
      ${piggy(status)}
      <div class="budget-numbers"><b>${latest ? won(balance) : "현재 잔액을 입력해주세요"}</b><span>최대 예산 ${won(max)} 중 ${Math.round(ratio * 100)}% 남음</span>
      <small>${latest ? `마지막 업데이트 ${esc(ago)} · ${esc(latest.by || "")} (${latest.source === "auto" ? "자동 조회" : "직접 입력"})` : "토스뱅크 앱에서 잔액을 확인한 뒤 입력하면 가족 모두에게 바로 보여요."}</small></div>
      <div class="modal-actions budget-actions"><button class="primary" data-budget-balance>💰 잔액 입력</button><button class="mini" data-budget-settings>⚙ 예산·계좌 설정</button></div>
    </article>
    <article class="card">
      <div class="card-title">연결 계좌</div>
      <div class="budget-account"><span class="bank-badge">toss bank</span><div><b>${account ? `토스뱅크 ${esc(maskAccount(account))}` : "계좌번호 미등록"}</b><small>${account ? "예산 계좌" : "⚙ 예산·계좌 설정에서 계좌번호를 입력하세요."}</small></div></div>
      <p class="budget-note">🔄 <b>자동 조회(10분 간격):</b> 토스뱅크는 개인이 쓸 수 있는 잔액 조회 공개 API를 제공하지 않아 지금은 <b>직접 입력 모드</b>로 동작해요. 입력한 잔액은 실시간으로 모든 가족 기기에 동기화돼요.</p>
    </article>
    <article class="card">
      <div class="card-title">잔액 변경 내역</div>
      <div class="table-list">${log.length ? log.map((entry, index) => `<div class="row"><span>${index === 0 ? "🐷" : "🪙"}</span><div class="row-main"><b>${won(entry.balance)} <small class="muted">/ ${won(entry.max || DEFAULT_MAX)}</small></b><small>${esc(new Date(entry.at || 0).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))} · ${esc(entry.by || "")}${entry.note ? ` · ${esc(entry.note)}` : ""}</small></div><div class="row-actions"><button class="mini" data-budget-edit="${esc(entry.id)}">수정</button><button class="mini" data-budget-delete="${esc(entry.id)}">삭제</button></div></div>`).join("") : `<div class="empty">아직 입력된 잔액이 없어요.</div>`}</div>
    </article>
  </section>`;
}

function balanceForm(entry) {
  const status = budgetStatus();
  return `<h2>${entry ? "잔액 기록 수정" : "현재 잔액 입력"}</h2><form class="form" data-household-form="balance" ${entry ? `data-id="${esc(entry.id)}"` : ""}>
    <label>현재 잔액 (원)<input name="balance" type="number" inputmode="numeric" min="0" max="1000000000" step="1" required value="${esc(entry ? entry.balance : status.latest ? status.balance : "")}" placeholder="예: 250000"></label>
    <label>메모 <small class="muted">(선택)</small><input name="note" maxlength="40" placeholder="예: 마트 장보기 후" value="${esc(entry?.note || "")}"></label>
    <div class="modal-actions"><button type="button" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
}

function settingsForm() {
  const status = budgetStatus();
  return `<h2>예산·계좌 설정</h2><form class="form" data-household-form="budget-settings">
    <label>최대 예산 (원)<input name="max" type="number" inputmode="numeric" min="1000" max="1000000000" step="1000" required value="${esc(status.max)}"></label>
    <label>토스뱅크 계좌번호<input name="account" inputmode="numeric" maxlength="20" pattern="[0-9\\- ]{0,20}" placeholder="예: 1000-1234-5678" value="${esc(status.account)}"></label>
    <p class="subtitle">돼지 저금통은 최대 예산 대비 현재 잔액 비율로 채워지고, 10% 미만이면 경고 띠가 표시돼요.</p>
    <div class="modal-actions"><button type="button" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
}

function saveBalance(form) {
  const d = Object.fromEntries(new FormData(form));
  const balance = Math.round(Math.min(1e9, Math.max(0, Number(d.balance) || 0)));
  const status = budgetStatus();
  const existing = form.dataset.id && budgetLog().find(entry => String(entry.id) === form.dataset.id);
  if (existing) Object.assign(existing, { balance, note: String(d.note || "").trim().slice(0, 40), editedBy: me()?.name || "" });
  else budgetLog().unshift({ id: newId(), balance, max: status.max, account: status.account, note: String(d.note || "").trim().slice(0, 40), at: Date.now(), by: me()?.name || "", source: "manual" });
  C.state.budget = budgetLog().slice(0, 60);
  C.save();
  closeModal();
  C.layout();
}

function saveBudgetSettings(form) {
  const d = Object.fromEntries(new FormData(form));
  const status = budgetStatus();
  const max = Math.round(Math.min(1e9, Math.max(1000, Number(d.max) || DEFAULT_MAX)));
  const account = String(d.account || "").replace(/[^\d\- ]/g, "").trim().slice(0, 20);
  budgetLog().unshift({ id: newId(), balance: status.balance, max, account, note: "예산·계좌 설정 변경", at: Date.now(), by: me()?.name || "", source: status.latest?.source || "manual", settingsOnly: !status.latest });
  C.state.budget = budgetLog().slice(0, 60);
  C.save();
  closeModal();
  C.layout();
}

/* ───────────────────────────── wiring ───────────────────────────── */

function onSubmit(event) {
  const form = event.target.closest("[data-household-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.householdForm;
  if (type === "shop") saveShopItem(form);
  if (type === "bought") completePurchase(form);
  if (type === "balance") saveBalance(form);
  if (type === "budget-settings") saveBudgetSettings(form);
}

export function decorateNav() {
  document.querySelector('#main-nav [data-view="budget"]')?.classList.toggle("nav-alert", budgetStatus().low);
}

export function bind() {
  const on = (selector, handler) => document.querySelectorAll(selector).forEach(el => { el.onclick = () => handler(el); });
  on("[data-shop-add]", () => openShopForm(null));
  on("[data-shop-edit]", el => { const item = shopping().find(x => String(x.id) === el.dataset.shopEdit); if (item) openShopForm(item); });
  on("[data-shop-delete]", el => { const item = shopping().find(x => String(x.id) === el.dataset.shopDelete); if (item) askPurchased(item); });
  on("[data-shop-price]", () => refreshPrices(true));
  on("[data-shop-copy]", async () => C.toast(await copyText(buildCopyText()) ? "📋 마트 리스트를 복사했어요. 메신저에 붙여넣기 하세요." : "복사하지 못했어요. 다시 시도해주세요."));
  on("[data-shop-missing]", el => addMissingToShopping(el.dataset.shopMissing.split("|")));
  on("[data-budget-balance]", () => openModal(balanceForm(null)));
  on("[data-budget-settings]", () => openModal(settingsForm()));
  on("[data-budget-edit]", el => { const entry = budgetLog().find(x => String(x.id) === el.dataset.budgetEdit); if (entry) openModal(balanceForm(entry)); });
  on("[data-budget-delete]", el => {
    if (!confirm("이 잔액 기록을 삭제할까요?")) return;
    C.state.budget = budgetLog().filter(x => String(x.id) !== el.dataset.budgetDelete);
    C.save();
    C.layout();
  });
  decorateNav();
  if (C.view() === "mart" && shopping().some(item => !hasFreshPrice(item))) schedulePriceRefresh();
}

// Modal buttons are rendered outside #app-view, so they are handled by delegation.
document.addEventListener("click", event => {
  const bought = event.target.closest("[data-shop-bought]");
  if (bought) {
    const item = shopping().find(x => String(x.id) === bought.dataset.shopBought);
    if (item) openMoveToFridge(item);
    return;
  }
  const remove = event.target.closest("[data-shop-remove]");
  if (remove) removeShopItem(remove.dataset.shopRemove);
});
