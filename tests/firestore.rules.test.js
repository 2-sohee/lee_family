import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const domain = "lee-family.example.com";
const email = name => `${name}@${domain}`;
let env;

const as = name => env.authenticatedContext(name, { email: email(name) }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-lee-family",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
});

after(() => env.cleanup());

async function seed() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "families/lee"), {
      familyName: "LEE",
      memberEmails: [email("admin"), email("mom")],
      adminEmails: [email("admin")]
    });
    await setDoc(doc(db, "families/lee/members/admin"), { username: "admin", email: email("admin"), name: "관리자", role: "admin" });
    await setDoc(doc(db, "families/lee/members/mom"), { username: "mom", email: email("mom"), name: "엄마", role: "user" });
  });
}

beforeEach(() => env.clearFirestore());

test("family workspace cannot be created or re-created from the client", async () => {
  await assertFails(setDoc(doc(as("admin"), "families/new"), { memberEmails: [email("admin")], adminEmails: [email("admin")] }));
  await assertFails(getDoc(doc(as("admin"), "families/new")));
  await seed();
  await assertFails(setDoc(doc(as("stranger"), "families/lee"), { memberEmails: [email("stranger")], adminEmails: [email("stranger")] }));
});
test("non-members and anonymous users cannot read family data", async () => {
  await seed();
  await assertFails(getDoc(doc(as("stranger"), "families/lee")));
  await assertFails(getDoc(doc(as("stranger"), "families/lee/state/chores")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "families/lee")));
});

test("members can read and write shared state", async () => {
  await seed();
  const db = as("mom");
  await assertSucceeds(setDoc(doc(db, "families/lee/state/chores"), { items: [{ id: 1, title: "청소" }] }));
  await assertSucceeds(getDoc(doc(db, "families/lee/state/chores")));
  for (const name of ["shopping", "purchases", "budget"]) {
    await assertSucceeds(setDoc(doc(db, `families/lee/state/${name}`), { items: [{ id: "1" }] }));
  }
  await assertFails(setDoc(doc(db, "families/lee/state/secret"), { items: [] }));
  await assertSucceeds(setDoc(doc(db, "families/lee/fridgePhotos/p1"), { dataUrl: "data:image/jpeg;base64,AA" }));
  await assertSucceeds(deleteDoc(doc(db, "families/lee/fridgePhotos/p1")));
});

test("members can edit only safe fields of their own profile", async () => {
  await seed();
  const db = as("mom");
  await assertSucceeds(updateDoc(doc(db, "families/lee/members/mom"), { name: "엄마2", color: "#123456" }));
  await assertFails(updateDoc(doc(db, "families/lee/members/mom"), { role: "admin" }));
  await assertFails(updateDoc(doc(db, "families/lee/members/admin"), { name: "해킹" }));
  await assertFails(updateDoc(doc(db, "families/lee"), { adminEmails: [email("mom"), email("admin")] }));
});

test("admin manages members but the admin list is fixed", async () => {
  await seed();
  const db = as("admin");
  await assertSucceeds(setDoc(doc(db, "families/lee/members/dad"), { username: "dad", email: email("dad"), role: "user" }));
  await assertFails(setDoc(doc(db, "families/lee/members/uncle"), { username: "uncle", email: email("uncle"), role: "admin" }));
  await assertFails(updateDoc(doc(db, "families/lee/members/mom"), { role: "admin" }));
  await assertSucceeds(updateDoc(doc(db, "families/lee"), { memberEmails: [email("admin"), email("mom"), email("dad")] }));
  await assertFails(updateDoc(doc(db, "families/lee"), { adminEmails: [email("admin"), email("mom")] }));
  await assertFails(updateDoc(doc(db, "families/lee"), { adminEmails: [email("mom")] }));
  await assertFails(updateDoc(doc(db, "families/lee"), { memberEmails: [email("mom")] }));
  await assertFails(deleteDoc(doc(db, "families/lee/members/admin")));
  await assertSucceeds(deleteDoc(doc(db, "families/lee/members/dad")));
});