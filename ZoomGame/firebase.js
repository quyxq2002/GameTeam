// Firebase initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Values injected by GitHub Actions at deploy time (see .github/workflows/deploy.yml)
const firebaseConfig = {
  apiKey:            "__FIREBASE_API_KEY__",
  authDomain:        "__FIREBASE_AUTH_DOMAIN__",
  projectId:         "__FIREBASE_PROJECT_ID__",
  storageBucket:     "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId:             "__FIREBASE_APP_ID__",
  measurementId:     "__FIREBASE_MEASUREMENT_ID__"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField, arrayUnion };
