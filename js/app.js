/* ============================================================
   app.js — Main application for F1 Sim Competition
   ============================================================
   Handles: views, scoring engine, rendering, TV mode, events
   ============================================================ */

/* ---------- APP STATE ---------- */

const state = {
    teams: [],
    submissions: [],
    activeView: "standings",
    selectedRaceId: null,
    raceBoardMode: "drivers", // "drivers" or "constructors"
    tvMode: false,
    tvTimer: null,
    tvViewIndex: 0,
    refreshTimer: null,
};

// Build a driver→team lookup from fetched teams
function buildDriverTeamMap() {
    const map = {};
    for (const team of state.teams) {
        for (const driver of team.drivers) {
            map[driver] = { teamName: team.name, color: team.color };
        }
    }
    return map;
}

function getTeamColor(teamName) {
    const team = state.teams.find(t => t.name === teamName);
    return team ? team.color : "#555";
}


/* ---------- SCORING ENGINE ---------- */

function computeRaceResults(raceId) {
    const race = RACES.find(r => r.id === raceId);
    const raceOver = race?.endDate
        ? new Date() > new Date(race.endDate + "T23:59:59")
        : true; // if no endDate set, assume over

    const raceSubs = state.submissions
        .filter(s => s.raceId === raceId)
        .sort((a, b) => a.timeMs - b.timeMs);

    const leaderTime = raceSubs.length > 0 ? raceSubs[0].timeMs : 0;

    return raceSubs.map((sub, i) => ({
        position: i + 1,
        driverName: sub.driverName,
        teamName: sub.teamName,
        timeMs: sub.timeMs,
        timeFormatted: sub.timeFormatted,
        points: raceOver ? (POINTS_MAP[i] || 0) : 0,
        gapMs: i === 0 ? 0 : sub.timeMs - leaderTime,
    }));
}

function computeDriverStandings() {
    const drivers = {};

    for (const race of RACES) {
        const results = computeRaceResults(race.id);
        for (const r of results) {
            if (!drivers[r.driverName]) {
                drivers[r.driverName] = {
                    driverName: r.driverName,
                    teamName: r.teamName,
                    points: 0,
                    wins: 0,
                    raceResults: {},
                };
            }
            drivers[r.driverName].points += r.points;
            drivers[r.driverName].raceResults[race.id] = r.points;
            if (r.position === 1 && r.points > 0) drivers[r.driverName].wins++;
        }
    }

    return Object.values(drivers)
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .map((d, i) => ({ ...d, position: i + 1 }));
}

// Returns top-2-per-team results with re-ranked constructor points
function computeConstructorRaceResults(raceId) {
    const allResults = computeRaceResults(raceId);

    // Keep only the fastest 2 per team (allResults is already sorted by time)
    const teamCount = {};
    const filtered = allResults.filter(r => {
        teamCount[r.teamName] = (teamCount[r.teamName] || 0) + 1;
        return teamCount[r.teamName] <= 2;
    });

    // Re-assign points from the filtered rank, preserving the raceOver gate
    const race = RACES.find(r => r.id === raceId);
    const raceOver = race?.endDate
        ? new Date() > new Date(race.endDate + "T23:59:59")
        : true;

    return filtered.map((r, i) => ({
        ...r,
        position: i + 1,
        points: raceOver ? (POINTS_MAP[i] || 0) : 0,
    }));
}

function computeConstructorStandings() {
    const teams = {};

    for (const team of state.teams) {
        teams[team.name] = {
            teamName: team.name,
            color: team.color,
            points: 0,
            wins: 0,
            drivers: team.drivers.map(d => ({ driverName: d, points: 0 })),
        };
    }

    // Accumulate constructor points from each race using re-ranked results
    for (const race of RACES) {
        const results = computeConstructorRaceResults(race.id);
        for (const r of results) {
            if (!teams[r.teamName]) continue;
            teams[r.teamName].points += r.points;
            if (r.position === 1 && r.points > 0) teams[r.teamName].wins++;
            // Track driver for display in the card
            const existing = teams[r.teamName].drivers.find(d => d.driverName === r.driverName);
            if (existing) {
                existing.points += r.points;
            }
        }
    }

    for (const t of Object.values(teams)) {
        t.drivers.sort((a, b) => b.points - a.points);
    }

    return Object.values(teams)
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .map((t, i) => ({ ...t, position: i + 1 }));
}



