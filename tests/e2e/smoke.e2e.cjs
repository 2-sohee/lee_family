// Mobile smoke test (emulators + Vite). See docs/DEVELOPMENT-HANDOFF.md section 7.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { chromium, devices } = require("playwright-core");
const assert = require("node:assert/strict");

const URL = "http://127.0.0.1:5179/";
const D = "lee-family.example.com";
initializeApp({ projectId: "demo-lee-family" });

async function seed() {
  const auth = getAuth(), db = getFirestore();
  for (const [u, p] of [["admin", "admin!"], ["ddoing", "ddoing1"]]) {
    await auth.deleteUser((await auth.getUserByEmail(`${u}@${D}`).catch(() => null))?.uid || "x").catch(() => {});
    await auth.createUser({ email: `${u}@${D}`, password: p });
  }
  await auth.deleteUser((await auth.getUserByEmail(`mom@${D}`).catch(() => null))?.uid || "x").catch(() => {});
  await db.doc("families/lee/members/mom").delete();
  await db.doc("families/lee").set({ familyName: "이씨네", logo: "LF", logoPhoto: "", themeColor: "#b46b7d", memberEmails: [`admin@${D}`, `ddoing@${D}`], adminEmails: [`admin@${D}`] });
  await db.doc("families/lee/members/admin").set({ username: "admin", email: `admin@${D}`, name: "관리자", role: "admin", active: true, order: 0, color: "#53626d" });
  await db.doc("families/lee/members/ddoing").set({ username: "ddoing", email: `ddoing@${D}`, name: "또잉이", role: "user", active: true, order: 1, color: "#9a7899" });
  for (const n of ["ingredients", "events", "chores", "notices"]) await db.doc(`families/lee/state/${n}`).set({ items: [] });
}

async function login(page, id, pw) {
  await page.goto(URL);
  await page.fill("#login-form [name=username]", id);
  await page.fill("#login-form [name=password]", pw);
  await page.click("#login-form button.primary");
  await page.waitForSelector("body:not(.auth-pending) #app-view .card", { timeout: 20000 });
}
async function checkNav(page, label) {
  const result = await page.evaluate(() => [...document.querySelectorAll("#main-nav .nav-item")].map(b => {
    const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { text: b.innerText.trim().split("\n").pop().trim(), inView: r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.width > 30, top: hit === b || b.contains(hit), overflow: [...b.querySelectorAll(".nav-text")].some(t => getComputedStyle(t).display !== "none" && t.scrollWidth > t.clientWidth + 1) };
  }));
  for (const r of result) assert.ok(r.inView && r.top && !r.overflow, `${label}: nav '${r.text}' ${JSON.stringify(r)}`);
  return result.map(r => r.text);
}

(async () => {
  await seed();
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ ...devices["iPhone 14"], defaultBrowserType: undefined });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await login(page, "ddoing", "ddoing1");
  console.log("nav", (await checkNav(page, "iPhone")).join(","));
  await page.evaluate(() => {
    window.familyRecognizer = { recognize: async () => [{ name: "계란", emoji: "🥚", qty: "6개", place: "냉장실", expiryDays: 10, confidence: .9 }, { name: "대파", emoji: "🥬", qty: "1단", place: "냉장실", expiryDays: 5, confidence: .8 }] };
    window.familyPricer = { estimate: async items => { window.__priceCalls = (window.__priceCalls || 0) + 1; return { prices: items.map(i => ({ id: i.id, unitPrice: 2850, total: 2850 * i.qty, store: "쿠팡", url: "", note: "", source: "ai" })), suggestions: "" }; } };
  });

  // Photo -> recognition -> confirm -> photo removed.
  await page.tap("#main-nav [data-view=fridge]");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("[data-fridge-photo-input]", { name: "fridge.png", mimeType: "image/png", buffer: png });
  await page.waitForSelector("[data-recognize-confirm]");
  await page.click("[data-recognize-confirm]");
  await page.waitForFunction(() => !document.querySelector(".photo-preview") && /사진 1장을 정리/.test(document.body.innerText));
  console.log("photo auto-removed ok");

  // Recommendations: <=5 per category, green missing chips.
  const counts = await page.$$eval("[data-recommendation]", bs => bs.map(b => Number((b.textContent.match(/\d+/) || [0])[0])));
  assert.ok(counts.every(n => n <= 5), `counts ${counts}`);
  const rows = await page.locator(".recommendation-row").count();
  assert.ok(rows > 0 && rows <= 5, `rows ${rows}`);
  const chip = await page.$eval(".missing-chip", el => getComputedStyle(el).backgroundColor);
  assert.match(chip, /rgba\(52, 168, 83/);
  console.log("recommend ok", counts.join("/"), chip);

  // Fridge item edit + delete.
  await page.click('[data-edit-ingredient]:has-text("대파")');
  await page.fill(".modal [name=qty]", "2단");
  await page.click(".modal button[type=submit]");
  await page.waitForFunction(() => /2단/.test(document.querySelector(".fridge-visual").innerText));
  await page.click('[data-edit-ingredient]:has-text("대파")');
  await page.click("[data-ingredient-delete]");
  await page.waitForFunction(() => !/대파/.test(document.querySelector(".fridge-visual").innerText));
  console.log("fridge edit/delete ok");

  // Schedule: +-3 month navigation and adding an event two months ahead.
  await page.tap("#main-nav [data-view=schedule]");
  const heading = () => page.textContent(".month-nav strong");
  const now = await heading();
  for (let i = 0; i < 3; i++) await page.click('[data-cal-shift="1"]');
  assert.ok(await page.$eval('[data-cal-shift="1"]', b => b.disabled), "next disabled at +3");
  const plus3 = await heading();
  await page.click('[data-cal-shift="0"]');
  assert.equal(await heading(), now);
  for (let i = 0; i < 3; i++) await page.click('[data-cal-shift="-1"]');
  assert.ok(await page.$eval('[data-cal-shift="-1"]', b => b.disabled), "prev disabled at -3");
  const minus3 = await heading();
  await page.click('[data-cal-shift="0"]');
  await page.click('[data-cal-shift="1"]'); await page.click('[data-cal-shift="1"]');
  await page.click("[data-modal=event]");
  const start = await page.inputValue("[data-event-start]");
  const [mn, mx] = [await page.getAttribute("[data-event-start]", "min"), await page.getAttribute("[data-event-start]", "max")];
  await page.fill(".modal [name=title]", "두달뒤 여행");
  const endD = start.slice(0, 8) + "03";
  await page.fill("[data-event-end]", endD);
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal-backdrop", { state: "detached" });
  assert.equal(await page.locator('.month-grid .event:has-text("두달뒤 여행")').count(), 3);
  await page.click('[data-cal-shift="0"]');
  assert.equal(await page.locator('.month-grid .event:has-text("두달뒤 여행")').count(), 0);
  console.log("months ok", minus3, "~", now, "~", plus3, "| input range", mn, mx, "| default", start);  const small = await browser.newContext({ ...devices["Galaxy S9+"], viewport: { width: 360, height: 780 }, defaultBrowserType: undefined });
  const p2 = await small.newPage(); await login(p2, "admin", "admin!");
  console.log("360 admin nav", (await checkNav(p2, "360")).join(","));
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("ALL OK");
})().catch(e => { console.error(e); process.exit(1); });