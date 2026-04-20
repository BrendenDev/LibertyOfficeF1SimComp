/* ============================================================
   data.js — Data layer for F1 Sim Competition
   ============================================================
   Handles all Firestore reads/writes with:
   - Version-based caching for teams and races
   - Dummy data fallback when USE_DUMMY_DATA is true
   ============================================================ */

/* ---------- DUMMY DATA ---------- */

const DUMMY_RACES = [
    { id: "bahrain", name: "Bahrain Grand Prix", circuit: "Bahrain International Circuit", startDate: "2026-03-09", endDate: "2026-03-20", order: 1 },
    { id: "monaco", name: "Monaco Grand Prix", circuit: "Circuit de Monaco", startDate: "2026-05-18", endDate: "2026-05-29", order: 2 },
    { id: "silverstone", name: "British Grand Prix", circuit: "Silverstone Circuit", startDate: "2026-06-29", endDate: "2026-07-10", order: 3 },
    { id: "spa", name: "Belgian Grand Prix", circuit: "Circuit de Spa-Francorchamps", startDate: "2026-07-20", endDate: "2026-07-31", order: 4 },
    { id: "monza", name: "Italian Grand Prix", circuit: "Autodromo Nazionale Monza", startDate: "2026-08-31", endDate: "2026-09-11", order: 5 },
    { id: "singapore", name: "Singapore Grand Prix", circuit: "Marina Bay Street Circuit", startDate: "2026-09-28", endDate: "2026-10-09", order: 6 },
    { id: "abu_dhabi", name: "Abu Dhabi Grand Prix", circuit: "Yas Marina Circuit", startDate: "2026-11-30", endDate: "2026-12-11", order: 7 },
];

// Global mutable — populated by fetchRaces(), used everywhere
let RACES = [];

/* ---------- DUMMY DATA ---------- */

const DUMMY_TEAMS = [
    { id: "turbo_torque",    name: "Turbo Torque",      color: "#E8002D", drivers: ["Alex M", "Jordan K"] },
    { id: "apex_predators",  name: "Apex Predators",    color: "#FF8000", drivers: ["Sam L", "Taylor B"] },
    { id: "grid_legends",    name: "Grid Legends",      color: "#3671C6", drivers: ["Casey R", "Morgan W"] },
    { id: "slipstream",      name: "Slipstream",        color: "#27F4D2", drivers: ["Riley D", "Jamie P"] },
    { id: "pit_vipers",      name: "Pit Vipers",        color: "#9B59B6", drivers: ["Chris H", "Drew F"] },
    { id: "full_send",       name: "Full Send Racing",  color: "#229971", drivers: ["Quinn N", "Avery S"] },
    { id: "chicane_kings",   name: "Chicane Kings",     color: "#D4A017", drivers: ["Blake T", "Reese G"] },
];

