/* ============================================================
   config.js — Static configuration for F1 Sim Competition
   ============================================================
   Points are hardcoded. Races & teams are fetched from
   Firestore with version-based caching (see data.js).
   ============================================================ */

// Points awarded to the top 10 finishers (index 0 = P1, index 9 = P10)
const POINTS_MAP = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// Firestore collection names
const COLLECTION = {
    TEAMS: "teams",
    RACES: "races",
    SUBMISSIONS: "submissions",
};

// Cache keys for localStorage
const CACHE_KEYS = {
    TEAMS_DATA: "f1sim_teams_data",
    TEAMS_VERSION: "f1sim_teams_version",
    RACES_DATA: "f1sim_races_data",
    RACES_VERSION: "f1sim_races_version",
};

// Auto-refresh interval for TV mode (ms)
const TV_ROTATE_INTERVAL = 15000;   // 15 seconds between views
const DATA_REFRESH_INTERVAL = 300000; // 5 minutes

const firebaseConfig = {
    apiKey: "AIzaSyBBW-V5wONoDBNaB0lAU0vFMeKeqpRvx78",
    authDomain: "libertyf1simcomp.firebaseapp.com",
    projectId: "libertyf1simcomp",
    storageBucket: "libertyf1simcomp.firebasestorage.app",
    messagingSenderId: "1057700592606",
    appId: "1:1057700592606:web:db07db1f299a2ef4697b4f"
};
