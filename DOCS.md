# F1 Sim Competition — Operations & Deployment Guide

> **Audience:** IT staff and future maintainers  
> **App:** Internal office F1 Sim Racing Leaderboard  
> **Stack:** Node.js · Express · SQLite · Vanilla HTML/CSS/JS

---

## 1. Architecture Overview

```
Browser (any office PC)
        │  HTTP requests
        ▼
┌─────────────────────────┐
│   server.js (Node.js)   │  ← Single entry point
│   Express web server    │
│   Port 3000             │
└────────┬────────────────┘
         │
    ┌────┴────┐   ┌──────────────┐
    │  /api   │   │ Static Files │
    │ routes  │   │ index.html   │
    └────┬────┘   │ admin.html   │
         │        │ css/ js/     │
    ┌────▼────┐   └──────────────┘
    │database │
    │.sqlite  │  ← Single file database
    └─────────┘
         │
    ┌────▼────┐
    │uploads/ │  ← Photo proof images
    └─────────┘
```

### Key Files

| File | Purpose |
|---|---|
| `server.js` | The entire backend — API routes, auth, and static file serving |
| `database.sqlite` | All data (teams, races, submissions). **Back this up.** |
| `uploads/` | Photo proof images submitted with lap times |
| `admin-config.json` | Bcrypt-hashed admin password. **Back this up.** |
| `set-password.js` | Utility script to set or change the admin password |
| `js/config.js` | Points map, TV/refresh intervals, and API base URL |
| `js/data.js` | Frontend data layer — all `fetch()` calls to the API |
| `js/app.js` | Main frontend logic (standings, leaderboard, TV mode) |
| `js/admin.js` | Admin panel logic |
| `index.html` | Public-facing site |
| `admin.html` | Admin panel (not linked from the public site) |

### API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| GET | `/api/teams` | No | Fetch all teams |
| POST | `/api/teams` | ✅ Admin | Replace all teams |
| GET | `/api/races` | No | Fetch all races |
| POST | `/api/races` | ✅ Admin | Replace all races |
| GET | `/api/submissions` | No | Fetch all submissions |
| POST | `/api/submissions` | No | Submit a new lap time |
| PATCH | `/api/submissions/:id` | ✅ Admin | Edit a submission's time |
| DELETE | `/api/submissions/:id` | ✅ Admin | Delete a submission |
| POST | `/api/admin/login` | No | Log in to admin session |
| POST | `/api/admin/logout` | No | Destroy admin session |
| GET | `/api/admin/session` | No | Check session status |

### Database Schema

**teams**
```
id TEXT (PK) | name TEXT | color TEXT | drivers TEXT (JSON array)
```
**races**
```
id TEXT (PK) | name TEXT | circuit TEXT | startDate TEXT | endDate TEXT | order_idx INTEGER
```
**submissions**
```
id TEXT (PK) | raceId TEXT | driverName TEXT | teamName TEXT
timeMs INTEGER | timeFormatted TEXT | submittedAt TEXT
hasProof BOOLEAN | proofPath TEXT
```

---

## 2. Prerequisites

Install these once on the server machine:

- **Node.js v18+** — https://nodejs.org (choose LTS)
- **PM2** — `npm install -g pm2`

Verify installs:
```bash
node -v    # should print v18.x.x or higher
pm2 -v
```

---

## 3. First-Time Deployment

```bash
# 1. Copy the project folder to the server, then navigate into it
cd F1SimTourneyWebsite

# 2. Install dependencies (only needed once, or after package.json changes)
npm install

# 3. Set the admin password (you will be prompted)
node set-password.js

# 4. Start the server with PM2
pm2 start server.js --name "f1-comp"

# 5. Save the process list so it survives reboots
pm2 save

# 6. Configure PM2 to launch on system startup (run the command it prints)
pm2 startup
```

The app is now running at `http://localhost:3000`.  
From other office PCs: `http://<server-ip>:3000`

To find the server's IP address:
```bash
ipconfig   # Windows
```

---

## 4. Day-to-Day Management

### Checking Status
```bash
pm2 status           # Is the server running?
pm2 logs f1-comp     # View live server logs
```