const DUMMY_SUBMISSIONS = [
    // ── Race 1: Bahrain ──
    { driverName: "Alex M",    teamName: "Turbo Torque",     raceId: "bahrain", timeMs: 90245, timeFormatted: "1:30.245" },
    { driverName: "Sam L",     teamName: "Apex Predators",   raceId: "bahrain", timeMs: 90891, timeFormatted: "1:30.891" },
    { driverName: "Casey R",   teamName: "Grid Legends",     raceId: "bahrain", timeMs: 91102, timeFormatted: "1:31.102" },
    { driverName: "Riley D",   teamName: "Slipstream",       raceId: "bahrain", timeMs: 91567, timeFormatted: "1:31.567" },
    { driverName: "Chris H",   teamName: "Pit Vipers",       raceId: "bahrain", timeMs: 91923, timeFormatted: "1:31.923" },
    { driverName: "Quinn N",   teamName: "Full Send Racing", raceId: "bahrain", timeMs: 92145, timeFormatted: "1:32.145" },
    { driverName: "Blake T",   teamName: "Chicane Kings",    raceId: "bahrain", timeMs: 92678, timeFormatted: "1:32.678" },
    { driverName: "Jordan K",  teamName: "Turbo Torque",     raceId: "bahrain", timeMs: 92901, timeFormatted: "1:32.901" },
    { driverName: "Taylor B",  teamName: "Apex Predators",   raceId: "bahrain", timeMs: 93234, timeFormatted: "1:33.234" },
    { driverName: "Morgan W",  teamName: "Grid Legends",     raceId: "bahrain", timeMs: 93567, timeFormatted: "1:33.567" },
    { driverName: "Jamie P",   teamName: "Slipstream",       raceId: "bahrain", timeMs: 94012, timeFormatted: "1:34.012" },
    { driverName: "Drew F",    teamName: "Pit Vipers",       raceId: "bahrain", timeMs: 94456, timeFormatted: "1:34.456" },
    { driverName: "Avery S",   teamName: "Full Send Racing", raceId: "bahrain", timeMs: 94890, timeFormatted: "1:34.890" },
    { driverName: "Reese G",   teamName: "Chicane Kings",    raceId: "bahrain", timeMs: 95321, timeFormatted: "1:35.321" },

    // ── Race 2: Monaco ──
    { driverName: "Sam L",     teamName: "Apex Predators",   raceId: "monaco", timeMs: 72345, timeFormatted: "1:12.345" },
    { driverName: "Riley D",   teamName: "Slipstream",       raceId: "monaco", timeMs: 72789, timeFormatted: "1:12.789" },
    { driverName: "Alex M",    teamName: "Turbo Torque",     raceId: "monaco", timeMs: 73012, timeFormatted: "1:13.012" },
    { driverName: "Casey R",   teamName: "Grid Legends",     raceId: "monaco", timeMs: 73456, timeFormatted: "1:13.456" },
    { driverName: "Blake T",   teamName: "Chicane Kings",    raceId: "monaco", timeMs: 73890, timeFormatted: "1:13.890" },
    { driverName: "Chris H",   teamName: "Pit Vipers",       raceId: "monaco", timeMs: 74123, timeFormatted: "1:14.123" },
    { driverName: "Quinn N",   teamName: "Full Send Racing", raceId: "monaco", timeMs: 74567, timeFormatted: "1:14.567" },
    { driverName: "Drew F",    teamName: "Pit Vipers",       raceId: "monaco", timeMs: 74901, timeFormatted: "1:14.901" },
    { driverName: "Morgan W",  teamName: "Grid Legends",     raceId: "monaco", timeMs: 75234, timeFormatted: "1:15.234" },
    { driverName: "Jordan K",  teamName: "Turbo Torque",     raceId: "monaco", timeMs: 75678, timeFormatted: "1:15.678" },
    { driverName: "Taylor B",  teamName: "Apex Predators",   raceId: "monaco", timeMs: 76012, timeFormatted: "1:16.012" },
    { driverName: "Jamie P",   teamName: "Slipstream",       raceId: "monaco", timeMs: 76456, timeFormatted: "1:16.456" },
    { driverName: "Avery S",   teamName: "Full Send Racing", raceId: "monaco", timeMs: 76890, timeFormatted: "1:16.890" },
    { driverName: "Reese G",   teamName: "Chicane Kings",    raceId: "monaco", timeMs: 77321, timeFormatted: "1:17.321" },

    // ── Race 3: Silverstone ──
    { driverName: "Casey R",   teamName: "Grid Legends",     raceId: "silverstone", timeMs: 88123, timeFormatted: "1:28.123" },
    { driverName: "Alex M",    teamName: "Turbo Torque",     raceId: "silverstone", timeMs: 88567, timeFormatted: "1:28.567" },
    { driverName: "Sam L",     teamName: "Apex Predators",   raceId: "silverstone", timeMs: 88890, timeFormatted: "1:28.890" },
    { driverName: "Quinn N",   teamName: "Full Send Racing", raceId: "silverstone", timeMs: 89234, timeFormatted: "1:29.234" },
    { driverName: "Chris H",   teamName: "Pit Vipers",       raceId: "silverstone", timeMs: 89567, timeFormatted: "1:29.567" },
    { driverName: "Riley D",   teamName: "Slipstream",       raceId: "silverstone", timeMs: 89901, timeFormatted: "1:29.901" },
    { driverName: "Jordan K",  teamName: "Turbo Torque",     raceId: "silverstone", timeMs: 90234, timeFormatted: "1:30.234" },
    { driverName: "Blake T",   teamName: "Chicane Kings",    raceId: "silverstone", timeMs: 90567, timeFormatted: "1:30.567" },
    { driverName: "Taylor B",  teamName: "Apex Predators",   raceId: "silverstone", timeMs: 90901, timeFormatted: "1:30.901" },
    { driverName: "Morgan W",  teamName: "Grid Legends",     raceId: "silverstone", timeMs: 91234, timeFormatted: "1:31.234" },
    { driverName: "Drew F",    teamName: "Pit Vipers",       raceId: "silverstone", timeMs: 91567, timeFormatted: "1:31.567" },
    { driverName: "Jamie P",   teamName: "Slipstream",       raceId: "silverstone", timeMs: 91901, timeFormatted: "1:31.901" },
    { driverName: "Avery S",   teamName: "Full Send Racing", raceId: "silverstone", timeMs: 92234, timeFormatted: "1:32.234" },
    { driverName: "Reese G",   teamName: "Chicane Kings",    raceId: "silverstone", timeMs: 92567, timeFormatted: "1:32.567" },
];


