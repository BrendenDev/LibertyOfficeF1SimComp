/* ============================================================
   admin.js — Admin panel for F1 Sim Competition
   ============================================================
   Manages teams/drivers, races, and submissions directly in
   Firestore. Access via admin.html (hidden, not linked).
   ============================================================ */

/* ---------- STATE ---------- */

const admin = {
    teams: [],
    races: [],
    submissions: [],
    teamsModified: false,
    racesModified: false,
    addingSubmission: false,
    editingSubmissionId: null,
};


/* ---------- TIME UTILS ---------- */

function parseTimeAdmin(str) {
    const match = str.trim().match(/^(?:(\d+):)?(\d{1,2})\.(\d{1,3})$/);
    if (!match) return null;
    const mins = match[1] ? parseInt(match[1], 10) : 0;
    const secs = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, "0"), 10);
    if (secs >= 60 || ms >= 1000) return null;
    return mins * 60000 + secs * 1000 + ms;
}

function formatTimeAdmin(ms) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    if (mins > 0) {
        return `${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
    }
    return `${secs}.${millis.toString().padStart(3, "0")}`;
}


/* ---------- TOAST ---------- */

function showAdminToast(message, type = "info") {
    const toast = document.getElementById("admin-toast");
    toast.textContent = message;
    toast.className = `toast-${type} toast-visible`;
    setTimeout(() => toast.classList.remove("toast-visible"), 4000);
}


/* ---------- PUBLISH BAR ---------- */

function updatePublishBar() {
    const bar = document.getElementById("publish-bar");
    const teamsBtn = document.getElementById("publish-teams-btn");
    const racesBtn = document.getElementById("publish-races-btn");

    teamsBtn.style.display = admin.teamsModified ? "" : "none";
    racesBtn.style.display = admin.racesModified ? "" : "none";
    bar.classList.toggle("visible", admin.teamsModified || admin.racesModified);
}


/* ---------- TEAMS EDITOR ---------- */

function renderTeamsEditor() {
    const tbody = document.getElementById("teams-editor");

    if (admin.teams.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No teams yet. Click "+ Add Team" to get started.</td></tr>`;
        return;
    }

    tbody.innerHTML = admin.teams.map((team, idx) => `
        <tr data-idx="${idx}">
            <td><input type="text" value="${escHtml(team.name)}" data-field="name" class="admin-input" placeholder="Team name"></td>
            <td><input type="color" value="${team.color}" data-field="color" class="admin-color" title="Pick team color"></td>
            <td><input type="text" value="${escHtml(team.drivers[0] || "")}" data-field="driver0" class="admin-input" placeholder="Driver 1"></td>
            <td><input type="text" value="${escHtml(team.drivers[1] || "")}" data-field="driver1" class="admin-input" placeholder="Driver 2"></td>
            <td><button class="btn btn-small btn-danger" onclick="removeTeam(${idx})" title="Delete team">✕</button></td>
        </tr>
    `).join("");

    tbody.querySelectorAll("input").forEach(input => {
        input.addEventListener("input", () => {
            admin.teamsModified = true;
            updatePublishBar();
        });
    });
}

function addTeam() {
    admin.teams.push({
        id: "team_" + Date.now(),
        name: "",
        color: "#E10600",
        drivers: ["", ""],
    });
    admin.teamsModified = true;
    renderTeamsEditor();
    updatePublishBar();

    setTimeout(() => {
        const rows = document.querySelectorAll("#teams-editor tr");
        const lastRow = rows[rows.length - 1];
        if (lastRow) lastRow.querySelector("input").focus();
    }, 50);
}

function removeTeam(idx) {
    const name = admin.teams[idx].name || "Unnamed team";
    if (!confirm(`Delete "${name}"?`)) return;
    admin.teams.splice(idx, 1);
    admin.teamsModified = true;
    renderTeamsEditor();
    updatePublishBar();
}

function collectTeamData() {
    const rows = document.querySelectorAll("#teams-editor tr");
    return Array.from(rows).map((row, idx) => {
        const inputs = row.querySelectorAll("input");
        if (inputs.length < 4) return null;
        return {
            id: admin.teams[idx]?.id || "team_" + Date.now() + "_" + idx,
            name: inputs[0].value.trim(),
            color: inputs[1].value,
            drivers: [inputs[2].value.trim(), inputs[3].value.trim()].filter(Boolean),
        };
    }).filter(Boolean);
}

