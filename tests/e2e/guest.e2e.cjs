// Guest (read-only) E2E (emulators + Vite). See docs/DEVELOPMENT-HANDOFF.md.
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
  for (const [u, p] of [["admin", "admin!"], ["ddoing", "ddoing1"], ["guest", "guest-lee-view"]]) {
    await auth.deleteUser((await auth.getUserByEmail(`${u}@${D}`).catch(() => null))?.uid || "x").catch(() => {});
    await auth.createUser({ email: `${u}@${D}`, password: p });
  }
  await db.doc("families/lee").set({ familyName: "이씨네", logo: "LF", logoPhoto: "", themeColor: "#b46b7d", memberEmails: [`admin@${D}`, `ddoing@${D}`], adminEmails: [`admin@${D}`], guestEmails: [`guest@${D}`] });
  await db.doc("families/lee/members/admin").set({ username: "admin", email: `admin@${D}`, name: "관리자", role: "admin", active: true, order: 0, color: "#53626d" });
  await db.doc("families/lee/members/ddoing").set({ username: "ddoing", email: `ddoing@${D}`, name: "또잉이", role: "user", active: true, order: 1, color: "#9a7899" });
  const items = {
    ingredients: [{ id: 1, emoji: "🥚", name: "계란", qty: "6개", place: "냉장실", expiry: "2099-01-01" }],
    chores: [{ id: 2, title: "청소", owner: "또잉이", ownerId: "ddoing", done: false, due: "오늘", repeat: "없음" }],
    shopping: [{ id: "s1", name: "우유", qty: 1, unit: "개", category: "유제품", owner: "또잉이" }],
    events: [], notices: [], purchases: [], budget: []
  };
  for (const [n, list] of Object.entries(items)) await db.doc(`families/lee/state/${n}`).set({ items: list });
}

(async () => {
  await seed();
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ ...devices["iPhone 14"], defaultBrowserType: undefined });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(URL);
  await page.waitForSelector("[data-guest-login]");
  assert.ok((await page.textContent(".guest-entry")).includes("게스트로 방문하셨나요?"));
  await page.tap("[data-guest-login]");
  await page.waitForSelector("body:not(.auth-pending) #app-view .card", { timeout: 20000 });
  assert.ok(await page.isVisible(".guest-banner"), "guest banner");
  assert.ok((await page.textContent("#profile-summary")).includes("GUEST"));
  assert.equal(await page.locator("[data-identity-view]").count(), 0, "no profile/settings nav for guest");

  let aiCalls = 0;
  await page.exposeFunction("__aiCalled", () => { aiCalls += 1; });
  await page.evaluate(() => {
    const orig = window.familyPricer.estimate;
    window.familyPricer = { estimate: items => { window.__aiCalled(); return orig(items); } };
  });

  // Navigation works and data is visible.
  await page.tap("#main-nav [data-view=fridge]");
  await page.waitForTimeout(300);
  assert.ok((await page.textContent("#app-view")).includes("계란"), "fridge visible");
  assert.equal(await page.locator("#app-view [data-photo]:visible").count(), 0, "photo upload hidden");
  await page.tap("#main-nav [data-view=mart]");
  await page.waitForTimeout(2000);
  assert.ok((await page.textContent("#app-view")).includes("우유"), "mart visible");
  assert.equal(aiCalls, 0, "no automatic AI price lookup for guest");
  assert.equal(await page.locator("#app-view [data-shop-add]:visible").count(), 0, "add hidden");

  // Chore toggle is blocked and nothing is written.
  await page.tap("#main-nav [data-view=chores]");
  await page.waitForTimeout(300);
  const toggle = page.locator("[data-toggle]").first();
  if (await toggle.count()) await toggle.click({ force: true });
  await page.waitForTimeout(500);
  const db = getFirestore();
  assert.equal((await db.doc("families/lee/state/chores").get()).data().items[0].done, false, "guest cannot toggle chores");

  // Direct write attempts are rejected by the rules and AI entry points refuse.
  const direct = await page.evaluate(async () => {
    window.familyCloud.state.chores.push({ id: 99, title: "hack" });
    await window.familyCloud.saveState();
    const ai = await window.familyRecognizer.recognize(["data:image/jpeg;base64,AA"]).then(() => "ran", e => e.message);
    return { ai };
  });
  assert.match(direct.ai, /게스트/);
  await page.waitForTimeout(500);
  assert.equal((await db.doc("families/lee/state/chores").get()).data().items.length, 1, "saveState no-op for guest");

  // Guest can sign out.
  await page.tap(".logout-btn");
  await page.waitForSelector("#login-form", { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log("guest e2e OK");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
