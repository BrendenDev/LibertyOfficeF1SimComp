/* ============================================================
   firebase-init.js — Firebase SDK Initialization
   ============================================================
   Firebase config is defined in config.js (loaded before this).
   Set USE_DUMMY_DATA = true to bypass Firestore entirely and
   use the dummy data in data.js (for local development).
   ============================================================ */

const USE_DUMMY_DATA = false; // Using live Firestore

let db = null;

if (!USE_DUMMY_DATA) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
}
