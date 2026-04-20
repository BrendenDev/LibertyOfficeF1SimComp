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
        points: POINTS_MAP[i] || 0,
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
            if (r.position === 1) drivers[r.driverName].wins++;
        }
    }

    return Object.values(drivers)
        .sort((a, b) => b.points - a.points || b.wins - a.wins)
        .map((d, i) => ({ ...d, position: i + 1 }));
}

function computeConstructorStandings() {
    const driverStandings = computeDriverStandings();
    const teams = {};

    for (const team of state.teams) {
        teams[team.name] = {
            teamName: team.name,
            color: team.color,
            points: 0,
            wins: 0,
            drivers: [],
        };
    }

    for (const d of driverStandings) {
        if (teams[d.teamName]) {
            teams[d.teamName].points += d.points;
            teams[d.teamName].wins += d.wins;
            teams[d.teamName].drivers.push(d);
        }
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

const TAB_ORDER = ["standings", "races", "submit", "schedule"];

function switchView(viewId, focusTab = false) {
    state.activeView = viewId;

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

    renderActiveView();

    // Focus the active tab if requested (keyboard nav)
    if (focusTab) {
        const activeTab = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
        if (activeTab) activeTab.focus();
    }

    // Auto-focus first form field when entering Submit view
    if (viewId === "submit") {
        setTimeout(() => {
            const firstField = document.getElementById("submit-race");
            if (firstField) firstField.focus();
        }, 100);
    }
}

function renderActiveView() {
    switch (state.activeView) {
        case "standings":
            renderConstructorStandings();
            break;
        case "races":
            renderRaceSelector();
            renderRaceResults();
            break;
        case "submit":
            renderSubmitForm();
            break;
        case "schedule":
            renderSchedule();
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
            .map(d => `<span class="constructor-driver">${d.driverName} <span class="driver-pts">${d.points}</span></span>`)
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


/* ---------- RENDER: RACE RESULTS ---------- */

function renderRaceSelector() {
    const select = document.getElementById("race-select");
    if (!select) return;

    // Only rebuild options if they've changed
    if (select.children.length === RACES.length && select.value === state.selectedRaceId) return;

    select.innerHTML = RACES.map(r => {
        const subCount = state.submissions.filter(s => s.raceId === r.id).length;
        const label = subCount > 0 ? `${r.name} (${subCount} entries)` : r.name;
        return `<option value="${r.id}" ${r.id === state.selectedRaceId ? "selected" : ""}>${label}</option>`;
    }).join("");
}

function renderRaceResults() {
    const raceId = state.selectedRaceId || RACES[0]?.id;
    if (!raceId) return;

    const results = computeRaceResults(raceId);
    const tbody = document.querySelector("#race-results tbody");
    const emptyEl = document.getElementById("race-empty");
    const tableEl = document.getElementById("race-results");

    if (results.length === 0) {
        if (tableEl) tableEl.style.display = "none";
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }

    if (tableEl) tableEl.style.display = "";
    if (emptyEl) emptyEl.style.display = "none";

    const race = RACES.find(r => r.id === raceId);

    tbody.innerHTML = results.map((r, i) => `
        <tr style="--team-color: ${getTeamColor(r.teamName)}; animation-delay: ${i * 40}ms">
            <td><span class="pos-badge ${posClass(r.position)}">${r.position}</span></td>
            <td class="driver-name">${r.driverName}</td>
            <td class="team-cell">
                <span class="team-dot" style="background: ${getTeamColor(r.teamName)}"></span>
                ${r.teamName}
            </td>
            <td class="time-cell">${r.timeFormatted}</td>
            <td class="gap-cell">${r.position === 1 ? '<span class="leader-tag">LEADER</span>' : formatGap(r.gapMs)}</td>
            <td class="points-cell">${r.points > 0 ? r.points : "-"}</td>
        </tr>
    `).join("");
}


/* ---------- RENDER: SUBMIT FORM ---------- */

function renderSubmitForm() {
    const raceSelect = document.getElementById("submit-race");
    const driverList = document.getElementById("driver-list");
    if (!raceSelect || !driverList) return;

    // Populate races
    if (raceSelect.children.length <= 1) {
        raceSelect.innerHTML = '<option value="">Select a Race</option>' +
            RACES.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
    }

    // Populate driver datalist from teams
    if (driverList.children.length === 0) {
        const allDrivers = state.teams.flatMap(t =>
            t.drivers.map(d => ({ name: d, team: t.name }))
        );
        driverList.innerHTML = allDrivers
            .map(d => `<option value="${d.name}">${d.name} (${d.team})</option>`)
            .join("");
    }
}


/* ---------- RENDER: SCHEDULE ---------- */

function renderSchedule() {
    const grid = document.getElementById("schedule-grid");
    if (!grid) return;

    const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    grid.innerHTML = RACES.map(race => {
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

        const dateRange = `${fmtDate(start)} – ${fmtDate(end)}`;

        return `
            <div class="schedule-card" onclick="viewRaceResults('${race.id}')" style="cursor:pointer" title="View race results">
                <div class="schedule-round">ROUND ${race.order}</div>
                <h3 class="schedule-name">${race.name}</h3>
                <p class="schedule-circuit">${race.circuit}</p>
                <p class="schedule-date">${dateRange}</p>
                <span class="schedule-status ${statusClass}">${status}</span>
                ${subCount > 0 ? `<p class="schedule-entries">${subCount} entries</p>` : ""}
            </div>
        `;
    }).join("");
}



function viewRaceResults(raceId) {
    state.selectedRaceId = raceId;
    switchView("races");
}


/* ---------- SUBMISSION HANDLER ---------- */

async function handleSubmit(e) {
    e.preventDefault();
    const raceId = document.getElementById("submit-race").value;
    const driverName = document.getElementById("submit-driver").value;
    const minVal = document.getElementById("time-min").value;
    const secVal = document.getElementById("time-sec").value;
    const msVal = document.getElementById("time-ms").value;

    // Validation
    if (!raceId || !driverName) {
        showToast("Please fill in all fields.", "error");
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

    const timeMs = mins * 60000 + secs * 1000 + ms;
    const timeStr = `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;

    // Resolve team from driver
    const driverInfo = buildDriverTeamMap()[driverName];
    if (!driverInfo) {
        showToast("Driver not found in any team.", "error");
        return;
    }

    // Show loading
    const btn = document.querySelector(".btn-submit");
    btn.classList.add("loading");
    btn.disabled = true;

    const result = await submitTime(raceId, driverName, driverInfo.teamName, timeMs, timeStr);

    btn.classList.remove("loading");
    btn.disabled = false;

    if (result.success) {
        const msg = result.improved
            ? `Time improved to ${timeStr} 🚀`
            : `Time submitted: ${timeStr} ✓`;
        showToast(msg, "success");
        document.getElementById("submit-form").reset();

        // Refresh data
        state.submissions = await fetchAllSubmissions();
        renderActiveView();
    } else {
        showToast(result.error || "Submission failed.", "error");
    }
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

    // Set default selected race (most recent with submissions, or first)
    const racesWithSubs = RACES.filter(r =>
        state.submissions.some(s => s.raceId === r.id)
    );
    state.selectedRaceId = racesWithSubs.length > 0
        ? racesWithSubs[racesWithSubs.length - 1].id
        : RACES[0]?.id;

    // Wire up tab navigation (click)
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    // Wire up race selector
    const raceSelect = document.getElementById("race-select");
    if (raceSelect) {
        raceSelect.addEventListener("change", (e) => {
            state.selectedRaceId = e.target.value;
            renderRaceResults();
        });
    }

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

    // Render initial view
    renderActiveView();

    // Start auto-refresh
    startDataRefresh();

    // Start TV rotation if in TV mode
    if (state.tvMode) {
        startTvRotation();
    }
}

// Boot
document.addEventListener("DOMContentLoaded", initApp);
