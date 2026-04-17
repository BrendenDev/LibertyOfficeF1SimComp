function loadLeaderboard() {
    var leaderboard = document.getElementById("leaderboard");
    const rawData = {
        "Team 1": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 2": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 3": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 4": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 5": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 6": {
            "Chloe": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 7": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 8": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        },
        "Team 9": {
            "Kim": "1:00:23",
            "Dave": "2:44:34"
        }
        
    };

    const html = Object.entries(rawData).map(([teamName, members], pos) => `
        <tr>
            <td class="team-row">${pos + 1}</td>
            <td class="team-row">${teamName}</td>
            ${Object.entries(members).map(([driverName, lapTime], index) => `
                ${index > 0 ? 
                    `<tr>
                    <td></td>
                    <td></td>
                    <td>${driverName}</td>
                    <td>${lapTime}</td>
                    </tr>`
                    :
                    `<td>${driverName}</td>
                    <td>${lapTime}</td>`
                }
                `
        ).join('')}
        </tr>
    `).join('');

    leaderboard.innerHTML = html;

}

function updateLeaderboardFilter(val) {
    console.log(val);
    loadLeaderboard();
}