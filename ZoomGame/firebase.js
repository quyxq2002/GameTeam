// Firebase initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Values injected by GitHub Actions at deploy time (see .github/workflows/deploy.yml)
const firebaseConfig = {
  apiKey:            "AIzaSyBcPP1TIzSeVi7LlpT6XBQ3sasN-_NxmyQ",
  authDomain:        "zoomgame-2002.firebaseapp.com",
  projectId:         "zoomgame-2002",
  storageBucket:     "zoomgame-2002.firebasestorage.app",
  messagingSenderId: "101015929819",
  appId:             "1:101015929819:web:9977cfd6daf5a0809bddfe",
  measurementId:     "G-HYBN8MD5MS"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField, arrayUnion };
