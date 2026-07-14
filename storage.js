import { db, ensureSignedIn } from "./firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const CAPTIONS_COLLECTION = "captions";

export const Storage = {
  async subscribe(onChange, onError) {
    await ensureSignedIn();
    return onSnapshot(
      collection(db, CAPTIONS_COLLECTION),
      (snapshot) => {
        const captions = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((first, second) => (first.createdAt || 0) - (second.createdAt || 0));
        onChange(captions);
      },
      onError
    );
  },

  async saveCaption(account, caption) {
    const now = Date.now();
    return addDoc(collection(db, CAPTIONS_COLLECTION), {
      account,
      caption,
      status: "unused",
      createdAt: now,
      updatedAt: now,
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp()
    });
  },

  async deleteCaption(id) {
    return deleteDoc(doc(db, CAPTIONS_COLLECTION, id));
  },

  async updateStatus(id, status) {
    return updateDoc(doc(db, CAPTIONS_COLLECTION, id), {
      status,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp()
    });
  }
};