/* ---------- TEAM FETCHING (with version cache) ---------- */

/**
 * Fetch teams from Firestore with version-based caching.
 * 
 * Firestore `teams` collection structure:
 *   teams/_meta   → { version: <number> }
 *   teams/<id>    → { name, color, drivers: [string, string] }
 * 
 * On load: read _meta (1 read). If version === cached version,
 * return from localStorage. Otherwise fetch all teams and re-cache.
 */
async function fetchTeams() {
    if (USE_DUMMY_DATA) return [...DUMMY_TEAMS];

    try {
        const metaSnap = await db.collection(COLLECTION.TEAMS).doc("_meta").get();

        if (!metaSnap.exists) {
            console.warn("[data] No teams/_meta doc found in Firestore.");
            return getCachedTeams();
        }

        const serverVersion = metaSnap.data().version;
        const cachedVersion = localStorage.getItem(CACHE_KEYS.TEAMS_VERSION);
        const cachedData = localStorage.getItem(CACHE_KEYS.TEAMS_DATA);

        // Cache hit — versions match
        if (cachedVersion === String(serverVersion) && cachedData) {
            console.log("[data] Teams cache hit (v" + serverVersion + ")");
            return JSON.parse(cachedData);
        }

        // Cache miss — fetch all team documents
        console.log("[data] Teams cache miss, fetching from Firestore...");
        const snapshot = await db.collection(COLLECTION.TEAMS).get();
        const teams = [];
        snapshot.forEach(doc => {
            if (doc.id !== "_meta") {
                teams.push({ id: doc.id, ...doc.data() });
            }
        });

        // Update cache
        localStorage.setItem(CACHE_KEYS.TEAMS_DATA, JSON.stringify(teams));
        localStorage.setItem(CACHE_KEYS.TEAMS_VERSION, String(serverVersion));

        return teams;
    } catch (err) {
        console.error("[data] Error fetching teams:", err);
        return getCachedTeams();
    }
}

/** Fallback: return cached teams from localStorage or empty array */
function getCachedTeams() {
    const cached = localStorage.getItem(CACHE_KEYS.TEAMS_DATA);
    return cached ? JSON.parse(cached) : [];
}


/* ---------- RACE FETCHING (with version cache) ---------- */

/**
 * Fetch races from Firestore with version-based caching.
 * Same pattern as fetchTeams. Updates the global RACES variable.
 *
 * Firestore `races` collection structure:
 *   races/_meta   → { version: <number> }
 *   races/<id>    → { name, circuit, date, order }
 */