/* ---------- TIME PARSING / FORMATTING ---------- */

function parseTime(str) {
    const match = str.trim().match(/^(?:(\d+):)?(\d{1,2})\.(\d{1,3})$/);
    if (!match) return null;
    const mins = match[1] ? parseInt(match[1], 10) : 0;
    const secs = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, "0"), 10);
    if (secs >= 60 || ms >= 1000) return null;
    return mins * 60000 + secs * 1000 + ms;
}

function formatTime(ms) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    if (mins > 0) {
        return `${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
    }
    return `${secs}.${millis.toString().padStart(3, "0")}`;
}

function formatGap(gapMs) {
    if (gapMs === 0) return "";
    return `+${(gapMs / 1000).toFixed(3)}`;
}


/* ---------- VIEW MANAGEMENT ---------- */

const TAB_ORDER = ["standings", "races", "submit", "rules"];

function switchView(viewId, focusTab = false) {
    if (viewId.startsWith("driver=")) {
        state.activeView = viewId;
        if (window.location.hash !== `#${viewId}`) {
            window.history.pushState(null, "", `#${viewId}`);
        }
        document.querySelectorAll(".view").forEach(view => {
            view.classList.toggle("active", view.id === "view-driver");
        });
        document.querySelectorAll(".nav-tab").forEach(tab => {
            tab.classList.remove("active");
            tab.setAttribute("aria-selected", "false");
            tab.setAttribute("tabindex", "-1");
        });
        const header = document.querySelector(".header");
        if (header) header.classList.add("header-hidden");
        renderActiveView();
        return;
    }

    if (!TAB_ORDER.includes(viewId)) viewId = "standings";
    state.activeView = viewId;

    // Update URL Hash without triggering hashchange event loop
    if (window.location.hash !== `#${viewId}`) {
        window.history.pushState(null, "", `#${viewId}`);
    }

    // Update tabs + ARIA
    document.querySelectorAll(".nav-tab").forEach(tab => {
        const isActive = tab.dataset.view === viewId;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", isActive);
        tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    // Update views
    document.querySelectorAll(".view").forEach(view => {
        const isActive = view.id === `view-${viewId}`;
        view.classList.toggle("active", isActive);
    });

    // Show header only on standings
    const header = document.querySelector(".header");
    if (header) header.classList.toggle("header-hidden", viewId !== "standings");

    renderActiveView();

    // Focus the active tab if requested (keyboard nav)
    if (focusTab) {
        const activeTab = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
        if (activeTab) activeTab.focus();
    }
}

function renderActiveView() {
    switch (state.activeView) {
        case "standings":
            renderDriverStandings();
            renderConstructorStandings();
            break;
        case "races":
            renderRaceSelector();
            renderRaceResults();
            renderConstructorRaceResults();
            break;
        case "submit":
            renderSubmitForm();
            break;
        case "rules":
            // static view, nothing to render
            break;
        default:
            if (state.activeView.startsWith("driver=")) {
                const driverName = decodeURIComponent(state.activeView.substring(7));
                renderDriverProfile(driverName);
            }
            break;
    }
}


/* ---------- RENDER: STANDINGS ---------- */

function renderConstructorStandings() {
    const standings = computeConstructorStandings();
    const tbody = document.querySelector("#constructor-standings tbody");
    if (!tbody) return;

    tbody.innerHTML = standings.map((t, i) => {
        const driverList = t.drivers
            .map(d => `<span class="constructor-driver"><a href="#driver=${encodeURIComponent(d.driverName)}" class="driver-link">${d.driverName}</a> <span class="driver-pts">${d.points}</span></span>`)
            .join("");

        return `
            <tr style="--team-color: ${t.color}; animation-delay: ${i * 40}ms">
                <td><span class="pos-badge ${posClass(t.position)}">${t.position}</span></td>
                <td class="team-cell constructor-team">
                    <span class="team-bar" style="background: ${t.color}"></span>
                    <div>
                        <span class="team-name-main">${t.teamName}</span>
                        <div class="constructor-drivers">${driverList}</div>
                    </div>
                </td>
                <td class="points-cell">${t.points}</td>
            </tr>
        `;
    }).join("");
}

function posClass(pos) {
    if (pos === 1) return "pos-1";
    if (pos === 2) return "pos-2";
    if (pos === 3) return "pos-3";
    return "";
}

function renderDriverStandings() {
    const standings = computeDriverStandings();
    const tbody = document.querySelector("#driver-standings tbody");
    if (!tbody) return;

    const driverTeamMap = buildDriverTeamMap();

    tbody.innerHTML = standings.map((d, i) => {
        const teamColor = driverTeamMap[d.driverName]?.color || "#555";

        return `
            <tr style="--team-color: ${teamColor}; animation-delay: ${i * 40}ms">
                <td><span class="pos-badge ${posClass(d.position)}">${d.position}</span></td>
                <td class="team-cell">
                    <span class="team-bar" style="background: ${teamColor}"></span>
                    <a href="#driver=${encodeURIComponent(d.driverName)}" class="driver-link" style="font-weight: 600;">${d.driverName}</a>
                </td>
                <td class="cell-muted" style="font-size: var(--text-sm);">${d.teamName}</td>
                <td class="points-cell">${d.points}</td>
                <td style="text-align: center; color: var(--text-muted);">${d.wins || "—"}</td>
            </tr>
        `;
    }).join("");
}


/* ---------- RENDER: RACE RESULTS ---------- */

function renderRaceSelector() {
    const container = document.getElementById("race-selector");
    if (!container) return;

    const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    container.innerHTML = RACES.map(race => {
        const subCount = state.submissions.filter(s => s.raceId === race.id).length;
        const start = new Date(race.startDate + "T00:00:00");
        const end = new Date(race.endDate + "T23:59:59");
        const now = new Date();
        let status, statusClass;

        if (now < start) {
            status = "Upcoming";
            statusClass = "status-upcoming";
        } else if (now <= end) {
            status = "Active";
            statusClass = "status-active";
        } else {
            status = "Completed";
            statusClass = "status-completed";
        }

        const isSelected = race.id === state.selectedRaceId;
        const dateRange = `${fmtDate(start)} – ${fmtDate(end)}`;

        return `
            <div class="schedule-card${isSelected ? " selected" : ""}" onclick="selectRace('${race.id}')">
                <div class="schedule-round">ROUND ${race.order}</div>
                <h3 class="schedule-name">${race.name}</h3>
                <p class="schedule-date">${dateRange}</p>
                <span class="schedule-status ${statusClass}">${status}</span>
                ${subCount > 0 ? `<p class="schedule-entries">${subCount} entries</p>` : ""}
            </div>
        `;
    }).join("");
}

function selectRace(raceId) {
    state.selectedRaceId = raceId;
    renderRaceSelector();
    renderRaceBoard();
}

function toggleRaceBoard() {
    state.raceBoardMode = state.raceBoardMode === "drivers" ? "constructors" : "drivers";

    const btn = document.getElementById("race-board-toggle");

    if (state.raceBoardMode === "constructors") {
        btn.textContent = "Drivers' View";
        btn.classList.add("active");
    } else {
        btn.textContent = "Constructors' View";
        btn.classList.remove("active");
    }

    renderRaceBoard();
}

function renderRaceResults() { renderRaceBoard(); } // alias for TV mode / legacy callers
function renderConstructorRaceResults() {} // no-op, merged into renderRaceBoard

function renderRaceBoard() {
    const raceId = state.selectedRaceId || RACES[0]?.id;
    if (!raceId) return;

    const race = RACES.find(r => r.id === raceId);

    const title = document.getElementById("race-board-title");
    if (title && race) {
        const modeText = state.raceBoardMode === "constructors" ? "Constructors' Results" : "Drivers' Results";
        title.innerHTML = `${modeText} <span style="color:var(--text-muted); font-size:0.75em; font-weight:400; margin-left:var(--sp-3); border-left: 1px solid var(--border); padding-left: var(--sp-3);">${race.circuit}</span>`;
    }

    const allResults = computeRaceResults(raceId);
    const tbody = document.querySelector("#race-results tbody");
    const emptyEl = document.getElementById("race-empty");
    const tableEl = document.getElementById("race-results");

    const raceOver = race?.endDate
        ? new Date() > new Date(race.endDate + "T23:59:59")
        : true;

    let results;
    let leaderTime;

    if (state.raceBoardMode === "constructors") {
        // Keep only top 2 per team by lap time
        const teamCount = {};
        results = allResults.filter(r => {
            teamCount[r.teamName] = (teamCount[r.teamName] || 0) + 1;
            return teamCount[r.teamName] <= 2;
        });
        leaderTime = results.length > 0 ? results[0].timeMs : 0;
    } else {
        results = allResults;
        leaderTime = results.length > 0 ? results[0].timeMs : 0;
    }

    if (results.length === 0) {
        if (tableEl) tableEl.style.display = "none";
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }

    if (tableEl) tableEl.style.display = "";
    if (emptyEl) emptyEl.style.display = "none";

    tbody.innerHTML = results.map((r, i) => {
        const gapMs = i === 0 ? 0 : r.timeMs - leaderTime;
        // In constructors mode, reassign points from filtered rank; in drivers mode use original
        const displayPoints = raceOver
            ? (state.raceBoardMode === "constructors" ? (POINTS_MAP[i] || 0) : r.points)
            : 0;
        return `
        <tr style="--team-color: ${getTeamColor(r.teamName)}; animation-delay: ${i * 40}ms">
            <td><span class="pos-badge ${posClass(i + 1)}">${i + 1}</span></td>
            <td class="driver-name"><a href="#driver=${encodeURIComponent(r.driverName)}" class="driver-link">${r.driverName}</a></td>
            <td class="team-cell">
                <span class="team-dot" style="background: ${getTeamColor(r.teamName)}"></span>
                ${r.teamName}
            </td>
            <td class="time-cell">${raceOver ? r.timeFormatted : '<span style="opacity:.4">Hidden</span>'}</td>
            <td class="gap-cell">${raceOver ? (i === 0 ? '<span class="leader-tag">LEADER</span>' : formatGap(gapMs)) : '—'}</td>
            <td class="points-cell">${displayPoints > 0 ? displayPoints : "-"}</td>
        </tr>
    `}).join("");
}


/* ---------- RENDER: SUBMIT FORM ---------- */

function renderSubmitForm() {
    const raceInput = document.getElementById("submit-race");
    const raceDisplay = document.getElementById("submit-race-display");
    const driverList = document.getElementById("driver-list");
    if (!raceInput || !raceDisplay || !driverList) return;

    // Find the currently active race
    const now = new Date();
    const activeRace = RACES.find(race => {
        const start = new Date(race.startDate + "T00:00:00");
        const end = new Date(race.endDate + "T23:59:59");
        return now >= start && now <= end;
    });

    if (activeRace) {
        raceInput.value = activeRace.id;
        raceDisplay.textContent = activeRace.name;
    } else {
        raceInput.value = "";
        raceDisplay.textContent = "No Active Race";
    }

    if (driverList.children.length === 0) {
        const allDrivers = state.teams.flatMap(t =>
            t.drivers.map(d => ({ name: d, team: t.name }))
        );
        driverList.innerHTML = allDrivers
            .map(d => `<option value="${d.name}">${d.name} (${d.team})</option>`)
            .join("");
    }
}



async function handleSubmit(e) {
    e.preventDefault();
    const raceId = document.getElementById("submit-race").value;
    const driverName = document.getElementById("submit-driver").value;
    const minVal = document.getElementById("time-min").value;
    const secVal = document.getElementById("time-sec").value;
    const msVal = document.getElementById("time-ms").value;
    const proofInput = document.getElementById("submit-proof");

    // Validation
    if (!raceId) {
        showToast("There is no active race to submit to.", "error");
        return;
    }

    if (!driverName) {
        showToast("Please select your name.", "error");
        return;
    }

    if (minVal === "" || secVal === "" || msVal === "") {
        showToast("Please fill in all time fields.", "error");
        return;
    }

    const mins = parseInt(minVal, 10);
    const secs = parseInt(secVal, 10);
    const ms = parseInt(msVal, 10);

    if (isNaN(mins) || isNaN(secs) || isNaN(ms) || mins < 0 || secs < 0 || secs > 59 || ms < 0 || ms > 999) {
        showToast("Invalid time values.", "error");
        return;
    }

    if (!proofInput.files || proofInput.files.length === 0) {
        showToast("Please upload a photo of your lap time.", "error");
        return;
    }

    const proofFile = proofInput.files[0];
    if (!proofFile.type.startsWith("image/")) {
        showToast("Proof must be an image file.", "error");
        return;
    }

    const timeMs = mins * 60000 + secs * 1000 + ms;
    const timeStr = `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;

    // Resolve team from driver
    const driverInfo = buildDriverTeamMap()[driverName];
    if (!driverInfo) {
        showToast("Driver not found in any team.", "error");
        return;
    }

    // Show confirm modal
    const modal = document.getElementById("confirm-modal");
    const confirmBtn = document.getElementById("btn-confirm-submit");
    const cancelBtn = document.getElementById("btn-cancel-submit");

    modal.style.display = "flex";

    // Clean up old listeners to prevent multiple submissions
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirmBtn);
    cancelBtn.replaceWith(newCancelBtn);

    newCancelBtn.addEventListener("click", () => {
        modal.style.display = "none";
    });

    newConfirmBtn.addEventListener("click", async () => {
        modal.style.display = "none";

        // Show loading
        const btn = document.querySelector(".btn-submit");
        btn.classList.add("loading");
        btn.disabled = true;

        let base64Proof = "";
        try {
            base64Proof = await compressImage(proofFile);
        } catch (err) {
            console.error("Error compressing image:", err);
            btn.classList.remove("loading");
            btn.disabled = false;
            showToast("Failed to process image.", "error");
            return;
        }

        const result = await submitTime(raceId, driverName, driverInfo.teamName, timeMs, timeStr, base64Proof);

        btn.classList.remove("loading");
        btn.disabled = false;

        if (result.success) {
            showToast(`Time submitted: ${timeStr} ✓`, "success");
            document.getElementById("submit-form").reset();

            // Refresh data
            state.submissions = await fetchAllSubmissions();
            renderActiveView();
        } else {
            showToast(result.error || "Submission failed.", "error");
        }
    });
}

/**
 * Compresses an image file using a canvas to reduce size before saving.
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                const max_size = 800;

                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to 70% JPEG quality
                const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


/* ---------- TOAST ---------- */

function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-visible`;

    setTimeout(() => {
        toast.classList.remove("toast-visible");
    }, 4000);
}


/* ---------- TV MODE ---------- */

function toggleTvMode() {
    state.tvMode = !state.tvMode;
    document.body.classList.toggle("tv-mode", state.tvMode);

    const badge = document.getElementById("tv-badge");
    if (badge) badge.style.display = state.tvMode ? "flex" : "none";

    if (state.tvMode) {
        state.tvViewIndex = 0;
        startTvRotation();
    } else {
        stopTvRotation();
    }
}

function startTvRotation() {
    // Build the rotation sequence: standings, then each race with submissions
    const views = ["standings"];
    for (const race of RACES) {
        if (state.submissions.some(s => s.raceId === race.id)) {
            views.push("race:" + race.id);
        }
    }

    state.tvTimer = setInterval(() => {
        state.tvViewIndex = (state.tvViewIndex + 1) % views.length;
        const view = views[state.tvViewIndex];

        if (view === "standings") {
            switchView("standings");
        } else if (view.startsWith("race:")) {
            state.selectedRaceId = view.split(":")[1];
            switchView("races");
        }
    }, TV_ROTATE_INTERVAL);
}

function stopTvRotation() {
    if (state.tvTimer) {
        clearInterval(state.tvTimer);
        state.tvTimer = null;
    }
}


/* ---------- DATA REFRESH ---------- */

function startDataRefresh() {
    state.refreshTimer = setInterval(async () => {
        console.log("[app] Refreshing data...");
        await fetchRaces();
        state.submissions = await fetchAllSubmissions();
        state.teams = await fetchTeams();
        renderActiveView();
    }, DATA_REFRESH_INTERVAL);
}


/* ---------- INITIALIZATION ---------- */

async function initApp() {
    // Check for TV mode param
    const params = new URLSearchParams(window.location.search);
    if (params.get("tv") === "true") {
        state.tvMode = true;
        document.body.classList.add("tv-mode");
        const badge = document.getElementById("tv-badge");
        if (badge) badge.style.display = "flex";
    }

    // Fetch data
    try {
        await fetchRaces();
        state.teams = await fetchTeams();
        state.submissions = await fetchAllSubmissions();
    } catch (err) {
        console.error("[app] Failed to load data:", err);
        showToast("Failed to load data. Using cached data.", "error");
    }

    // Set default selected race: active race, else most recent finished, else first
    const now = new Date();
    const activeRace = RACES.find(r => {
        const start = new Date(r.startDate + "T00:00:00");
        const end = new Date(r.endDate + "T23:59:59");
        return now >= start && now <= end;
    });

    if (activeRace) {
        state.selectedRaceId = activeRace.id;
    } else {
        const finishedRaces = RACES.filter(r => {
            const end = new Date(r.endDate + "T23:59:59");
            return now > end;
        });
        state.selectedRaceId = finishedRaces.length > 0
            ? finishedRaces[finishedRaces.length - 1].id
            : RACES[0]?.id;
    }

    // Wire up tab navigation (click)
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    // Wire up submit form
    const form = document.getElementById("submit-form");
    if (form) {
        form.addEventListener("submit", handleSubmit);
    }

    // Time field auto-advance and clamping
    const timeMin = document.getElementById("time-min");
    const timeSec = document.getElementById("time-sec");
    const timeMs = document.getElementById("time-ms");

    if (timeMin && timeSec && timeMs) {
        // Auto-advance: min (1 digit) → sec, sec (2 digits) → ms
        timeMin.addEventListener("input", () => {
            if (timeMin.value.length >= 1) timeSec.focus();
        });
        timeSec.addEventListener("input", () => {
            if (timeSec.value.length >= 2) timeMs.focus();
        });

        // Clamp values on blur
        timeMin.addEventListener("blur", () => {
            const v = parseInt(timeMin.value, 10);
            if (!isNaN(v)) timeMin.value = Math.max(0, Math.min(9, v));
        });
        timeSec.addEventListener("blur", () => {
            const v = parseInt(timeSec.value, 10);
            if (!isNaN(v)) timeSec.value = Math.max(0, Math.min(59, v));
        });
        timeMs.addEventListener("blur", () => {
            const v = parseInt(timeMs.value, 10);
            if (!isNaN(v)) timeMs.value = Math.max(0, Math.min(999, v));
        });

        // Select all on focus for easy overwrite
        [timeMin, timeSec, timeMs].forEach(field => {
            field.addEventListener("focus", () => field.select());
        });
    }

    // ── Keyboard navigation ──
    document.addEventListener("keydown", (e) => {
        const inInput = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);

        // Number keys 1-4: switch tabs (unless typing in a field)
        if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const num = parseInt(e.key, 10);
            if (num >= 1 && num <= TAB_ORDER.length) {
                e.preventDefault();
                switchView(TAB_ORDER[num - 1], true);
                return;
            }
        }

        // Arrow keys: move between tabs when a tab is focused
        if (document.activeElement.classList.contains("nav-tab")) {
            const currentIdx = TAB_ORDER.indexOf(document.activeElement.dataset.view);
            let nextIdx = -1;

            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                nextIdx = (currentIdx + 1) % TAB_ORDER.length;
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                nextIdx = (currentIdx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
            } else if (e.key === "Home") {
                e.preventDefault();
                nextIdx = 0;
            } else if (e.key === "End") {
                e.preventDefault();
                nextIdx = TAB_ORDER.length - 1;
            }

            if (nextIdx >= 0) {
                switchView(TAB_ORDER[nextIdx], true);
                return;
            }
        }

        // T key: toggle TV mode (unless typing)
        if (!inInput && e.key === "t" && !e.ctrlKey && !e.metaKey) {
            toggleTvMode();
            return;
        }

        // Escape: blur current input (get back to tab navigation)
        if (e.key === "Escape" && inInput) {
            document.activeElement.blur();
        }
    });

    // TV toggle button
    const tvBtn = document.getElementById("tv-toggle");
    if (tvBtn) tvBtn.addEventListener("click", toggleTvMode);

    // Handle back/forward navigation via hash
    window.addEventListener("hashchange", () => {
        const hash = window.location.hash.substring(1);
        if (TAB_ORDER.includes(hash) || hash.startsWith("driver=")) switchView(hash);
    });

    // Render initial view based on URL hash or default
    const initialHash = window.location.hash.substring(1);
    if (TAB_ORDER.includes(initialHash) || initialHash.startsWith("driver=")) {
        switchView(initialHash);
    } else {
        switchView(state.activeView);
    }

    // Start auto-refresh
    startDataRefresh();

    // Start TV rotation if in TV mode
    if (state.tvMode) {
        startTvRotation();
    }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initApp);


