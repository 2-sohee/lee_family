import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc
} from "firebase/firestore";
import { requireFirebase } from "./firebase.js";

export const familyCollections = Object.freeze({
  members: "familyMembers",
  ingredients: "ingredients",
  schedules: "schedules",
  chores: "chores",
  notices: "notices"
});

function collectionRef(name) {
  const { db } = requireFirebase();
  return collection(db, name);
}

export async function listFamilyRecords(type) {
  const name = familyCollections[type];
  if (!name) throw new Error(`Unknown family collection: ${type}`);

  const snapshot = await getDocs(
    query(collectionRef(name), orderBy("createdAt", "desc"))
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createFamilyRecord(type, data) {
  const name = familyCollections[type];
  if (!name) throw new Error(`Unknown family collection: ${type}`);

  const reference = await addDoc(collectionRef(name), {
    ...data,
    createdAt: new Date()
  });
  return { id: reference.id, ...data };
}

export async function updateFamilyRecord(type, id, data) {
  const name = familyCollections[type];
  if (!name) throw new Error(`Unknown family collection: ${type}`);

  const { db } = requireFirebase();
  await updateDoc(doc(db, name, id), data);
}

export async function deleteFamilyRecord(type, id) {
  const name = familyCollections[type];
  if (!name) throw new Error(`Unknown family collection: ${type}`);

  const { db } = requireFirebase();
  await deleteDoc(doc(db, name, id));
}
