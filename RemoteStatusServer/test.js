import RemoteStatusServer from "./index.js";

let test = new RemoteStatusServer("hrX7mRR6wUchfwdnRdJ80NpD4XvVGMn0s6oCMY/nXFk=", ["pczWlxfMzPmuI6yjQMaQYA=="])

let connection = test.connections["pczWlxfMzPmuI6yjQMaQYA=="]

connection.on("playerConnect", player => {
    console.log(player.username + " connected!")
})

connection.on("typing_start", player => {
    console.log("MESSAGE STARTED!")
    connection.broadcastCommand("say " + player.username + " started typing...")
})

connection.on("message", (message, player) => {
    console.log(player)
    connection.broadcastCommand("say " + message)
})

connection.on("playerDeath", (player) => {
    console.log(player.username + " just died (RIP)")
})

connection.on("playerRespawn", (player) => {
    console.log(player.username + " just died (RIP)")
})

connection.on("playerChangedDimension", (player) => {
    player.sendMessage("Welcome to dimension: " + player.dimension)
})

connection.on("playerLevelChanged", (player) => {
    player.sendMessage(player.username + " just reached XP level " + player.experience.level + "!")
})

// setInterval(() => {
//     test.runCommand("tellraw @a [\"\",{\"text\":\"This is some \"},{\"text\":\"tellraw \",\"color\":\"dark_green\"},{\"text\":\"text\"}]")
// }, 10000)