// Chores visibility E2E (emulators + Vite): the dashboard card shows only the member's own chores; the chores tab shows everyone's.
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
  for (const [u, p] of [["admin", "admin!"], ["ddoing", "ddoing1"], ["sora", "sora12"], ["guest", "guest-lee-view"]]) {
    await auth.deleteUser((await auth.getUserByEmail(`${u}@${D}`).catch(() => null))?.uid || "x").catch(() => {});
    await auth.createUser({ email: `${u}@${D}`, password: p });
  }
  await db.doc("families/lee").set({ familyName: "이씨네", logo: "LF", logoPhoto: "", themeColor: "#b46b7d", memberEmails: [`admin@${D}`, `ddoing@${D}`, `sora@${D}`], adminEmails: [`admin@${D}`], guestEmails: [`guest@${D}`] });
  await db.doc("families/lee/members/admin").set({ username: "admin", email: `admin@${D}`, name: "관리자", role: "admin", active: true, order: 0, color: "#53626d" });
  await db.doc("families/lee/members/ddoing").set({ username: "ddoing", email: `ddoing@${D}`, name: "또잉이", role: "user", active: true, order: 1, color: "#9a7899" });
  await db.doc("families/lee/members/sora").set({ username: "sora", email: `sora@${D}`, name: "또랑이", role: "user", active: true, order: 2, color: "#7595ad" });
  const chores = [
    { id: 1, title: "설거지-또잉", owner: "또잉이", ownerId: "ddoing", done: false, due: "오늘", repeat: "없음" },
    { id: 2, title: "빨래-또랑", owner: "또랑이", ownerId: "sora", done: false, due: "오늘", repeat: "없음" },
    { id: 3, title: "청소-또잉(이름만)", owner: "또잉이", done: false, due: "오늘", repeat: "없음" }
  ];
  for (const n of ["ingredients", "events", "notices", "shopping", "purchases", "budget"]) await db.doc(`families/lee/state/${n}`).set({ items: [] });
  await db.doc("families/lee/state/chores").set({ items: chores });
}

async function login(browser, id, pw, guest = false) {
  const page = await (await browser.newContext({ ...devices["iPhone 14"], defaultBrowserType: undefined })).newPage();
  await page.goto(URL);
  if (guest) await page.tap("[data-guest-login]");
  else {
    await page.fill("#login-form [name=username]", id);
    await page.fill("#login-form [name=password]", pw);
    await page.click("#login-form button.primary");
  }
  await page.waitForSelector("body:not(.auth-pending) #app-view .card", { timeout: 20000 });
  return page;
}

async function titles(page) {
  const dashboard = await page.$$eval("#app-view .todo b", n => n.map(x => x.textContent));
  await page.tap("#main-nav [data-view=chores]");
  await page.waitForSelector(".chore-groups");
  const groups = await page.$$eval(".chore-member h3", n => n.map(x => x.textContent));
  const rows = await page.$$eval(".chore-groups .row-main b", n => n.map(x => x.textContent));
  return { dashboard, groups, rows };
}

(async () => {
  await seed();
  const browser = await chromium.launch({ channel: "msedge" });
  const ddoing = await titles(await login(browser, "ddoing", "ddoing1"));
  console.log("ddoing", JSON.stringify(ddoing));
  assert.deepEqual(ddoing.dashboard.sort(), ["설거지-또잉", "청소-또잉(이름만)"]);
  assert.deepEqual(ddoing.groups, ["또잉이", "또랑이"]);
  assert.equal(ddoing.rows.length, 3);
  const sora = await titles(await login(browser, "sora", "sora12"));
  console.log("sora", JSON.stringify(sora));
  assert.deepEqual(sora.dashboard, ["빨래-또랑"]);
  assert.deepEqual(sora.groups, ["또잉이", "또랑이"]);
  assert.equal(sora.rows.length, 3);
  const admin = await titles(await login(browser, "admin", "admin!"));
  console.log("admin", JSON.stringify(admin));
  assert.equal(admin.dashboard.length, 3);
  assert.deepEqual(admin.groups, ["또잉이", "또랑이"]);
  const guest = await titles(await login(browser, "", "", true));
  console.log("guest", JSON.stringify(guest));
  assert.equal(guest.dashboard.length, 3);
  console.log("chores e2e OK");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