async function publishTeams() {
    const teams = collectTeamData();

    for (const team of teams) {
        if (!team.name) {
            showAdminToast("All teams must have a name.", "error");
            return;
        }
        if (team.drivers.length === 0) {
            showAdminToast(`Team "${team.name}" needs at least one driver.`, "error");
            return;
        }
    }

    const btn = document.getElementById("publish-teams-btn");
    btn.disabled = true;
    btn.textContent = "Publishing...";

    try {
        const batch = db.batch();

        const existing = await db.collection(COLLECTION.TEAMS).get();
        existing.forEach(doc => {
            if (doc.id !== "_meta") batch.delete(doc.ref);
        });

        for (const team of teams) {
            const docId = team.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
            const ref = db.collection(COLLECTION.TEAMS).doc(docId);
            batch.set(ref, { name: team.name, color: team.color, drivers: team.drivers });
            team.id = docId;
        }

        const metaRef = db.collection(COLLECTION.TEAMS).doc("_meta");
        const metaSnap = await metaRef.get();
        const newVersion = (metaSnap.exists ? (metaSnap.data().version || 0) : 0) + 1;
        batch.set(metaRef, { version: newVersion });

        await batch.commit();

        admin.teams = teams;
        admin.teamsModified = false;
        updatePublishBar();
        renderTeamsEditor();

        showAdminToast(`Teams published! (v${newVersion})`, "success");
    } catch (err) {
        console.error("[admin] Publish teams error:", err);
        showAdminToast("Publish failed: " + err.message, "error");
    }

    btn.disabled = false;
    btn.textContent = "Publish Teams";
}


/* ---------- RACES EDITOR ---------- */