### Starting / Stopping
```bash
pm2 restart f1-comp  # Restart (do this after any code change)
pm2 stop f1-comp     # Stop the server
pm2 start f1-comp    # Start it again
```

### Admin Panel
Navigate to `http://<server-ip>:3000/admin` in your browser and enter the admin password.

From the admin panel you can:
- **Add / edit / delete Teams and Drivers** — click "Publish Teams" to save
- **Add / edit / delete Races** — click "Publish Races" to save
- **View, edit times, and delete Submissions**

---

## 5. Changing Races (Season Management)

At the start of each new race window:

1. Open the **Admin Panel**.
2. Under **Races**, click **+ Add Race**.
3. Fill in the race name, circuit, start date, and end date.
4. Click **Publish Races**.

> The `startDate` and `endDate` fields control when the submission window is shown as **Active** on the public leaderboard.

---

## 6. Making Code Changes

> ⚠️ Always test changes locally before deploying to the server.

### Workflow

1. Make changes on your development machine.
2. Test by running `node server.js` locally.
3. Copy the updated files to the server (USB, shared drive, or `git pull`).
4. On the server, restart PM2:
   ```bash
   pm2 restart f1-comp
   ```

### Files You Should NOT need to touch regularly

- `server.js` — only change if adding new API features
- `database.sqlite` — never edit directly; use the admin panel
- `node_modules/` — never edit; managed by npm

### Installing New npm Packages

If a developer adds a new dependency:
```bash
npm install          # installs anything new in package.json
pm2 restart f1-comp
```

---

## 7. Backup & Recovery

### What to Back Up

The only things that contain irreplaceable data:

| Item | Why |
|---|---|
| `database.sqlite` | All teams, races, and submission records |
| `uploads/` folder | All photo proof images |
| `admin-config.json` | Admin password hash |

**Recommended:** Copy all three to a shared network drive after every race window closes.

### Manual Backup (Windows)
```
xcopy "C:\path\to\F1SimTourneyWebsite\database.sqlite" "\\server\backups\" /Y
xcopy "C:\path\to\F1SimTourneyWebsite\admin-config.json" "\\server\backups\" /Y
xcopy "C:\path\to\F1SimTourneyWebsite\uploads" "\\server\backups\uploads\" /E /Y
```

### Restoring from Backup

1. Stop the server: `pm2 stop f1-comp`
2. Replace `database.sqlite` with your backup copy.
3. Replace the `uploads/` folder with your backup.
4. Restart: `pm2 start f1-comp`

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Site won't load | Run `pm2 status` — restart if stopped |
| "Port already in use" error | Another process is on port 3000. Change `PORT` in `server.js` line 9 |
| Admin changes not saving | Ensure you are logged in; check `pm2 logs f1-comp` for errors |
| Admin login says "Incorrect password" | Re-run `node set-password.js` on the server to reset |
| Photos not uploading | Ensure the `uploads/` folder exists and the server process has write permission |
| Database corrupted | Restore from backup (see Section 7) |

### Reading Logs
```bash
pm2 logs f1-comp --lines 50   # last 50 log lines
pm2 logs f1-comp --err        # errors only
```

---

## 9. Changing the Server Port

Edit **`server.js`**, line 9:
```js
const PORT = process.env.PORT || 3000;  // Change 3000 to your preferred port
```

Then restart: `pm2 restart f1-comp`

---

## 10. Admin Password Management

The admin panel is protected by a bcrypt-hashed password stored in `admin-config.json`.

### Setting or changing the password

Run this on the server machine — it will prompt you to enter a new password:
```bash
node set-password.js
```
Then restart the server:
```bash
pm2 restart f1-comp
```

> [!IMPORTANT]
> Sessions expire automatically after **8 hours** of inactivity.  
> Back up `admin-config.json` alongside `database.sqlite`.  
> The password must be **at least 6 characters**.

---

## 11. Contact & Handoff Notes

- Brenden configured this application to run entirely on-premises with no external cloud or Firebase dependencies.
- The admin URL (`/admin`) is not linked anywhere on the public site.
