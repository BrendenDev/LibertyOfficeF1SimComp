const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

// Load admin password config
const CONFIG_PATH = path.join(__dirname, "admin-config.json");
let adminPasswordHash = null;
if (fs.existsSync(CONFIG_PATH)) {
    try {
        adminPasswordHash = JSON.parse(fs.readFileSync(CONFIG_PATH)).passwordHash;
    } catch (e) {
        console.error("Failed to load admin-config.json:", e.message);
    }
} else {
    console.warn("⚠ admin-config.json not found. Run 'node set-password.js' to set an admin password.");
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Middleware
app.use(cors());
// Increase limits for Base64 image uploads
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Session middleware
app.use(session({
    secret: "f1sim-secret-key-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000  // 8 hours
    }
}));

// Auth middleware — protects admin API routes
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.status(401).json({ error: "Unauthorized. Please log in." });
}

// ==========================================
// AUTH ENDPOINTS
// ==========================================

app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (!adminPasswordHash) {
        return res.status(500).json({ error: "Admin password not configured. Run set-password.js on the server." });
    }
    if (!password || !bcrypt.compareSync(password, adminPasswordHash)) {
        return res.status(401).json({ error: "Incorrect password." });
    }
    req.session.isAdmin = true;
    res.json({ success: true });
});

app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/admin/session", (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(__dirname));
// Serve uploads publicly
app.use("/uploads", express.static(uploadsDir));

// Initialize SQLite Database
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log("Connected to the SQLite database.");
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Teams table
        db.run(`CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            drivers TEXT
        )`);

        // Races table
        db.run(`CREATE TABLE IF NOT EXISTS races (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            circuit TEXT,
            startDate TEXT,
            endDate TEXT,
            order_idx INTEGER
        )`);

        // Submissions table
        db.run(`CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            raceId TEXT NOT NULL,
            driverName TEXT NOT NULL,
            teamName TEXT,
            timeMs INTEGER NOT NULL,
            timeFormatted TEXT NOT NULL,
            submittedAt TEXT NOT NULL,
            hasProof BOOLEAN NOT NULL DEFAULT 0,
            proofPath TEXT
        )`);
    });
}

// Helper function to handle async DB queries
const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const allQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// ==========================================
// API ENDPOINTS
// ==========================================

// --- TEAMS ---
app.get("/api/teams", async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM teams");
        // Parse the JSON string drivers back into an array
        const teams = rows.map(r => ({
            ...r,
            drivers: JSON.parse(r.drivers || "[]")
        }));
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/teams", requireAdmin, async (req, res) => {
    // Expects an array of teams to replace the current teams
    const teams = req.body;
    if (!Array.isArray(teams)) return res.status(400).json({ error: "Expected an array of teams" });

    try {
        await runQuery("DELETE FROM teams");
        for (const team of teams) {
            await runQuery(
                "INSERT INTO teams (id, name, color, drivers) VALUES (?, ?, ?, ?)",
                [team.id, team.name, team.color, JSON.stringify(team.drivers || [])]
            );
        }
        res.json({ success: true, count: teams.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- RACES ---
app.get("/api/races", async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM races ORDER BY order_idx ASC");
        // Map order_idx back to order for the frontend
        const races = rows.map(r => ({
            ...r,
            order: r.order_idx
        }));
        res.json(races);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/races", requireAdmin, async (req, res) => {
    // Expects an array of races to replace the current races
    const races = req.body;
    if (!Array.isArray(races)) return res.status(400).json({ error: "Expected an array of races" });

    try {
        await runQuery("DELETE FROM races");
        for (const race of races) {
            await runQuery(
                "INSERT INTO races (id, name, circuit, startDate, endDate, order_idx) VALUES (?, ?, ?, ?, ?, ?)",
                [race.id, race.name, race.circuit, race.startDate, race.endDate, race.order || 0]
            );
        }
        res.json({ success: true, count: races.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- SUBMISSIONS ---
app.get("/api/submissions", async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM submissions ORDER BY timeMs ASC");
        res.json(rows.map(r => ({ ...r, hasProof: !!r.hasProof })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/submissions", async (req, res) => {
    const { raceId, driverName, teamName, timeMs, timeFormatted, base64Proof } = req.body;

    if (!raceId || !driverName || !timeMs || !timeFormatted) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const docId = `${raceId}_${driverName.toLowerCase().replace(/\\s+/g, "_")}`;

    try {
        // Check if submission exists
        const existing = await allQuery("SELECT id, timeFormatted FROM submissions WHERE id = ?", [docId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: `You have already submitted a time for this race (${existing[0].timeFormatted}).` });
        }

        let proofPath = null;
        let hasProof = false;

        // Process proof image if provided
        if (base64Proof) {
            hasProof = true;
            // The base64Proof is expected to be a data URL like "data:image/jpeg;base64,..."
            const matches = base64Proof.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
                const data = matches[2];
                const buffer = Buffer.from(data, "base64");
                
                const filename = `proof_${docId}_${Date.now()}.${ext}`;
                proofPath = path.join("uploads", filename);
                
                // Write file to disk synchronously for simplicity
                fs.writeFileSync(path.join(__dirname, proofPath), buffer);
                // Convert backslashes to forward slashes for the web URL
                proofPath = "/" + proofPath.replace(/\\/g, "/");
            }
        }

        await runQuery(
            `INSERT INTO submissions 
            (id, raceId, driverName, teamName, timeMs, timeFormatted, submittedAt, hasProof, proofPath) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [docId, raceId, driverName, teamName, timeMs, timeFormatted, new Date().toISOString(), hasProof ? 1 : 0, proofPath]
        );

        res.json({ success: true, docId });
    } catch (err) {
        console.error("Submission error:", err);
        res.status(500).json({ error: "Failed to submit. Please try again." });
    }
});

app.patch("/api/submissions/:id", requireAdmin, async (req, res) => {
    const { timeMs, timeFormatted } = req.body;
    if (!timeMs || !timeFormatted) return res.status(400).json({ error: "Missing timeMs or timeFormatted" });
    try {
        await runQuery(
            "UPDATE submissions SET timeMs = ?, timeFormatted = ? WHERE id = ?",
            [timeMs, timeFormatted, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/submissions/:id", requireAdmin, async (req, res) => {
    try {
        await runQuery("DELETE FROM submissions WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback to index.html for SPA (though this isn't strictly an SPA router, it helps)
app.use((req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
    if (req.path === "/admin") return res.sendFile(path.join(__dirname, "admin.html"));
    res.sendFile(path.join(__dirname, "index.html"));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
