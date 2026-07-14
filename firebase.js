import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDIGv0RBTGfi16ZazJ9FMT1LTYbh4VJBZg",
  authDomain: "instagram-generator-captions.firebaseapp.com",
  projectId: "instagram-generator-captions",
  storageBucket: "instagram-generator-captions.firebasestorage.app",
  messagingSenderId: "337813586049",
  appId: "1:337813586049:web:c05451dd620ba6ee104d80"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
