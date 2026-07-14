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

  async saveCaption(account, caption, { status = "unused", sortOrder = -Date.now() } = {}) {
    const now = Date.now();
    return addDoc(collection(db, CAPTIONS_COLLECTION), {
      account,
      caption,
      status,
      sortOrder,
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
    return this.updateCaption(id, { status });
  },

  async updateCaption(id, patch) {
    return updateDoc(doc(db, CAPTIONS_COLLECTION, id), {
      ...patch,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp()
    });
  },

  async deleteCaptions(ids) {
    return Promise.all(ids.map((id) => this.deleteCaption(id)));
  }
};