async function fetchRaces() {
    if (USE_DUMMY_DATA) {
        RACES = [...DUMMY_RACES];
        return RACES;
    }

    try {
        const metaSnap = await db.collection(COLLECTION.RACES).doc("_meta").get();

        if (!metaSnap.exists) {
            console.warn("[data] No races/_meta doc found in Firestore.");
            return getCachedRaces();
        }

        const serverVersion = metaSnap.data().version;
        const cachedVersion = localStorage.getItem(CACHE_KEYS.RACES_VERSION);
        const cachedData = localStorage.getItem(CACHE_KEYS.RACES_DATA);

        // Cache hit
        if (cachedVersion === String(serverVersion) && cachedData) {
            console.log("[data] Races cache hit (v" + serverVersion + ")");
            RACES = JSON.parse(cachedData);
            return RACES;
        }

        // Cache miss
        console.log("[data] Races cache miss, fetching from Firestore...");
        const snapshot = await db.collection(COLLECTION.RACES).get();
        const races = [];
        snapshot.forEach(doc => {
            if (doc.id !== "_meta") {
                races.push({ id: doc.id, ...doc.data() });
            }
        });

        // Sort by order field
        races.sort((a, b) => (a.order || 0) - (b.order || 0));

        localStorage.setItem(CACHE_KEYS.RACES_DATA, JSON.stringify(races));
        localStorage.setItem(CACHE_KEYS.RACES_VERSION, String(serverVersion));

        RACES = races;
        return RACES;
    } catch (err) {
        console.error("[data] Error fetching races:", err);
        return getCachedRaces();
    }
}

/** Fallback: return cached races or empty array */
function getCachedRaces() {
    const cached = localStorage.getItem(CACHE_KEYS.RACES_DATA);
    if (cached) {
        RACES = JSON.parse(cached);
        return RACES;
    }
    return [];
}


/**
 * Fetch all submissions from Firestore.
 * With ~98 docs max, this is a single cheap query.
 */
async function fetchAllSubmissions() {
    if (USE_DUMMY_DATA) return [...DUMMY_SUBMISSIONS];

    try {
        const snapshot = await db.collection(COLLECTION.SUBMISSIONS).get();
        const submissions = [];
        snapshot.forEach(doc => {
            submissions.push({ id: doc.id, ...doc.data() });
        });
        return submissions;
    } catch (err) {
        console.error("[data] Error fetching submissions:", err);
        return [];
    }
}

/**
 * Submit a lap time to Firestore.
 * Uses a deterministic doc ID to prevent duplicate submissions.
 * 
 * @returns {{ success: boolean, error?: string }}
 */
async function submitTime(raceId, driverName, teamName, timeMs, timeFormatted) {
    const docId = `${raceId}_${driverName.toLowerCase().replace(/\s+/g, "_")}`;

    if (USE_DUMMY_DATA) {
        const existing = DUMMY_SUBMISSIONS.find(
            s => s.raceId === raceId && s.driverName === driverName
        );
        if (existing) {
            if (timeMs >= existing.timeMs) {
                return { success: false, error: `Your existing time (${existing.timeFormatted}) is already faster!` };
            }
            existing.timeMs = timeMs;
            existing.timeFormatted = timeFormatted;
            existing.submittedAt = new Date().toISOString();
            return { success: true, improved: true };
        }
        DUMMY_SUBMISSIONS.push({
            driverName, teamName, raceId, timeMs, timeFormatted,
            submittedAt: new Date().toISOString(),
        });
        return { success: true };
    }

    try {
        const docRef = db.collection(COLLECTION.SUBMISSIONS).doc(docId);
        const existing = await docRef.get();

        if (existing.exists) {
            const oldTime = existing.data().timeMs;
            if (timeMs >= oldTime) {
                return { success: false, error: `Your existing time (${existing.data().timeFormatted}) is already faster!` };
            }
        }

        await docRef.set({
            driverName, teamName, raceId, timeMs, timeFormatted,
            submittedAt: new Date().toISOString(),
        });

        return { success: true, improved: existing.exists };
    } catch (err) {
        console.error("[data] Error submitting time:", err);
        return { success: false, error: "Failed to submit. Please try again." };
    }
}
