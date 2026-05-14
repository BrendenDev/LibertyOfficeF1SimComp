/* ============================================================
   data.js — Data layer for F1 Sim Competition
   ============================================================
   Handles all reads/writes with the backend Node/SQL API.
   ============================================================ */

let RACES = [];

async function fetchTeams() {
    try {
        const response = await fetch(`${API_BASE_URL}/teams`);
        if (!response.ok) throw new Error("Network response was not ok");
        return await response.json();
    } catch (err) {
        console.error("[data] Error fetching teams:", err);
        return [];
    }
}

async function fetchRaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/races`);
        if (!response.ok) throw new Error("Network response was not ok");
        RACES = await response.json();
        return RACES;
    } catch (err) {
        console.error("[data] Error fetching races:", err);
        return [];
    }
}

async function fetchAllSubmissions() {
    try {
        const response = await fetch(`${API_BASE_URL}/submissions`);
        if (!response.ok) throw new Error("Network response was not ok");
        return await response.json();
    } catch (err) {
        console.error("[data] Error fetching submissions:", err);
        return [];
    }
}

async function submitTime(raceId, driverName, teamName, timeMs, timeFormatted, base64Proof) {
    try {
        const response = await fetch(`${API_BASE_URL}/submissions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                raceId,
                driverName,
                teamName,
                timeMs,
                timeFormatted,
                base64Proof
            })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            return { success: false, error: data.error || "Failed to submit. Please try again." };
        }
        return { success: true };
    } catch (err) {
        console.error("[data] Error submitting time:", err);
        return { success: false, error: "Failed to submit. Please try again." };
    }
}