/* ---------- RENDER: DRIVER PROFILE ---------- */

function renderDriverProfile(driverName) {
    const titleEl = document.getElementById("driver-profile-name");
    const teamEl = document.getElementById("driver-profile-team");
    const colorEl = document.getElementById("driver-profile-color");
    const pointsEl = document.getElementById("driver-stat-points");
    const winsEl = document.getElementById("driver-stat-wins");
    const listEl = document.getElementById("driver-history-list");

    if (!titleEl) return;

    const standings = computeDriverStandings();
    const driverStats = standings.find(d => d.driverName === driverName) || {
        driverName: driverName,
        teamName: "Unknown Team",
        points: 0,
        wins: 0
    };

    const teamColor = getTeamColor(driverStats.teamName);

    titleEl.textContent = driverStats.driverName;
    teamEl.textContent = driverStats.teamName;
    colorEl.style.background = teamColor;
    pointsEl.textContent = driverStats.points;
    winsEl.textContent = driverStats.wins;

    const driverSubs = state.submissions.filter(s => s.driverName === driverName);
    
    if (driverSubs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No lap times submitted yet.</div>`;
        return;
    }

    const html = driverSubs.map(sub => {
        const race = RACES.find(r => r.id === sub.raceId);
        const raceName = race ? race.name : "Unknown Race";
        const circuitName = race ? race.circuit : "";
        
        // Find how many points they earned in this race
        const raceResults = computeRaceResults(sub.raceId);
        const driverResult = raceResults.find(r => r.driverName === driverName);
        const pointsEarned = driverResult ? driverResult.points : 0;
        const gapMs = driverResult ? driverResult.gapMs : 0;
        
        const raceOver = race?.endDate
            ? new Date() > new Date(race.endDate + "T23:59:59")
            : true;

        const timeDisplay = raceOver ? sub.timeFormatted : '<span style="opacity:.4">Hidden</span>';
        const pointsDisplay = raceOver ? pointsEarned : "-";
        
        let proofHtml = `<div class="history-proof-none">No Proof</div>`;
        if (sub.hasProof && sub.proofPath) {
            proofHtml = `<img src="${sub.proofPath}" class="history-proof" alt="Proof for ${raceName}" onclick="openProofModal('${sub.proofPath}')">`;
        }

        return `
            <div class="history-item">
                <div class="history-race">
                    <h4 class="history-race-name">${raceName}</h4>
                    <p class="history-circuit">${circuitName}</p>
                </div>
                <div class="history-details">
                    <div class="history-metric" style="width: 100px;">
                        <span class="val">${timeDisplay}</span>
                        <span class="lbl">Lap Time</span>
                    </div>
                    <div class="history-metric" style="width: 60px;">
                        <span class="val">${pointsDisplay}</span>
                        <span class="lbl">Points</span>
                    </div>
                </div>
                ${proofHtml}
            </div>
        `;
    }).join("");

    listEl.innerHTML = html;
}

window.openProofModal = function(src) {
    const modal = document.getElementById('proof-modal');
    const img = document.getElementById('proof-modal-img');
    if (modal && img) {
        img.src = src;
        modal.style.display = 'flex';
    }
};