function renderRacesEditor() {
    const tbody = document.getElementById("races-editor");

    if (admin.races.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No races yet. Click "+ Add Race" to get started.</td></tr>`;
        return;
    }

    tbody.innerHTML = admin.races.map((race, idx) => `
        <tr data-idx="${idx}">
            <td><input type="number" value="${race.order || idx + 1}" data-field="order" class="admin-input" style="width:50px" min="1"></td>
            <td><input type="text" value="${escHtml(race.name)}" data-field="name" class="admin-input" placeholder="Grand Prix name"></td>
            <td><input type="text" value="${escHtml(race.circuit || "")}" data-field="circuit" class="admin-input" placeholder="Circuit name"></td>
            <td><input type="date" value="${race.startDate || ""}" data-field="startDate" class="admin-input" style="width:150px"></td>
            <td><input type="date" value="${race.endDate || ""}" data-field="endDate" class="admin-input" style="width:150px"></td>
            <td class="cell-muted">${escHtml(race.id)}</td>
            <td><button class="btn btn-small btn-danger" onclick="removeRace(${idx})" title="Delete race">✕</button></td>
        </tr>
    `).join("");

    tbody.querySelectorAll("input").forEach(input => {
        input.addEventListener("input", () => {
            admin.racesModified = true;
            updatePublishBar();
        });
    });
}

function addRace() {
    const nextOrder = admin.races.length + 1;
    admin.races.push({
        id: "race_" + Date.now(),
        name: "",
        circuit: "",
        startDate: "",
        endDate: "",
        order: nextOrder,
    });
    admin.racesModified = true;
    renderRacesEditor();
    updatePublishBar();

    setTimeout(() => {
        const rows = document.querySelectorAll("#races-editor tr");
        const lastRow = rows[rows.length - 1];
        if (lastRow) lastRow.querySelectorAll("input")[1]?.focus(); // focus name field
    }, 50);
}

function removeRace(idx) {
    const name = admin.races[idx].name || "Unnamed race";
    if (!confirm(`Delete "${name}"? This won't delete existing submissions for this race.`)) return;
    admin.races.splice(idx, 1);
    admin.racesModified = true;
    renderRacesEditor();
    updatePublishBar();
}

function collectRaceData() {
    const rows = document.querySelectorAll("#races-editor tr");
    return Array.from(rows).map((row, idx) => {
        const inputs = row.querySelectorAll("input");
        if (inputs.length < 5) return null;

        const name = inputs[1].value.trim();
        const existingId = admin.races[idx]?.id;
        const generatedId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const id = (existingId && !existingId.startsWith("race_")) ? existingId : generatedId;

        return {
            id: id,
            order: parseInt(inputs[0].value, 10) || idx + 1,
            name: name,
            circuit: inputs[2].value.trim(),
            startDate: inputs[3].value,
            endDate: inputs[4].value,
        };
    }).filter(Boolean);
}

async function publishRaces() {
    const races = collectRaceData();

    for (const race of races) {
        if (!race.name) {
            showAdminToast("All races must have a name.", "error");
            return;
        }
    }

    const btn = document.getElementById("publish-races-btn");
    btn.disabled = true;
    btn.textContent = "Publishing...";

    try {
        const batch = db.batch();

        // Delete existing race docs
        const existing = await db.collection(COLLECTION.RACES).get();
        existing.forEach(doc => {
            if (doc.id !== "_meta") batch.delete(doc.ref);
        });

        // Write new race docs
        for (const race of races) {
            const ref = db.collection(COLLECTION.RACES).doc(race.id);
            batch.set(ref, {
                name: race.name,
                circuit: race.circuit,
                startDate: race.startDate,
                endDate: race.endDate,
                order: race.order,
            });
        }

        // Bump version
        const metaRef = db.collection(COLLECTION.RACES).doc("_meta");
        const metaSnap = await metaRef.get();
        const newVersion = (metaSnap.exists ? (metaSnap.data().version || 0) : 0) + 1;
        batch.set(metaRef, { version: newVersion });

        await batch.commit();

        // Sort by order
        races.sort((a, b) => a.order - b.order);

        admin.races = races;
        admin.racesModified = false;
        updatePublishBar();
        renderRacesEditor();
        populateRaceFilter(); // refresh submissions filter

        showAdminToast(`Races published! (v${newVersion})`, "success");
    } catch (err) {
        console.error("[admin] Publish races error:", err);
        showAdminToast("Publish failed: " + err.message, "error");
    }

    btn.disabled = false;
    btn.textContent = "Publish Races";
}


/* ---------- SUBMISSIONS EDITOR ---------- */

function renderSubmissions() {
    const tbody = document.getElementById("submissions-editor");
    const filter = document.getElementById("sub-race-filter").value;

    let subs = [...admin.submissions];

    if (filter !== "all") {
        subs = subs.filter(s => s.raceId === filter);
    }

    // Sort by race order, then time
    subs.sort((a, b) => {
        const raceA = admin.races.findIndex(r => r.id === a.raceId);
        const raceB = admin.races.findIndex(r => r.id === b.raceId);
        if (raceA !== raceB) return raceA - raceB;
        return a.timeMs - b.timeMs;
    });

    // Compute points per race
    const raceResultsMap = {};
    for (const race of admin.races) {
        const raceSubs = admin.submissions
            .filter(s => s.raceId === race.id)
            .sort((a, b) => a.timeMs - b.timeMs);
        raceSubs.forEach((s, i) => {
            raceResultsMap[s.docId || `${s.raceId}_${s.driverName}`] = POINTS_MAP[i] || 0;
        });
    }

    if (subs.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No submissions${filter !== "all" ? " for this race" : ""}.</td></tr>`;
        appendAddRow(tbody);
        return;
    }

    const raceName = (raceId) => {
        const r = admin.races.find(r => r.id === raceId);
        return r ? r.name : raceId;
    };

    tbody.innerHTML = subs.map(s => {
        const docId = s.docId || `${s.raceId}_${s.driverName.toLowerCase().replace(/\s+/g, "_")}`;
        const points = raceResultsMap[docId] || 0;
        const isEditing = admin.editingSubmissionId === docId;

        if (isEditing) {
            return `
                <tr data-docid="${escHtml(docId)}">
                    <td class="cell-text">${escHtml(raceName(s.raceId))}</td>
                    <td class="cell-text">${escHtml(s.driverName)}</td>
                    <td class="cell-text">${escHtml(s.teamName)}</td>
                    <td><input type="text" class="admin-input time-input" id="edit-time-${escHtml(docId)}" value="${escHtml(s.timeFormatted)}"></td>
                    <td class="cell-muted">${points}</td>
                    <td>
                        <button class="btn btn-small btn-success" onclick="saveSubmission('${escHtml(docId)}')">Save</button>
                        <button class="btn btn-small" onclick="cancelEdit()">Cancel</button>
                    </td>
                </tr>
            `;
        }

        return `
            <tr data-docid="${escHtml(docId)}">
                <td class="cell-text">${escHtml(raceName(s.raceId))}</td>
                <td class="cell-text">${escHtml(s.driverName)}</td>
                <td>
                    <span class="team-swatch" style="background: ${getTeamColorAdmin(s.teamName)}"></span>
                    <span class="cell-text">${escHtml(s.teamName)}</span>
                </td>
                <td class="cell-time">${escHtml(s.timeFormatted)}</td>
                <td class="cell-muted">${points}</td>
                <td>
                    <button class="btn btn-small" onclick="editSubmission('${escHtml(docId)}')">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="deleteSubmission('${escHtml(docId)}')">Delete</button>
                </td>
            </tr>
        `;
    }).join("");

    appendAddRow(tbody);
}

function appendAddRow(tbody) {
    if (!admin.addingSubmission) return;

    const raceOptions = admin.races.map(r => `<option value="${r.id}">${r.name}</option>`).join("");

    const allDrivers = admin.teams.flatMap(t =>
        t.drivers.map(d => ({ name: d, team: t.name }))
    );
    const driverOptions = allDrivers.map(d =>
        `<option value="${escHtml(d.name)}" data-team="${escHtml(d.team)}">${escHtml(d.name)} (${escHtml(d.team)})</option>`
    ).join("");

    const row = document.createElement("tr");
    row.className = "add-sub-row";
    row.innerHTML = `
        <td><select class="admin-input" id="add-sub-race">${raceOptions}</select></td>
        <td><select class="admin-input" id="add-sub-driver"><option value="">Pick driver</option>${driverOptions}</select></td>
        <td class="cell-muted" id="add-sub-team">—</td>
        <td><input type="text" class="admin-input time-input" id="add-sub-time" placeholder="1:23.456"></td>
        <td></td>
        <td>
            <button class="btn btn-small btn-success" onclick="confirmAddSubmission()">Add</button>
            <button class="btn btn-small" onclick="toggleAddSubmission()">Cancel</button>
        </td>
    `;
    tbody.appendChild(row);

    const driverSelect = document.getElementById("add-sub-driver");
    const teamCell = document.getElementById("add-sub-team");
    driverSelect.addEventListener("change", () => {
        const opt = driverSelect.selectedOptions[0];
        teamCell.textContent = opt?.dataset.team || "—";
    });
}

function toggleAddSubmission() {
    admin.addingSubmission = !admin.addingSubmission;
    renderSubmissions();
}

function editSubmission(docId) {
    admin.editingSubmissionId = docId;
    renderSubmissions();
    setTimeout(() => {
        const input = document.getElementById("edit-time-" + docId);
        if (input) { input.focus(); input.select(); }
    }, 50);
}

function cancelEdit() {
    admin.editingSubmissionId = null;
    renderSubmissions();
}

async function saveSubmission(docId) {
    const input = document.getElementById("edit-time-" + docId);
    if (!input) return;

    const timeStr = input.value.trim();
    const timeMs = parseTimeAdmin(timeStr);
    if (timeMs === null) {
        showAdminToast("Invalid time format. Use M:SS.mmm", "error");
        return;
    }

    try {
        await db.collection(COLLECTION.SUBMISSIONS).doc(docId).update({
            timeMs: timeMs,
            timeFormatted: timeStr,
        });

        const sub = admin.submissions.find(s =>
            (s.docId || `${s.raceId}_${s.driverName.toLowerCase().replace(/\s+/g, "_")}`) === docId
        );
        if (sub) {
            sub.timeMs = timeMs;
            sub.timeFormatted = timeStr;
        }

        admin.editingSubmissionId = null;
        renderSubmissions();
        showAdminToast("Time updated ✓", "success");
    } catch (err) {
        console.error("[admin] Save error:", err);
        showAdminToast("Save failed: " + err.message, "error");
    }
}

async function deleteSubmission(docId) {
    const sub = admin.submissions.find(s =>
        (s.docId || `${s.raceId}_${s.driverName.toLowerCase().replace(/\s+/g, "_")}`) === docId
    );
    const label = sub ? `${sub.driverName} — ${sub.timeFormatted}` : docId;

    if (!confirm(`Delete submission "${label}"?`)) return;

    try {
        await db.collection(COLLECTION.SUBMISSIONS).doc(docId).delete();

        admin.submissions = admin.submissions.filter(s =>
            (s.docId || `${s.raceId}_${s.driverName.toLowerCase().replace(/\s+/g, "_")}`) !== docId
        );

        renderSubmissions();
        showAdminToast("Submission deleted.", "success");
    } catch (err) {
        console.error("[admin] Delete error:", err);
        showAdminToast("Delete failed: " + err.message, "error");
    }
}

async function confirmAddSubmission() {
    const raceId = document.getElementById("add-sub-race").value;
    const driverSelect = document.getElementById("add-sub-driver");
    const driverName = driverSelect.value;
    const teamName = driverSelect.selectedOptions[0]?.dataset.team || "";
    const timeStr = document.getElementById("add-sub-time").value.trim();

    if (!raceId || !driverName || !timeStr) {
        showAdminToast("Fill in all fields.", "error");
        return;
    }

    const timeMs = parseTimeAdmin(timeStr);
    if (timeMs === null) {
        showAdminToast("Invalid time format. Use M:SS.mmm", "error");
        return;
    }

    const docId = `${raceId}_${driverName.toLowerCase().replace(/\s+/g, "_")}`;

    try {
        await db.collection(COLLECTION.SUBMISSIONS).doc(docId).set({
            driverName,
            teamName,
            raceId,
            timeMs,
            timeFormatted: timeStr,
            submittedAt: new Date().toISOString(),
        });

        admin.submissions.push({
            docId,
            driverName,
            teamName,
            raceId,
            timeMs,
            timeFormatted: timeStr,
        });

        admin.addingSubmission = false;
        renderSubmissions();
        showAdminToast(`Added: ${driverName} — ${timeStr}`, "success");
    } catch (err) {
        console.error("[admin] Add error:", err);
        showAdminToast("Add failed: " + err.message, "error");
    }
}


/* ---------- HELPERS ---------- */

function escHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getTeamColorAdmin(teamName) {
    const team = admin.teams.find(t => t.name === teamName);
    return team ? team.color : "#555";
}

function populateRaceFilter() {
    const select = document.getElementById("sub-race-filter");
    select.innerHTML = '<option value="all">All Races</option>' +
        admin.races.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
}


/* ---------- INITIALIZATION ---------- */

async function initAdmin() {
    if (!db) {
        document.querySelector(".container").innerHTML = `
            <div class="admin-loading" style="padding: 80px 20px; text-align: center;">
                <h2 style="color: var(--f1-red); margin-bottom: 16px;">Firebase Not Connected</h2>
                <p>Set <code>USE_DUMMY_DATA = false</code> in <code>js/firebase-init.js</code> and add your Firebase config.</p>
            </div>
        `;
        return;
    }

    // Fetch teams (bypass cache — always read fresh for admin)
    try {
        const snapshot = await db.collection(COLLECTION.TEAMS).get();
        admin.teams = [];
        snapshot.forEach(doc => {
            if (doc.id !== "_meta") {
                admin.teams.push({ id: doc.id, ...doc.data() });
            }
        });
    } catch (err) {
        console.error("[admin] Failed to fetch teams:", err);
        showAdminToast("Failed to load teams: " + err.message, "error");
    }

    // Fetch races (bypass cache — always read fresh for admin)
    try {
        const snapshot = await db.collection(COLLECTION.RACES).get();
        admin.races = [];
        snapshot.forEach(doc => {
            if (doc.id !== "_meta") {
                admin.races.push({ id: doc.id, ...doc.data() });
            }
        });
        admin.races.sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (err) {
        console.error("[admin] Failed to fetch races:", err);
        showAdminToast("Failed to load races: " + err.message, "error");
    }

    // Fetch submissions
    try {
        const snapshot = await db.collection(COLLECTION.SUBMISSIONS).get();
        admin.submissions = [];
        snapshot.forEach(doc => {
            admin.submissions.push({ docId: doc.id, ...doc.data() });
        });
    } catch (err) {
        console.error("[admin] Failed to fetch submissions:", err);
        showAdminToast("Failed to load submissions: " + err.message, "error");
    }

    populateRaceFilter();
    renderTeamsEditor();
    renderRacesEditor();
    renderSubmissions();
}

document.addEventListener("DOMContentLoaded", initAdmin);
