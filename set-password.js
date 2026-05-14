/**
 * set-password.js
 * Run this script once to set or change the admin panel password.
 * Usage:  node set-password.js
 */

const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const CONFIG_PATH = path.join(__dirname, "admin-config.json");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Enter new admin password: ", (password) => {
    if (!password || password.length < 6) {
        console.error("Password must be at least 6 characters.");
        rl.close();
        process.exit(1);
    }

    const hash = bcrypt.hashSync(password, 12);
    const config = { passwordHash: hash };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("✅ Admin password set successfully.");
    rl.close();
});
