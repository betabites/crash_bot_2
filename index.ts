// Copyright 2022 - Jack Hawinkels - All Rights Reserved
// import {EndBehaviorType} from "@discordjs/voice";

import express from "express"
import fileUpload, {UploadedFile} from "express-fileupload"
import ws from "ws"
import fs from "fs"
import {EventEmitter} from "node:events";
import * as path from "path";
import {spawn, exec} from "child_process"
import {
    client,
    downloadDiscordAttachment,
    downloadDiscordAttachmentWithInfo,
    sendImpersonateMessage
} from "./src/Discord.js";
import ChatGPT from "./src/ChatGPT.js";
import RemoteStatusServer, {Connection as ServerConnection} from "./src/RemoteStatusServer.js";
import SafeQuery from "./src/SQL.js";
import {searchIndex, FindOwnership, dirTree, Bank, BankResource, buildPack} from "./src/ResourcePackManager.js";
import {CrashBotUser} from "./src/UserManager.js";
import archiver from "archiver";
import Jimp from "jimp";
import {ItemType} from "./src/DestinyDefinitions/DestinyDefinitions.js";
import Discord, {
    TextChannel,
    Guild,
    GuildMember,
    Message,
    Interaction,
    MessageComponentInteraction,
    TextBasedChannel, BufferResolvable, User, CacheType
} from "discord.js";
import {generateThrow, fetchThrowTemplates} from "./src/ThrowMaker.js";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import {PassThrough} from "stream";
import {makeid, QueueManager, ShuffleArray} from "./src/Common.js";
import WSS from "./src/WSS.js";
import {VoiceConnectionManager} from "./src/VoiceManager.js";
import http from "http";
import https from "https";
import inspirobot from "inspirobot.js";
import dotenv from "dotenv"
import mssql from "mssql";
import randomWords from "random-words";
import bad_baby_words from "./badwords.json" assert {type: "json"}
import {
    itemNameSearch,
    buildItemMessage,
    vendorNameSearch,
    buildActivityMessage,
    activityNameSearch, updateMSVendors, buildVendorMessage, setupBungieAPI, SetupNotifications
} from "./src/Bungie.NET.js";
import {getItem} from "bungie-net-core/lib/endpoints/Destiny2/index.js";

dotenv.config()

const HOT_POTATO_CHANNEL_ID = "1108718443525586944"
// const spotify = require("spottydl")
let hot_potato_timer_ms = 5.76e+7
let hot_potato_holder

let console_channel, chat_channel
let pack_updated = true
const imageCaptureChannels = ["892518159167393824", "928215083190984745", "931297441448345660", "966665613101654017", "933949561934852127", "1002003265506000916"]
const baby_alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0987654321)(*&^%$#@!?<>"

interface RandomCaptureData {
    content: string
    components: Discord.MessageActionRow[]
}

// let banner_images = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/html/web_assets/banner_images.json").toString())
let server_env_options = {
    shell: "sh",
    arguments: ["run.sh"],
    cwd: "/home/ubscontrol/java_server/",
    chatPrefix: "[Server thread/INFO"
}
// let server_env_options = {
//     shell: "sh",
//     arguments: ["run.sh"],
//     cwd: "/home/ubscontrol/doomsday_server/",
//     chatPrefix: "[Server thread/INFO] [minecraft/DedicatedServer"
// }
// let sound_mappings = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/sounds/sound_definitions.json").toString()).sound_definitions
let active_playlist_modifications = {}

// Parse memes and convert any items with the .url attribute
setInterval(async () => {
    let res = await SafeQuery("SELECT * FROM dbo.Webhook WHERE timeout < GETDATE()")
    for (let _webhook of res.recordset) {
        let webhook = new Discord.WebhookClient({id: _webhook.webhook_id, token: _webhook.token})
        webhook.delete()
    }
    await SafeQuery("DELETE FROM dbo.Webhook WHERE timeout < GETDATE()")
}, 60000)

// schedule.scheduleJob("0 50 23 * * *", async () => {
//     let midnight = new Date()
//     mcServer.avoid_discord = true
//     mcServer.sendCommand("gamerule doInsomnia false\n" +
//         "gamerule dodaylightcycle false\n" +
//         "gamerule domobspawning false\n" +
//         "gamerule doweathercycle false\n" +
//         "time set midnight\n" +
//         "weather clear\n" +
//         "tellraw @a {\"rawtext\":[{\"text\":\"§lPreparing for an event...\"},{\"text\":\"§r§§The following changes have been made in preperation for an upcoming event:§§- Insomina disabled§§- Daylight cycle \"},{\"text\":\"§4disabled\"},{\"text\":\"§r§§- Mob spawning \"},{\"text\":\"§4disabled\"},{\"text\":\"§r§§- Weather cycle \"},{\"text\":\"§4disabled\"},{\"text\":\"§r§§- Weather \"},{\"text\":\"§2clear\"},{\"text\":\"§r§§- Time \"},{\"text\":\"§2midnight\"},{\"text\":\"§r§§- All rendered mobs \"},{\"text\":\"§4killed\"}]}"
//     )
//     midnight.setDate(midnight.getDate() + 1)
//     midnight.setHours(0,0,0)
//     while (true) {
//         let seconds = Math.round((midnight.getTime() - (new Date()).getTime()) / 1000)
//         let minutes = Math.floor(seconds / 60)
//         seconds -= minutes * 60
//         if (minutes !== 0) {
//             mcServer.sendCommand(`titleraw @a actionbar {\"rawtext\":[{\"text\":\"${minutes}:${("0" + seconds).slice(("0" + seconds).length - 2, ("0" + seconds).length)}\"}]}`)
//         } else {
//             mcServer.sendCommand(`titleraw @a title {"rawtext":[{"text":"${seconds}"}]}`)
//         }
//         await wait(500)
//         if (seconds === 0 && minutes === 0) {
//             break
//         }
//     }
//     new_years_fireworks()
//     await wait(300000)
//     mcServer.avoid_discord = false
//     mcServer.sendCommand("gamerule doInsomnia true\n" +
//         "gamerule dodaylightcycle true\n" +
//         "gamerule domobspawning true\n" +
//         "gamerule doweathercycle true"
//     )
// })

// // Schedule April Fools day event
// const aprilfools = schedule.scheduleJob("0 0 0 1 4 *", () => {
//     client.channels.fetch("892518365766242375")
//         .then(channel => {
//             // let embed = new Discord.MessageEmbed()
//             // embed.setTitle("QUEST UNLOCKED!")
//             // embed.setDescription("Ruin Post Validator's day by continuously pinging it.")
//             // embed.setFooter("WARNING: Foul language")
//             // embed.addField("")
//
//             SafeQuery("UPDATE CrashBot.dbo.Users SET experimentBabyWords = TRUE WHERE 1=1")
//             channel.send({
//                 content: "@here HELP! Post Validator has stole the CrashBotUser to baby speak and enabled it for everyone! Let's ping the f\\*k out of them!"
//             })
//         })
// })

function spawnServer() {
    return spawn(server_env_options.shell, server_env_options.arguments, {
        cwd: server_env_options.cwd
    })
}

// class mcServerClass extends events.EventEmitter {
//     constructor() {
//         super();
//
//         this.avoid_discord = false
//         this.server = null
//         // this.start()
//         this.result_coupler = []
//         this.result_coupler_timeout = setTimeout(() => {
//         }, 500)
//     }
//
//     async sendCommand(command) {
//         console.log(command)
//         return new Promise(resolve => {
//             this.sendOutAsync = (res) => {
//                 clearTimeout(this.sendOutAsyncTimeout)
//                 resolve(res)
//             }
//             this.server.stdin.write(command + "\n")
//             this.sendOutAsyncTimeout = setTimeout(() => {
//                 delete this.sendOutAsyncTimeout
//                 resolve("Command did not send result fast enough")
//             }, 10000)
//         })
//     }
//
//     async shutdown() {
//         return new Promise(async resolve => {
//             this.expecting_shutdown = true
//             if (this.server !== null) {
//                 this.shutdown_resolve = resolve
//                 this.on("onShutdown", this.await_shutdown)
//                 this.server.stdin.write("stop\n")
//             } else {
//                 resolve()
//             }
//         })
//     }
//
//     await_shutdown() {
//         this.expecting_shutdown = false
//         this.removeListener("onShutdown", this.await_shutdown)
//         this.shutdown_resolve()
//         delete this.shutdown_resolve
//     }
//
//     start() {
//         if (this.server === null) {
//             try {
//                 this.server = spawnServer()
//                 this.server.stdout.on("data", async data => {
//                     let data_str = data.toString().slice(0, -1).replaceAll(/^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]:[0-9][0-9][0-9] /ig, "[")
//                     if (data_str !== "") {
//                         try {
//                             clearTimeout(this.result_coupler_timeout)
//                         } catch (e) {
//                         }
//
//                         this.result_coupler.push(data_str)
//                         this.result_coupler_timeout = setTimeout(() => {
//                             if (this.avoid_discord) {
//                                 console.log(data_str + " (told to avoid Discord)")
//                             } else {
//                                 try {
//                                     let embed = new Discord.MessageEmbed()
//                                     let _data_str = this.result_coupler.join("\n")
//                                     if (_data_str.length > 1000) {
//                                         embed.setDescription(data_str.substr(0, 997) + "...")
//                                     } else {
//                                         embed.setDescription(_data_str)
//                                     }
//                                     if (data_str.startsWith("[INFO]")) {
//                                         embed.setColor("#add8e6")
//                                     }
//                                     console_channel.send({
//                                         embeds: [
//                                             embed
//                                         ]
//                                     })
//                                     console.log(this.result_coupler)
//                                     this.result_coupler.length = 0
//                                 } catch (e) {
//                                     console.log(data_str + " (could not send through Discord)")
//                                 }
//                             }
//                         }, 500)
//
//                         if (typeof this.sendOutAsync !== "undefined") {
//                             this.sendOutAsync(data_str)
//                             delete this.sendOutAsync
//                         }
//
//                         if (data_str.startsWith("[INFO] Player disconnected: ")) {
//                             console.log("Player disconnect triggered")
//                             let data = data_str.replace("[INFO] Player disconnected: ", "").split(", xuid: ")
//                             this.emit("onPlayerDisconnect", {
//                                 player_name: data[0],
//                                 xuid: data[1]
//                             })
//                         }
//                         if (data_str.indexOf("logged in with entity id") !== -1) {
//                             let split = data_str.split("]: ")[1].replace("logged in with entity id", "").replace("at","").split(" ")
//                             let username_ip = split[0].split("[/")
//                             let username = username_ip[0]
//                             let ip = username_ip[1].replace("]", "")
//                             let entity_id = parseInt(split[1])
//                             let coordinates = split[2].replace("(","").replace(")","").split(",").map(i => parseInt(i))
//                             this.emit("onPlayerConnect", {
//                                 username, ip, entity_id, coordinates
//                             })
//                         }
//
//                         let data_split = data_str.split("]:")
//                         if (data_split[0].endsWith(server_env_options.chatPrefix)) {
//                             if (data_split[1].startsWith(" [") && data_split[data_split.length -1].endsWith("]")) {
//                                 // User-run command
//                                 command_channel.queue(data_str)
//                             }
//                             else if (data_split[1].startsWith(" <") || data_split[1].startsWith("[")) {
//                                 // Chat message
//                                 let embed = new Discord.MessageEmbed()
//                                 let msg_content = data_str.replace(data_split[0] + "]:", "")
//                                 let msg_sender = msg_content.replace(" <", "").split("> ")[0]
//                                 msg_content = msg_content.replace(" <" + msg_sender + "> ", "")
//
//                                 // Detect what user's discord account it
//                                 let key
//                                 for (let _key of CrashBotUser.map) {
//                                     if (msg_sender.indexOf(_key[1].player_name) !== -1) {
//                                         key = _key[1]
//                                         break
//                                     }
//                                 }
//
//                                 if (key) {
//                                     client.users.fetch(key.discord_id).then(user => {
//                                         chat_channel.createWebhook(user.username + " (from MC server)", {
//                                             avatar: user.avatarURL(),
//                                             reason: "MC server chat message"
//                                         }).then(webhook => {
//                                             webhook.send(msg_content).then(() => {
//                                                 webhook.delete()
//                                             })
//                                         })
//                                     })
//                                 }
//                                 else {
//                                     chat_channel.createWebhook(msg_sender + " (from MC server)").then(webhook => {
//                                         webhook.send(msg_content).then(() => {
//                                             webhook.delete()
//                                         })
//                                     })
//                                 }
//                             }
//                         }
//
//                         // Check if server can perform a backup
//                         if (data_str.endsWith("Saved the game")) {
//                             // Make sure that the server doesn't try to save while a backup is in progress
//                             await this.sendCommand("save-off")
//
//                             // Clear old backups
//                             console.log("Cleaning up old backups...")
//                             let old_backups = fs.readdirSync("/home/ubscontrol/java_server/backups").sort()
//                             if (old_backups.length >= 3) {
//                                 console.log("Removing: " + old_backups[0])
//                                 fs.unlinkSync("/home/ubscontrol/java_server/backups/" + old_backups[0])
//                             }
//
//                             console.log("Performing backup ZIP")
//
//                             let output_file_location = '/home/ubscontrol/java_server/backups/' + (new Date()).getTime().toString() + "_backup.zip"
//                             let output = fs.createWriteStream(output_file_location);
//                             let archive = archiver('zip');
//                             let parent = this
//
//                             output.on('close', function () {
//                                 mcServer.sendCommand("save-on")
//                                 parent.emit("onBackupComplete", {
//                                     fileLocation: output_file_location
//                                 })
//                                 output.close()
//                             });
//
//                             archive.on('error', function (err) {
//                                 console.log(err)
//                                 parent.sendCommand("save-on")
//                                 parent.emit("onBackupError", {
//                                     error: err
//                                 })
//                             });
//
//                             archive.pipe(output);
//                             this.emit("onBackupReadStream", {
//                                 stream: archive
//                             })
//
//                             // append files from a sub-directory, putting its contents at the root of archive
//                             archive.directory("/home/ubscontrol/java_server/world", false);
//
//                             archive.finalize();
//                         }
//                     }
//                 })
//                 this.server.stdout.on("close", data => {
//                     if (this.expecting_shutdown !== true) {
//                         console.log("Unexpected server crash. Try running /restart_server.")
//                         try {
//                             console_channel.send("Unexpected server crash. Try running /restart_server.")
//                         }
//                         catch (e) {
//                             console.log("Unexpected server crash. Try running /restart_server. (could not send through Discord)")
//                         }
//                     }
//                     console.log("Server shutdown")
//
//                     // Set all players as disconnected
//                     for (let key of CrashBotUser.map) {
//                         if (key[1].active === true) {
//                             key[1].active = false
//                             key[1].active_time += Math.round(((new Date()).getTime() - key[1].active_start) / 1000)
//                             key[1].active_start = (new Date()).getTime()
//                         }
//                     }
//
//                     this.emit("onShutdown")
//                     this.server = null
//                 })
//
//                 return "Server has been started"
//             } catch (e) {
//                 console.log("Server start failed")
//             }
//         } else {
//             return "Cannot start server. Server is already started."
//         }
//     }
//
//     async getOnlinePlayers() {
//         let command = (await this.sendCommand("list")).toString().replace("]: There are ", ",,").replace(" of a max of ", ",,").replace(" players online: ", ",,").split(",,")
//         return {
//             online: parseInt(command[1]),
//             total: parseInt(command[2]),
//             players: command[3].split(", ")
//         }
//     }
// }

let bank = new Bank()

// Setup banner expirer
// setInterval(() => {
//     for (let player of CrashBotUser.map) {
//         for (let banner of player[1].banners) {
//             if (banner.expire + 1814400000 < (new Date).getTime()) {
//                 // Expire the banner
//                 player[1].banners.splice(player[1].banners.indexOf(banner), 1)
//             }
//         }
//     }
// }, 86400000)

let resources = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/json/bank_backup.json").toString())
for (let resource of resources) {
    console.log(resource)
    bank.addTradeResource(new BankResource(resource.name, resource.tag_name, resource.stock, resource.max_inventory, resource.baseline_price))
}

for (let resource of bank.resources) {
    console.log(resource.calculateWorth())
}

// mcServer.on("onPlayerConnect", player => {
//     wss.broadcast(JSON.stringify({
//         action: "player_connected",
//         player_name: player.username
//     }))
//     update_status()
// })
// mcServer.on("onPlayerDisconnect",  player => {
//     wss.broadcast(JSON.stringify({
//         action: "player_disconnected",
//         player_name: player.player_name
//     }))
//     update_status()
//
//     let key
//     for (let _player of CrashBotUser.map) {
//         if (_player[1].player_name === player.player_name) {
//             key = _player
//             break
//         }
//     }
//
//     if (key) {
//         key[1].active = false
//         key[1].active_time += Math.round(((new Date()).getTime() - key[1].active_start) / 1000)
//         key[1].active_start = (new Date()).getTime()
//     }
// })

// const backup = schedule.scheduleJob("0 0 * * *", () => {
//     mcServer.sendCommand("save-all")
// })
// setTimeout(() => {
//     performResourcePackUpgrade()
// }, 120000)

// setTimeout(() => {
//     create_backup()
// }, 30000)

let app = express()
let httpServer = http.createServer(app).listen(8080)
let httpsServer = https.createServer({
    key: fs.readFileSync(path.resolve("./") + "/assets/ssl/privkey.pem"),
    cert: fs.readFileSync(path.resolve("./") + "/assets/ssl/fullchain.pem")
}, app).listen(8050)
// enable files upload
app.use(fileUpload({
    createParentPath: true,
    useTempFiles: true,
    limits: {fileSize: 50 * 1024 * 1024}
}));

app.get("/home/:key", async (req, res) => {
    let html
    if (await CrashBotUser.CheckKey(req.params.key)) {
        let user = new CrashBotUser(req.params.key)
        await user.get()
        html = fs.readFileSync(path.resolve("./") + "/assets/html/index.html").toString().replace(/:keyhere:/g, req.params.key).replace(/\[owned]/g, JSON.stringify(await user.getOwned())).replace(/:username:/g, user.data["player_name"])
    }
    else {
        html = "Invalid key"
    }
    // console.log(html)
    res.send(html)
})

// app.get("/triggerUpdate", async (req, res) => {
//     if (await performResourcePackUpgrade()) {
//         res.send("Upgrade successful")
//     } else {
//         res.send("Nothing to upgrade")
//     }
// })

app.post("/", async (req, res) => {
    // console.log("picked up a post")
    // console.log(req.files)
    console.log("Broadcasting change...")
    console.log(req.body)
    let user = new CrashBotUser(req.body.key)
    await user.get()
    wss.broadcast(JSON.stringify({
        action: "lock",
        path: req.body.location,
        user: user.data.player_name,
        avatar: user.data.avatar_url
    }))

    let output = path.resolve("./") + "/assets/pack" + req.body.location
    if (output.endsWith(".fsb") || output.endsWith(".ogg")) {
        if (typeof req.body.yturi === "undefined") {
            try {
                fs.unlinkSync(output)
            } catch (e) {
            }
            output = output.replace(".fsb", ".ogg")
            await user.addOwnership(req.body.location.replace(".fsb", ".ogg"))

            let file = req.files?.file as UploadedFile
            file.mv(file.tempFilePath + file.name).then(r => {
                ffmpeg(file.tempFilePath + file.name)
                    .output(output)
                    .audioChannels(1)
                    .audioBitrate("112k")
                    .audioQuality(3)
                    .audioFrequency(22050)
                    .on("end", () => {
                        wss.broadcast(JSON.stringify({
                            action: "unlock",
                            path: req.body.location,
                            user: user.data.player_name,
                            avatar: user.data.avatar_url
                        }))

                        pack_updated = true
                        res.send("OK!")
                    })
                    .on("error", err => {
                        console.log(err)
                        res.send(err.toString())
                    })
                    .run()
            })
        }
        else {
            try {
                let video_info = await ytdl.getInfo(ytdl.getURLVideoID(req.body.yturi))

                if (parseInt(video_info.videoDetails.lengthSeconds) >= 420) {
                    res.send("TOO LONG")
                }
                else {
                    try {
                        fs.unlinkSync(output)
                    } catch (e) {
                    }
                    output = output.replace(".fsb", ".ogg")
                    await user.addOwnership(req.body.location.replace(".fsb", ".ogg"))

                    let stream = ytdl(req.body.yturi)

                    let proc = ffmpeg({source: stream})
                        .output(output)
                        .audioChannels(1)
                        .audioBitrate("112k")
                        .audioQuality(3)
                        .on("end", () => {
                            pack_updated = true
                            wss.broadcast(JSON.stringify({
                                action: "unlock",
                                path: req.body.location,
                                user: user.data.player_name,
                                avatar: user.data.avatar_url
                            }))
                        })
                        .on("error", err => {
                            console.log(err)
                        })
                        .noVideo()
                        .run()

                    res.end("OK!")
                }
            } catch (e) {
                res.send("UNKNOWN ERROR")
            }

        }
    }
    else if (output.endsWith(".png") || output.endsWith(".jpg")) {
        output.replace(".jpg", ".png")
        let file = req.files?.file as UploadedFile
        file.mv(file.tempFilePath + file.name).then(r => {
            ffmpeg(file.tempFilePath + file.name)
                .output(output)
                .on("end", () => {
                    pack_updated = true
                    wss.broadcast(JSON.stringify({
                        action: "unlock",
                        path: req.body.location,
                        user: user.data.player_name,
                        avatar: user.data.avatar_url
                    }))
                    res.send("OK!")
                })
                .on("error", err => {
                    console.log(err)
                    res.send(err.toString())
                })
                .run()
        })
    }
    else if (output.endsWith(".json")) {
        if (req.body.json.length > 34275800) {
            res.end("ERROR: JSON is too long")
        }
        else {
            try {
                // Check that JSON is valid
                let data = JSON.parse(req.body.json)

                fs.writeFileSync(output, req.body.json)

                wss.broadcast(JSON.stringify({
                    action: "unlock",
                    path: req.body.location,
                    user: user.data.player_name,
                    avatar: user.data.avatar_url
                }))

                res.send("OK!")
            } catch (e) {
                res.end("ERROR: Unknown")
            }
        }
    }
})

app.post("/reset", async (req, res) => {
    // console.log("picked up a post")
    // console.log(req.files)

    let user = new CrashBotUser(req.body.key)
    await user.get()

    wss.broadcast(JSON.stringify({
        action: "lock",
        path: req.body.location,
        user: user.data.player_name,
        avatar: user.data.avatar_url
    }))

    let cur_file = path.resolve("./") + "/assets/pack" + req.body.location
    let or_file_search = req.body.location.replace(".fsb", "").replace(".ogg", "").replace(".png", "")

    // Find the original file
    let or_file
    if (fs.existsSync(path.resolve("./") + "/assets/default_pack" + or_file_search + ".fsb")) {
        or_file = path.resolve("./") + "/assets/default_pack" + or_file_search + ".fsb"
    }
    else if (fs.existsSync(path.resolve("./") + "/assets/default_pack" + or_file_search + ".png")) {
        or_file = path.resolve("./") + "/assets/default_pack" + or_file_search + ".png"
    }
    else if (fs.existsSync(path.resolve("./") + "/assets/default_pack" + or_file_search + ".tga")) {
        or_file = path.resolve("./") + "/assets/default_pack" + or_file_search + ".tga"
    }
    if (!or_file) {
        res.send("CANNOT FIND DEFAULT")
        return false
    }

    fs.unlinkSync(cur_file)
    fs.copyFileSync(or_file, or_file.replace("default_pack", "pack"))

    // Remove item from owned
    try {
        let ownership = await FindOwnership(req.body.location)
        await SafeQuery(`DELETE
                         FROM dbo.OwnedItems
                         WHERE own_id = @ownid`, [{
            name: "ownid",
            type: mssql.TYPES.VarChar(200),
            data: ownership.own_id
        }])
    } catch (e) {
    }

    wss.broadcast(JSON.stringify({
        action: "file_reset",
        path: req.body.location,
        user: user.data.player_name,
        avatar: user.data.avatar_url
    }))
    res.send("OK!")
})

app.post("/newthrow", async (req, res) => {
    try {
        let player = new CrashBotUser(req.body.key)
        await player.get()
        let meme = JSON.parse(req.body.data)
        console.log(meme)
        let id = makeid(5)
        meme.location = id + "." + meme.extension
        meme.verified = false

        let file = req.files?.file as UploadedFile
        file.mv(path.resolve("./") + "/assets/throw/" + meme.location).then(() => {
            delete meme.extension
            let memes = fetchThrowTemplates()
            memes.push(meme)
            fs.writeFileSync(path.resolve("./") + "/assets/throw/memes.json", JSON.stringify(memes))

            client.channels.fetch("894766287044096090").then(async _channel => {
                let channel = _channel as TextChannel
                // @ts-ignore
                generateThrow(await (await client.guilds.fetch("892518158727008297")).me.fetch(), (await client.guilds.cache.get("892518158727008297").members.fetch("689226786961489926")), meme.location).then(_meme => {
                    channel?.send({
                        content: "This new template from <@" + player.data.discord_id + "> needs to be verified.",
                        files: [
                            new Discord.MessageAttachment(_meme.file as string)
                        ],
                        components: [
                            new Discord.MessageActionRow()
                                .addComponents(
                                    new Discord.MessageButton()
                                        .setCustomId("verify_throw_" + meme.location)
                                        .setStyle("PRIMARY")
                                        .setLabel("Verify")
                                        .setEmoji("👍")
                                )
                        ]
                    }).then(() => {
                        res.send(JSON.stringify({
                            id: meme.location
                        }))
                    })
                }).catch(e => {
                    console.log(e)
                    res.send(JSON.stringify({
                        e: e
                    }))
                })
            })
        })
    } catch (e) {
        console.log(e)
        res.send(JSON.stringify({
            e: e
        }))
    }
})

// app.post("/addOwnership/:key", (req, res) => {
//     CrashBotUser.saveOwnership(req.params.key, req.body.fileLocation)
//     res.send(req.body.fileLocation + " has been given to " + req.params.key)
// })
// app.post("/removeClaim", (req, res) => {
//     // req.body.key
//     // req.body.fileLocation
//
//     // Search for the default
//     let path_array = req.body.fileLocation.split("/")
//     let file = path_array[path_array.length]
//     let folder = req.body.fileLocation.replace
// })

app.post("/trade/bank", async (req, res) => {
    res.send("Trading is currently unavailable")
    // let player = new CrashBotUser(req.body.key)
    // await player.get()
    // if (req.body.type === "for_coin") {
    //     // Get resource
    //     let out_resource
    //     for (let resource of bank.resources) {
    //         if (resource.tag_name === req.body.resource) {
    //             out_resource = resource
    //             break
    //         }
    //     }
    //
    //     if (typeof out_resource === "undefined") {
    //         res.send("Invalid resource")
    //     } else {
    //         let gained_coins = out_resource.calculateWorth()
    //
    //         // Remove resource from inventory
    //         console.log(`clear ${player.player_name} ${out_resource.tag_name} 1`)
    //         let command
    //         if (typeof req.body.all !== "undefined") {
    //             command = `clear ${player.player_name} ${out_resource.tag_name}`
    //         } else {
    //             command = `clear ${player.player_name} ${out_resource.tag_name} 0 1`
    //         }
    //         let result = await mcServer.sendCommand(command)
    //         if (!result.startsWith("Cleared the inventory")) {
    //             res.send("Trade failed")
    //         } else {
    //             if (typeof req.body.all !== "undefined") {
    //                 let count = parseInt(result.replace(`Cleared the inventory of ${player.player_name}, removing `, "").replace(" items", ""))
    //                 gained_coins *= count
    //                 player.currency += gained_coins
    //                 out_resource.addToStock(count)
    //                 mcServer.sendCommand(`tellraw ${player.player_name} {"rawtext":[{"text":"§a§lThe Bank"},{"text":"§r§l has given you "},{"text":"§a§l${gained_coins} coin(s)"}]}`)
    //                 wss.updateBank()
    //                 res.send("Trade successful")
    //             } else {
    //                 player.currency += gained_coins
    //                 out_resource.addToStock(1)
    //                 mcServer.sendCommand(`tellraw ${player.player_name} {"rawtext":[{"text":"§a§lThe Bank"},{"text":"§r§l has given you "},{"text":"§a§l${gained_coins} coin(s)"}]}`)
    //                 wss.updateBank()
    //                 res.send("Trade successful")
    //             }
    //         }
    //     }
    // } else if (req.body.type === "for_resource") {
    //     // Get resource
    //     let out_resource
    //     for (let resource of bank.resources) {
    //         if (resource.tag_name === req.body.resource) {
    //             out_resource = resource
    //             break
    //         }
    //     }
    //
    //     if (typeof out_resource === "undefined") {
    //         res.send("Invalid resource")
    //     } else {
    //         let cost = Math.round(out_resource.calculateWorth() * 1.1)
    //         if (player.currency < cost) {
    //             res.send("Trade failed; Not enough money")
    //         } else {
    //             if ((await mcServer.sendCommand(`give ${player.player_name} ${out_resource.tag_name}`)).startsWith("Gave")) {
    //                 player.currency -= cost
    //                 out_resource.removeFromStock(1)
    //                 mcServer.sendCommand(`tellraw ${player.player_name} {"rawtext":[{"text":"§a§lThe Bank"},{"text":"§r§l has given you "},{"text":"§a§l1x ${out_resource.name}"}]}`)
    //                 wss.updateBank()
    //                 res.send("Trade successful")
    //             } else {
    //                 res.send("Trade failed. Bank trades require you to be connected to the server.")
    //             }
    //         }
    //     }
    // }
})

app.post("/trade/player", async (req, res) => {
    res.send("Player trading has been removed due to changes in background processing.")
})

app.get("/list", (req, res) => {
    res.set({
        'Content-Type': 'application/json'
    });
    res.send(JSON.stringify(dirTree(path.resolve("./") + "/assets/pack")))
})

app.get("/assets/search", (req, res) => {
    res.set({
        'Content-Type': 'application/json'
    });
    res.send(JSON.stringify(
        searchIndex.filter(item => {
            return item.replace(req.query.search as string, "").length !== item.length
        })
    ))
})

app.get("/lol.zip", async (req, res) => {
    let name = Math.floor(Math.random() * 100000000).toString() + "_lol.zip"
    console.log(name)
    await buildPack(name, res)
    try {
        res.end()
    } catch (e) {
    }
    // res.sendFile(path.resolve("./") + "/" + name, (err) => {
    //     // Delete the temporary file
    //     fs.unlinkSync(path.resolve("./") + "/" + name)
    // })
})

// app.get("/capitalisim.zip", async (req, res) => {
//     // Setup the code for when the backup is running
//     let manageBackup = data => {
//         data.stream.pipe(res)
//         mcServer.removeListener("onBackupReadStream", manageBackup)
//     }
//     mcServer.on("onBackupReadStream", manageBackup)
//     mcServer.sendCommand("save-all")
// })

app.get("/assets/*", (req, res) => {
    if (req.url.endsWith(".mp3")) {
        console.log("Live converting mp3...")
        console.log(req.headers)
        let output = Math.floor(Math.random() * 10000000000).toString() + "_temp.mp3"
        res.set({
            'Content-Type': 'audio/mpeg',
            "Keep-Alive": "timeout=15, max=120"
        });
        // res.set("Content-Disposition", "attachment")
        ffmpeg(path.resolve("./") + "/assets/pack" + req.url.replace("/assets", "").replace(".mp3", ".ogg"))
            .format("mp3")
            .audioBitrate(96)
            .output(res, {end: true})
            .outputOption(["-frag_duration 100", "-movflags frag_keyframes+faststart"])
            .on("error", err => {
                console.log(err)
                try {
                    res.send(err.toString())
                } catch (e) {
                }
            })
            .run()
    }
    else if (req.url.endsWith(".wav")) {
        console.log("Live converting wav...")
        console.log(req.headers)
        let output = Math.floor(Math.random() * 10000000000).toString() + "_temp.wav"
        res.set({
            'Content-Type': 'audio/x-wav',
            "Keep-Alive": "timeout=15, max=120"
        });
        // res.set("Content-Disposition", "attachment")
        ffmpeg(path.resolve("./") + "/assets/pack" + req.url.replace("/assets", "").replace(".wav", ".ogg"))
            .format("wav")
            .output(res, {end: true})
            .on("error", err => {
                console.log(err)
                try {
                    console.log(err)
                    res.send(err.toString())
                } catch (e) {
                }
            })
            .run()
    }
    else if (fs.lstatSync(path.resolve("./") + "/assets/pack" + req.url.replace("/assets", "")).isDirectory()) {
        res.set("Content-Type", "application/json")
        let file_location = path.resolve("./") + "/assets/pack" + req.url.replace("/assets", "")
        if (file_location.slice(-1) !== "/") {
            file_location += "/"
        }

        let files = fs.readdirSync(file_location).map(item => {
            if (fs.lstatSync(file_location + item).isDirectory()) {
                return {
                    name: item,
                    directory: 1
                }
            }
            return {
                name: item,
                directory: 0,
                size: fs.statSync(file_location + item).size
            }
        })

        files = files.sort((a, b): number => {
            if (a.directory === b.directory) {
                return a.name > b.name ? 1 : -1
            }
            return a.directory > b.directory ? 1 : -1
        })

        res.send(JSON.stringify(files))
    }
    else {
        try {
            res.sendFile(path.resolve("./") + "/assets/pack" + req.url.replace("/assets", ""))
        } catch (e) {
            console.log(e)
        }
    }
})

app.get("/web_assets/*", (req, res) => {
    try {
        res.sendFile(path.resolve("./") + "/assets/html/web_assets" + req.url.replace("/web_assets", ""))
    } catch (e) {
        console.log(e)
    }
})

app.get("/favicon.ico", (req, res) => {
    res.sendFile(path.resolve("./") + "/assets/favicon.ico")
})

// app.get("/createNewKey/:player_name", (req, res) => {
//     let key = CrashBotUser.NewKey(req.params.player_name)
//     res.send("player name is " + req.params.player_name + ". Key is: " + key)
// })

app.post("/vote/:id", (req, res) => {

})

app.get("/memories/fetch/channel/:channelid/*.zip", async (req, res) => {
    console.log("Inserting data into SQL database...")
    console.log(req.params)

    // Clear old backups
    let archive = archiver('zip');
    let parent = this

    archive.on('error', function (err) {
        console.log(err)

    });

    archive.pipe(res);


    // await client.login("ODkyNTM1ODY0MTkyODI3Mzky.GBe_2E.iFchqslODvFaIimIiD0itIz_INcU-U_YgSbMfc")
    let memories
    if (req.params.channelid === "all") {
        memories = await SafeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)`)
    }
    else {
        memories = await SafeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)
                                      AND channel_id = '${req.params.channelid}'`)
    }
    let queue = new QueueManager(8)
    for (let memory of memories.recordset) {
        if (memory.type === 0) {
            let extension = memory.data.split(".")[memory.data.split(".").length - 1]
            if (extension === "jpg" || extension === "jpeg" || extension === "png") {
                queue.pushToQueue(downloadDiscordAttachmentWithInfo, [memory.msg_id, memory.channel_id, "https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            }
            else {
                queue.pushToQueue(downloadDiscordAttachment, ["https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            }
        }
        else {
            // console.log([memory.data, archive])
            queue.pushToQueue(download_ytdl, [memory.data, archive])
        }
    }
    await queue.start()

    archive.finalize()
})
app.get("/memories/fetch/user/:userId/*.zip", async (req, res) => {
    console.log("Inserting data into SQL database...")
    console.log(req.params)

    // Clear old backups
    let archive = archiver('zip');
    let parent = this

    archive.on('error', function (err) {
        console.log(err)

    });

    archive.pipe(res);


    // await client.login("ODkyNTM1ODY0MTkyODI3Mzky.GBe_2E.iFchqslODvFaIimIiD0itIz_INcU-U_YgSbMfc")
    let memories
    if (req.params.userId === "all") {
        memories = await SafeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)`)
    }
    else {
        memories = await SafeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)
                                      AND author_discord_id = '${req.params.userId}'`)
    }
    console.log(memories)
    let queue = new QueueManager(8)
    queue.auto_start = false
    for (let memory of memories.recordset) {
        console.log(memory)
        if (memory.type === 0) {
            let extension = memory.data.split(".")[memory.data.split(".").length - 1]
            if (extension === "jpg" || extension === "jpeg" || extension === "png") {
                queue.pushToQueue(downloadDiscordAttachmentWithInfo, [memory.msg_id, memory.channel_id, "https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            }
            else {
                queue.pushToQueue(downloadDiscordAttachment, ["https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            }
        }
        else {
            queue.pushToQueue(download_ytdl, [memory.data, archive])
        }
    }
    await queue.start()

    archive.finalize()
})

// app.get("/playSound/:sound", (req, res) => {
//     mcServer.sendCommand("tellraw @a {\"rawtext\":[{\"text\":\"Now queuing; SOUND HERE\"}]}")
//     mcServer.avoid_discord = true
//
//     let map = sound_mappings[req.params.sound]
//     let audio_path
//     if (typeof map.sounds[0] === "string") {
//         audio_path = map.sounds[0]
//     } else {
//         audio_path = map.sounds[0].name
//     }
//
//     // Convert to .dat
//     let convert = spawn("/usr/bin/audiowaveform", ["-i", path.resolve("./") + "/assets/pack/" + audio_path + ".ogg", "-o", "track.dat", "-b", "8", "-z", "256"], {cwd: path.resolve("./")})
//     convert.on("close", () => {
//         // Get length of the track
//         getAudioDurationInSeconds(path.resolve("./") + "/assets/pack/" + audio_path + ".ogg").then(async duration => {
//             let ticks = Math.round(duration / 0.2)
//             let wave = WaveformData.create(toArrayBuffer(fs.readFileSync("/home/ubscontrol/resource_pack_creator/track.dat")))
//             const resampledWaveform = wave.resample({width: ticks});
//             const channel = resampledWaveform.channel(0);
//             let min_channel = channel.min_array()
//             let max_channel = channel.max_array()
//             let i = 0
//
//             await wait(1000 + Math.floor(Math.random() * 5000))
//             mcServer.sendCommand("execute @a ~ ~ ~ playsound " +  req.params.sound + " @a")
//             let interval = setInterval(() => {
//                 let commands = []
//                 // Calculate black area at top
//                 commands.push(`fill 1422 84 -551 1409 ${81 + Math.round(3 * (max_channel[i] / 100))} -551 concrete 15`)
//
//                 // Calculate bar area
//                 commands.push(`fill 1422 ${80 + Math.round(3 * (max_channel[i] / 100))} -551 1409 ${80 - Math.round(3 * (min_channel[i] / 100))} -551 concrete 4`)
//
//                 // Calculate black area at bottom
//                 commands.push(`fill 1422 77 -551 1409 ${79 - Math.round(3 * (min_channel[i] / 100))} -551 concrete 15`)
//
//                 mcServer.sendCommand(commands.join("\n"))
//                 i += 1
//                 if (i === max_channel.length) {
//                     mcServer.avoid_discord = false
//                     console.log("track finished")
//                     clearInterval(interval)
//                 }
//             }, 200)
//         })
//     })
// })

// let http_serv = app.listen(port, () => {
//     console.log(`Listening on port ${port}`)
// })


// PACK MAKER API:
app.get("/packs", async (req, res) => {
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify((await SafeQuery("SELECT pack_id, pack_name, \"public\" FROM dbo.Packs")).recordset))
})
app.get("/packs/:packid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT pack_id, pack_name, \"public\" FROM dbo.Packs WHERE pack_id = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    if (data.recordset.length === 1) res.send(JSON.stringify(data.recordset[0]))
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/file.zip", async (req, res) => {
    // Convert the resource pack to a .mcpack file
    (await generatePackArchive(req.params.packid, false, "zip")).pipe(res)
})

app.get("/packs/:packid/blocks", async (req, res) => {
    let data = await SafeQuery("SELECT BlockID, GameID, SoundGroupID FROM dbo.PackBlocks WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await SafeQuery("SELECT TextureGroupID, Type FROM dbo.PackBlockTextures WHERE BlockID = @blockid AND PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
            {name: "blockid", type: mssql.TYPES.Int(), data: item.BlockID}
        ])
        item.texture_groups = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/blocks/:blockid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT BlockID, GameID, SoundGroupID FROM dbo.PackBlocks WHERE PackID = @id AND BlockID = @blockid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "blockid", type: mssql.TYPES.Int(), data: parseInt(req.params.blockid)}
    ])
    if (data.recordset.length === 1) {
        data.recordset[0].texture_groups = (await SafeQuery("SELECT TextureGroupID, Type FROM dbo.PackBlockTextures WHERE BlockID = @blockid AND PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
            {name: "blockid", type: mssql.TYPES.Int(), data: parseInt(req.params.blockid)}
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/entities", async (req, res) => {
    let data = await SafeQuery("SELECT EntityID, identifier, SoundGroupID, InteractiveSoundGroupID FROM dbo.PackEntities WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await SafeQuery("SELECT TextureID, Type FROM dbo.PackEntityTextures WHERE EntityID = @entity", [
            {name: "entity", type: mssql.TYPES.Int(), data: item.EntityID}
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/entities/:entityid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT EntityID, identifier, InteractiveSoundGroupID, SoundGroupID FROM dbo.PackEntities WHERE PackID = @id AND EntityID = @entityid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "entityid", type: mssql.TYPES.Int(), data: parseInt(req.params.entityid)}
    ])
    if (data.recordset.length === 1) {
        // Find textures
        data.recordset[0].textures = (await SafeQuery("SELECT TextureID, Type FROM dbo.PackEntityTextures WHERE EntityID = @entity", [
            {name: "entity", type: mssql.TYPES.Int(), data: data.recordset[0].EntityID}
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/textures/groups", async (req, res) => {
    let data = await SafeQuery("SELECT TextureGroupID, GameID, type FROM dbo.PackTextureGroups WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id ORDER BY Position ASC", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.TextureGroupID)},
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/textures/groups/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT TextureGroupID, GameID, type FROM dbo.PackTextureGroups WHERE PackID = @id AND TextureGroupID = @groupid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int(), data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].textures = (await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id ORDER BY Position ASC", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].TextureGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/textures/", async (req, res) => {
    let data = await SafeQuery("SELECT TextureID, TextureGroupID, Position, OverlayColor FROM dbo.PackTextures WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/textures/:textureid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT TextureID, TextureGroupID, Position, OverlayColor FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int(), data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.post("/packs/:packid/textures/:textureid/upload", async (req, res) => {
    let file = req.files?.file as UploadedFile
    if (!file) {
        res.send("No file attached")
        return
    }
    else if (file.name.endsWith(".png")) {
        res.send("PNGs only")
        return
    }

    file.mv(path.join(path.resolve("./"), "assets", "pack_textures", req.params.textureid.toString() + ".png")).then(r => {
        res.send("OK!")
    })
})

app.get("/packs/:packid/textures/:textureid/stream", async (req, res) => {
    let data = await SafeQuery("SELECT TextureID, DefaultFile FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int(), data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        let _path = path.join(path.resolve("./"), "assets", "pack_textures", data.recordset[0].TextureID.toString() + ".png")
        if (fs.existsSync(_path)) res.sendFile(_path)
        else res.sendFile(path.join(path.resolve("./"), "assets", "pack", data.recordset[0].DefaultFile + ".png"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/textures/:textureid/stream/original", async (req, res) => {
    let data = await SafeQuery("SELECT TextureID, DefaultFile FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int(), data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        res.sendFile(path.join(path.resolve("./"), "assets", "pack", data.recordset[0].DefaultFile + ".png"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/groups", async (req, res) => {
    let data = await SafeQuery("SELECT SoundGroupID, pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type FROM dbo.PackSoundGroups WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find sound events
        let events = await SafeQuery("SELECT EventID, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID, EventType FROM dbo.PackSoundGroupEvents WHERE SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.SoundGroupID)},
        ])
        item.events = events.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/sounds/groups/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundGroupID, pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type FROM dbo.PackSoundGroups WHERE PackID = @id AND SoundGroupID = @groupid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int(), data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].events = (await SafeQuery("SELECT EventID, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID, EventType FROM dbo.PackSoundGroupEvents WHERE SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].SoundGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/definitions", async (req, res) => {
    let data = await SafeQuery("SELECT SoundDefID, Name FROM dbo.PackSoundDefinitions WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find sounds
        let sounds = await SafeQuery("SELECT SoundID, is3D, volume, pitch, weight FROM dbo.PackSounds WHERE SoundDefID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.SoundDefID)},
        ])
        item.sounds = sounds.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/sounds/definitions/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundDefID, Name FROM dbo.PackSoundDefinitions WHERE PackID = @id AND SoundDefID = @groupid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int(), data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].sounds = (await SafeQuery("SELECT SoundID, is3D, volume, pitch, weight FROM dbo.PackSounds WHERE SoundDefID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].SoundDefID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/", async (req, res) => {
    let data = await SafeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight, enabled FROM dbo.PackSounds WHERE PackID = @id; SELECT @@IDENTITY AS NewID", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.post("/packs/:packid/sounds/", express.json(), async (req, res) => {
    let requirements = ["SoundDefID", "is3D", "volume", "pitch", "weight", "enabled"]
    for (let item of requirements) if (typeof req.body[item] === "undefined") {
        res.status(400)
        res.send("Missing parameter: " + item)
        return
    }

    let data: mssql.IResult<{ NewID: string }> = await SafeQuery("INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch, weight, enabled, PackID) VALUES (@sounddef, @is3D, @volume, @pitch, @weight, @enabled, @packid); SELECT @@IDENTITY AS NewID;", [
        {name: "sounddef", type: mssql.TYPES.Int(), data: req.body.SoundDefID},
        {name: "is3D", type: mssql.TYPES.Bit(), data: req.body.is3D},
        {name: "volume", type: mssql.TYPES.Int(), data: req.body.volume},
        {name: "pitch", type: mssql.TYPES.Int(), data: req.body.pitch},
        {name: "weight", type: mssql.TYPES.Int(), data: req.body.weight},
        {name: "enabled", type: mssql.TYPES.Int(), data: req.body.enabled},
        {name: "packid", type: mssql.TYPES.Int(), data: req.params.packid}
    ])
    res.setHeader("content-type", "application/json")
    console.log(data)
    res.send(JSON.stringify({
        SoundID: data.recordsets[0][0].NewID
    }))
})

app.post("/packs/:packid/sounds/:soundid", express.json(), async (req, res) => {
    let requirements = ["SoundDefID", "is3D", "volume", "pitch", "weight", "enabled"]
    for (let item of requirements) if (typeof req.body[item] === "undefined") {
        res.status(400)
        res.send("Missing parameter: " + item)
        return
    }

    let data = await SafeQuery("UPDATE CrashBot.dbo.PackSounds SET SoundDefID = @sounddef, is3D = @is3D, volume = @volume, pitch = @pitch, weight = @weight, enabled = @enabled WHERE SoundID = @id", [
        {name: "sounddef", type: mssql.TYPES.Int(), data: req.body.SoundDefID},
        {name: "is3D", type: mssql.TYPES.Bit(), data: req.body.is3D},
        {name: "volume", type: mssql.TYPES.Int(), data: req.body.volume},
        {name: "pitch", type: mssql.TYPES.Int(), data: req.body.pitch},
        {name: "weight", type: mssql.TYPES.Int(), data: req.body.weight},
        {name: "enabled", type: mssql.TYPES.Int(), data: req.body.enabled},
        {name: "id", type: mssql.TYPES.Int(), data: req.params.soundid}
    ])
    res.setHeader("content-type", "application/json")
    console.log(data)
    res.send(JSON.stringify({
        SoundID: req.params.soundid
    }))
})

app.post("/packs/:packid/sounds/:soundid/upload", async (req, res) => {
    console.log(req)
    let file = req.files?.file as UploadedFile
    if (typeof file === "undefined") {
        res.status(400)
        res.send("File not attached")
        return
    }

    if (!(file.name.endsWith(".mp3") || file.name.endsWith(".wav"))) {
        res.send(400)
        res.send("Unsupported file type")
    }

    let output = path.join(path.resolve("./"), "assets", "pack_sounds", req.params.soundid + ".ogg")
    if (fs.existsSync(output)) fs.unlinkSync(output)
    let name = file.name.split(".")
    let location = file.tempFilePath + "." + name[name.length - 1]
    file.mv(location).then(r => {
        console.log("TRANSPOSING")
        ffmpeg(location)
            .output(output)
            .audioChannels(1)
            .audioBitrate("112k")
            .audioQuality(3)
            .audioFrequency(22050)
            .on('end', () => {
                res.send("OK!")
            })
            .on("error", (e) => {
                console.log(e)
            })
            .run()
    })
})

app.post("/packs/:packid/sounds/:soundid/ytupload", express.json(), async (req, res) => {
    console.log(req.body)
    let video_info = await ytdl.getInfo(ytdl.getURLVideoID(req.body.yturi))

    if (parseInt(video_info.videoDetails.lengthSeconds) > 420) {
        res.send("TOO LONG")
        return
    }
    let output = path.join(path.resolve("./"), "assets", "pack_sounds", req.params.soundid + ".ogg")

    if (fs.existsSync(output)) fs.unlinkSync(output)

    let stream = await ytdl(req.body.yturi, {quality: "highestaudio"})
    console.log(stream)
    ffmpeg(stream)
        .output(output)
        .audioChannels(1)
        .audioBitrate("112k")
        .audioQuality(3)
        .on("end", () => {
            console.log("OK")
        })
        .on("error", (e) => {
            console.log(e)
        })
        .noVideo()
        .run()
    res.send("OK")
})

app.get("/packs/:packid/sounds/:soundid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight, enabled FROM dbo.PackSounds WHERE PackID = @id AND SoundID = @soundid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "soundid", type: mssql.TYPES.Int(), data: parseInt(req.params.soundid)}
    ])

    if (data.recordset.length === 1) {
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/:soundid/stream", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight FROM dbo.PackSounds WHERE PackID = @id AND SoundID = @soundid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "soundid", type: mssql.TYPES.Int(), data: parseInt(req.params.soundid)}
    ])

    if (data.recordset.length === 1) {
        let _path = path.join(path.resolve("./"), "assets", "pack_sounds", data.recordset[0].SoundID.toString() + ".ogg")
        if (fs.existsSync(_path)) res.sendFile(_path)
        else res.sendFile(path.join(path.resolve("./"), "assets", "pack_sounds", "template.mp3"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/items/", async (req, res) => {
    let data = await SafeQuery("SELECT ItemID, TextureGroupID, GameID FROM dbo.PackItems WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])

    for (let item of data.recordset) {
        // Find sound events
        let textures = await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.TextureGroupID)},
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/items/:itemid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT ItemID, TextureGroupID, GameID FROM dbo.PackItems WHERE PackID = @id AND ItemID = @itemid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "itemid", type: mssql.TYPES.Int(), data: parseInt(req.params.itemid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].textures = (await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].TextureGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/languages/items", async (req, res) => {
    if (req.query.language) {
        console.log(req.query.language)
        let languages = await SafeQuery("SELECT * FROM dbo.PackLanguages WHERE PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: req.params.packid}
        ])

    }
    else {
        let language_items = (await SafeQuery("SELECT * FROM dbo.PackLanguageItems WHERE PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: req.params.packid}
        ])).recordset

        let out: any = {}
        for (let item of language_items) {
            if (!out[item.GameItem]) out[item.GameItem] = {}
            out[item.GameItem][item.LanguageID] = item.Text
        }
        res.header("content-type", "application/json")
        res.send(JSON.stringify(out))
    }
})


let wss = new WSS(httpServer, httpsServer)

// wss.on("connection", ws => {
//     ws.on("message", async (msg: any) => {
//         let data = JSON.parse(msg.toString())
//         if (data.action === "fetch_bank_data") {
//             let player = new CrashBotUser(data.key)
//             await player.get()
//             ws.key = data.key
//             let data_output = {
//                 "action": "bank_update",
//                 "data": {
//                     "currency": player.currency,
//                     "players": await CrashBotUser.listplayer_names(),
//                     "available_resources": bank.resources.map(resource => {
//                         return {
//                             name: resource.name,
//                             tag_name: resource.tag_name,
//                             stock: resource.stock,
//                             max_stock: resource.max_inventory,
//                             worth: resource.calculateWorth()
//                         }
//                     })
//                 }
//             }
//             ws.send(JSON.stringify(data_output))
//         }
//     })
// })

client.on("ready", async () => {
    client.user?.setActivity("Experiencing MSSQL issues. Please expect bugs.", {
        name: "Experiencing MSSQL issues. Please expect bugs.",
        type: 4
    })
    // client.channels.fetch("892518365766242375")
    //     .then(channel => {
    //         // let embed = new Discord.MessageEmbed()
    //         // embed.setTitle("QUEST UNLOCKED!")
    //         // embed.setDescription("Ruin Post Validator's day by continuously pinging it.")
    //         // embed.setFooter("WARNING: Foul language")
    //         // embed.addField("")
    //
    //         SafeQuery("UPDATE CrashBot.dbo.Users SET experimentBabyWords = TRUE WHERE 1=1")
    //         channel.send({
    //             content: "@here HELP! Post Validator has stole the CrashBotUser to baby speak and enabled it for everyone! Let's ping the f\\*k out of them!"
    //         })
    //     })

    client.channels.fetch("892518396166569994").then(channel => {
        console_channel = channel
    })

    client.channels.fetch("968298113427206195").then(channel => {
        chat_channel = channel
    })

    client.application?.commands.create({
        name: "fetch_d2_item",
        description: "Fetch info about any item, quest, mod, etc in D2",
        options: [{
            type: 3,
            name: "name",
            description: "The name of the item you are looking for",
            required: true
        }]
    })

    client.application?.commands.create({
        name: "ask-gpt",
        description: "Ask ChatGPT a question",
        options: [{
            type: 3,
            name: "message",
            description: "What would you like to ask ChatGPT?",
            required: true
        }]
    })

    client.application?.commands.create({
        name: "tldr",
        description: "Too long, didn't read",
        options: [{
            type: 4,
            required: false,
            name: "hours",
            description: "Number of hours you'd like to look back and summarise (default; 24 hrs)",
        }]
    })

    client.application?.commands.create({
        name: "fetch_d2_activity",
        description: "Fetch info about any activity in D2",
        options: [{
            type: 3,
            name: "name",
            description: "The name of the activity you are looking for",
            required: true
        }]
    })

    client.application?.commands.create({
        name: "fetch_d2_vendor",
        description: "Fetch info about any activity in D2",
        options: [{
            type: 3,
            name: "name",
            description: "The name of the activity you are looking for",
            required: true
        }]
    })

    client.application?.commands.create({
        name: "catchphrase",
        description: "Let us take a guess at what your catchphrase is",
        options: [
            {
                type: 6,
                name: "user",
                description: "The user who's catchphrase you want to get",
                required: false
            },
            {
                type: 10,
                name: "sample_size",
                description: "The sample size you want to use. Default is 50",
                required: false
            }
        ]
    })

    client.application?.commands.create({
        name: "record",
        description: "Record yourself in a voice channel",
        defaultPermission: true,
        options: [
            {
                type: 1, // Sub command
                name: "last",
                description: "Get an automatic recording of your voice from the last few minutes",
                options: [
                    {
                        type: 4,
                        name: "minutes",
                        description: "How many minutes back would you like to look?",
                        required: true
                    }
                ]
            }
        ]
    }).then(res => {
        console.log("Created /record!")
    }).catch(e => {
        console.log("Failed to create /play")
        console.error(e)
    })

    // Setup slash commands
    const guilds = ["892518158727008297", "830587774620139580"]
    const processGuild = (guild: Guild) => {
        if (guild.id === "892518158727008297") {
            guild.commands.create({
                name: "minecraft",
                description: "Minecraft",
                defaultPermission: false,
                options: [
                    {
                        type: 1, // Sub command
                        name: "share_location",
                        description: "Share your current in-game location",
                    },
                    {
                        type: 1, // Sub command
                        name: "detailed_scoreboard",
                        description: "Set whether your online status is detailed (true) or not (false)",
                        options: [
                            {
                                type: 5,
                                name: "setting",
                                description: "Detailed scorebaord (true). Basic scoreboard (false)",
                                required: true
                            }
                        ]
                    }
                ]
            })
        }

        guild.commands.create({
            name: "throw",
            description: "Throw a random user",
            options: [
                {
                    type: 6,
                    name: "user",
                    description: "A member of this server whom you wish to throw",
                    required: true
                },
                {
                    type: 3,
                    name: "template",
                    description: "The template to use",
                    required: false
                }
            ]
        }).catch(e => {
        })
        guild.commands.create({
            name: "vanish",
            description: "Magically vanish for a few minutes, then return!"
        }).catch(e => {
        })
        guild.commands.create({
            name: "cheese",
            description: "Become the cheese",
            options: [
                {
                    type: 3,
                    name: "message",
                    description: "Something cheesy",
                    required: true
                }
            ]
        }).catch(e => {
        })
        guild.commands.create({
            name: "bread",
            description: "Become wholesome",
            options: [
                {
                    type: 3,
                    name: "message",
                    description: "Something wholesome",
                    required: true
                }
            ]
        }).catch(e => {
        })
        guild.commands.create({
            name: "butter",
            description: "Spread the bread",
            options: [
                {
                    type: 3,
                    name: "message",
                    description: "Something buttery",
                    required: true
                }
            ]
        }).catch(e => {
        })
        guild.commands.create({
            name: "jam",
            description: "Sweet and delicous",
            options: [
                {
                    type: 3,
                    name: "message",
                    description: "Something strawberry",
                    required: true
                }
            ]
        }).catch(e => {
        })
        guild.commands.create({
            name: "changemyname",
            description: "Change your nickname to something random. Will you get a good one, or one of the bad bad ones?"
        }).catch(e => {
        })
        guild.commands.create({
            name: "peanutbutter",
            description: "Excreteing Peanut Butter. Be back shortly.",
            options: [
                {
                    type: 3,
                    name: "message",
                    description: "Something bitter",
                    required: true
                }
            ]
        }).catch(e => {
        })
        guild.commands.create({
            name: "random_capture",
            description: "Receive the blessing (or curse) of a random screenshot.",
        }).catch(e => {
        })
        // guild.commands.create({
        //     name: "economy_stats",
        //     description: "The server's economy system"
        // })
        // guild.commands.create({
        //     name: "economy_modify_stocks",
        //     description: "Modify the bank's stocks",
        //     defaultPermission: false,
        //     options: [
        //         {
        //             type: 3,
        //             name: "resource_tag_name",
        //             description: "Example: iron_ingot",
        //             required: true
        //         },
        //         {
        //             type: 4,
        //             name: "stock_count",
        //             description: "How stocked the bank is on this item",
        //             required: true
        //         },
        //         {
        //             type: 4,
        //             name: "max_stock_count",
        //             description: "The maximum amount of stock the bank will take",
        //             required: true
        //         }
        //         ,
        //         {
        //             type: 4,
        //             name: "baseline_price",
        //             description: "The minimum price that this item will sell for.",
        //             required: true
        //         }
        //     ]
        // }).then(command => {
        //     guild.commands.permissions.add({
        //         command: command.id, permissions: [{
        //             id: "894177595833339914",
        //             type: "ROLE",
        //             permission: true,
        //         }]
        //     })
        // })
        // guild.commands.create({
        //     name: "economy_modify_bank_accounts",
        //     description: "Modify the bank's stocks",
        //     defaultPermission: false,
        //     options: [
        //         {
        //             type: 3,
        //             name: "mc_username",
        //             description: "The Minecraft username of the player who's bank account you are modifying",
        //             required: true
        //         },
        //         {
        //             type: 4,
        //             name: "coins",
        //             description: "Set the number of coins this player should have",
        //             required: true
        //         }
        //     ]
        // })
        //     .then(command => {
        //         guild.commands.permissions.add({
        //             command: command.id, permissions: [{
        //                 id: "894177595833339914",
        //                 type: "ROLE",
        //                 permission: true
        //             }]
        //         })
        //     })
        guild.commands.create({
            name: "getcode",
            description: "Get another player's access code/key",
            defaultPermission: false,
            options: [
                {
                    type: 3,
                    name: "mc_username",
                    description: "The player's Minecraft username",
                    required: true
                }
            ]
        }).catch(e => {
        })
            .then(command => {
                if (!command) return
                guild.commands.permissions.add({
                    command: command.id, permissions: [{
                        id: "894177595833339914",
                        type: "ROLE",
                        permission: true
                    }]
                })
            }).catch(e => {
        })
        // guild.commands.create({
        //     name: "addclaim",
        //     description: "Allow a user to edit an item in the resource pack editor",
        //     defaultPermission: false,
        //     options: [
        //         {
        //             type: 3,
        //             name: "mc_username",
        //             description: "The player's Minecraft username",
        //             required: true
        //         },
        //         {
        //             type: 3,
        //             name: "item_location",
        //             description: "The location of the item. Example; /sounds/mob/chicken/say1.ogg",
        //             required: true
        //         }
        //     ]
        // })
        //     .then(command => {
        //         guild.commands.permissions.add({
        //             command: command.id, permissions: [{
        //                 id: "894177595833339914",
        //                 type: "ROLE",
        //                 permission: true
        //             }]
        //         })
        //     })
        // guild.commands.create({
        //     name: "restart_server",
        //     description: "This will restart the server",
        //     defaultPermission: false
        // })
        //     .then(command => {
        //         guild.commands.permissions.add({
        //             command: command.id, permissions: [{
        //                 id: "894177595833339914",
        //                 type: "ROLE",
        //                 permission: true
        //             }]
        //         })
        //     })
        // guild.commands.create({
        //     name: "force_pack_update",
        //     description: "Negates the 5 minute wait that a resource pack update would usually have",
        //     defaultPermission: false
        // })
        //     .then(command => {
        //         guild.commands.permissions.add({
        //             command: command.id, permissions: [{
        //                 id: "894177595833339914",
        //                 type: "ROLE",
        //                 permission: true
        //             }]
        //         })
        //     })
        guild.commands.create({
            name: "getlink",
            description: "Get your website link",
            defaultPermission: true
        }).catch(e => {
        })
        guild.commands.create({
            name: "experiments",
            description: "Manage play queue",
            defaultPermission: true,
            options: [
                {
                    type: 1, // Sub command
                    name: "quoteresponseai",
                    description: "Toggle the 'quote response ai' experiment",
                    options: [
                        {
                            type: 5,
                            name: "setting",
                            description: "Would you like to enable (true) or disable (false) this experiment?",
                            required: true
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "words",
                    description: "Enable or disable the words experiment",
                    options: [
                        {
                            type: 5,
                            name: "setting",
                            description: "Would you like to enable (true) or disable (false) this experiment?",
                            required: true
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "babyspeak",
                    description: "Enable or disable the baby speak experiment",
                    options: [
                        {
                            type: 5,
                            name: "setting",
                            description: "Would you like to enable (true) or disable (false) this experiment?",
                            required: true
                        }
                    ]
                }
            ]
        }).then(res => {
            console.log("Created /experiments!")
        }).catch(e => {
        })
        guild.commands.create({
            name: "playlist",
            description: "Manage your playlists",
            defaultPermission: true,
            options: [
                {
                    type: 1, // Sub command
                    name: "list",
                    description: "List all available playlists"
                },
                {
                    type: 1, // Sub command
                    name: "setactive",
                    description: "Set the playlist which you wish to edit/modify",
                    options: [
                        {
                            type: 3,
                            name: "shortcode",
                            description: "The shortcode or URL for the playlist you wish to modify",
                            required: true
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "new",
                    description: "Create a new playlist",
                    options: [
                        {
                            type: 3,
                            name: "name",
                            description: "A new name for the playlist",
                            required: true
                        },
                        {
                            type: 5,
                            name: "public",
                            description: "Would you like this playlist to be accessible by everyone? (True = yes)",
                            required: true
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "modifyinfo",
                    description: "Modify a playlist's information",
                    options: [
                        {
                            type: 3,
                            name: "name",
                            description: "A new name for the playlist",
                        },
                        {
                            type: 5,
                            name: "public",
                            description: "Would you like this playlist to be accessible by everyone?",
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "addtrack",
                    description: "Add a track",
                    options: [
                        {
                            type: 3,
                            name: "url",
                            description: "A Spotify or YouTube link",
                            required: true
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "removetrack",
                    description: "Remove a track from the playlist",
                    options: [
                        {
                            type: 3,
                            name: "url",
                            description: "A Spotify or YouTube link",
                            required: true
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "addqueue",
                    description: "Add all items that are currently in the queue, into your playlist."
                }
            ]
        }).catch(e => {
        })
        // let secret_santa = ["291063946008592388", "393955339550064641", "404507305510699019", "405302588377006081", "633083986968576031", "741149173595766824"]
        // let secret_santa_2
        // while (true) {
        //     secret_santa_2 = ShuffleArray(JSON.parse(JSON.stringify(JSON.parse(JSON.stringify(secret_santa)))))
        //     let check = true
        //     for (let i = 0; i < secret_santa.length; i++) {
        //         if (secret_santa[i] === secret_santa_2[i]) {
        //             check = false;
        //             break
        //         }
        //     }
        //     if (check) break
        // }
        // let test_user = await guild.members.fetch("404507305510699019")
        // for (let i = 0; i < secret_santa.length; i++) {
        //     let santa = await guild.members.fetch(secret_santa[i])
        //     let target = (await guild.members.fetch(secret_santa_2[i]))
        //     console.log(santa.user.username + " got " + target.user.username)
        //     let embed = new Discord.MessageEmbed()
        //         .setAuthor({name: "Mr. Secret Santa", iconURL: "https://tulamama.com/wp-content/uploads/2019/11/Santa-Hat-4.png"})
        //         .setTitle("Your Secret Santa!")
        //         .setDescription("SSSSH! You are ||<@" + target.user.id + ">||'s secret santa!\n" +
        //             "See if you can find them something nice. The price limit is up-to $40, although we recommend you aim for $20 max.")
        //         .setThumbnail(santa.avatarURL() || santa.user.avatarURL())
        //         .setFooter({text: "Please do not delete this message. I have not saved the list of who's been given who, so if you lose this message you cannot get it back."})
        //     santa.user.send({content:" ", embeds: [embed]})
        // }
        // fs.writeFileSync(path.resolve("./") + "/assets/secret_santa.json", JSON.stringify({santas: secret_santa, targets: secret_santa_2}))
        // guild.channels.fetch("899848529890148382").then(channel => {
        //     channel.send("Secret santa has begun! Please check your DMs for who you got. Maximum price limit is $40, but we recommend trying to stay around the $20 mark.")
        // })
    }
    for (let id of guilds) {
        client.guilds.fetch(id).then(processGuild)
    }

    // client.application.commands.fetch().then(commands => {
    //     for (let command of commands) {
    //         command[1].delete()
    //     }
    // })

    // client.application.commands.create({
    //     name: "username",
    //     description: "Add or change your name on our Minecraft server's whitelist",
    //     options: [
    //         {
    //             type: 3,
    //             name: "mc_username",
    //             description: "Your Minecraft username",
    //             required: true
    //         }
    //     ]
    // })

    // Update player profile pictures
    // for (let player of CrashBotUser.map) {
    //     client.users.fetch(player[1].discord_id).then(user => {
    //         player[1].avatar_url = user.avatarURL()
    //         console.log(user.username + ": " + player[1].avatar_url)
    //     }).catch(e => {})
    // }

    // setInterval(() => {
    //     let embed = new Discord.MessageEmbed()
    //     let players_sorted = Array.from(CrashBotUser.map, ([name, value]) => (value)).sort((a,b) => {
    //         if (a.player_name > b.player_name) {
    //             return 1
    //         } else if (a.player_name < b.player_name) {
    //             return -1
    //         } else {
    //             return 1
    //         }
    //     })
    //
    //     for (let player of players_sorted) {
    //         let days = 0
    //         let hours = 0
    //         let minutes = 0
    //         let seconds
    //         if (player.active) {
    //             seconds = player.active_time + Math.round(((new Date()).getTime() - player.active_start) / 1000)
    //         } else {
    //             seconds = player.active_time
    //         }
    //
    //         while (seconds >= 86400) {
    //             seconds -= 86400
    //             days += 1
    //         }
    //
    //         while (seconds >= 3600) {
    //             seconds -= 3600
    //             hours += 1
    //         }
    //
    //         while (seconds >= 60) {
    //             seconds -= 60
    //             minutes += 1
    //         }
    //
    //         if (player.active) {
    //             embed.addField(player.player_name + " 🟢", `<@${player.discord_id}>\n${days}D ${hours}:${minutes}:${seconds}`, true)
    //         }
    //         else {
    //             embed.addField(player.player_name + " 🔴", `<@${player.discord_id}>\n${days}D ${hours}:${minutes}:${seconds}`, true)
    //         }
    //     }
    //
    //     active_hours_message.edit({
    //         embeds: [embed]
    //     })
    // }, 30000)

    // Setup Minecraft remote status server
    client.channels.fetch("968298113427206195")
        .then(_channel => {
            let channel = _channel as TextChannel
            setInterval(async () => {
                RemoteStatusServer.requestPlayerList()
                setTimeout(() => {
                    updateScoreboard()
                }, 10000)
            }, 10000)

            ServerConnection.on("message", async (message: string, player: any) => {
                console.log(player.id)

                SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
                ])
                    .then(res => {
                        if (res.recordset.length === 0) {
                            let me = channel.guild.members.me
                            if (me) sendImpersonateMessage(channel, me, message)
                        }
                        else {
                            if (message.includes("@")) {
                                ServerConnection.broadcastCommand(`tellraw ${player.username} ["",{"text":"[Crash Bot - Messaging System] ","bold":true,"color":"dark_red"},{"text":"To prevent ping spam, the '@' symbol is prohibited.'","color":"white"}]`)
                            }

                            channel.guild.members.fetch(res.recordset[0].discord_id).then(member => {
                                sendImpersonateMessage(channel, member, message.replaceAll("@", ""))
                            })
                        }
                    })
            })

            ServerConnection.on("playerConnect", async player => {
                if (!player.username) return

                let data = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                ])
                SafeQuery(`UPDATE dbo.Users
                           SET mc_connected = 1
                           WHERE mc_id = @mcid`, [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                ])

                if (data.recordset.length === 0) {
                    let embed = new Discord.MessageEmbed()
                    embed.setAuthor({
                        name: `${player.username} joined the game`,
                        iconURL: "http://canada1.national.edu/wp-content/uploads/2018/05/iStock-504858574.jpg"
                    })

                    let row = new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setCustomId("link_minecraft_" + player.id)
                                .setLabel("This is me. Link my account.")
                                .setStyle("SECONDARY")
                        )

                    channel.send({content: ' ', embeds: [embed], components: [row]})
                }
                else {
                    let member = await channel.guild.members.fetch(data.recordset[0].discord_id)

                    let embed = new Discord.MessageEmbed()
                    embed.setAuthor({
                        name: `${player.username} joined the game`,
                        iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                    })
                    embed.setDescription(`<@${data.recordset[0].discord_id}>`)
                    channel.send({content: ' ', embeds: [embed]})
                }
                updateScoreboard()
            })

            ServerConnection.on("playerDisconnect", async player => {
                let data = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                ])
                SafeQuery(`UPDATE dbo.Users
                           SET mc_connected = 0
                           WHERE mc_id = @mcid`, [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                ])

                if (data.recordset.length === 0) {
                    let embed = new Discord.MessageEmbed()
                    embed.setAuthor({
                        name: `${player.username} left the game`,
                        iconURL: "http://canada1.national.edu/wp-content/uploads/2018/05/iStock-504858574.jpg"
                    })

                    let row = new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setCustomId("link_minecraft_" + player.id)
                                .setLabel("This is me. Link my account.")
                                .setStyle("SECONDARY")
                        )

                    channel.send({content: ' ', embeds: [embed], components: [row]})
                }
                else {
                    let member = await channel.guild.members.fetch(data.recordset[0].discord_id)

                    let embed = new Discord.MessageEmbed()
                    embed.setAuthor({
                        name: `${player.username} left the game`,
                        iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                    })
                    embed.setDescription(`<@${data.recordset[0].discord_id}>`)
                    channel.send({content: ' ', embeds: [embed]})
                }
                await updateScoreboard()
            })

            ServerConnection.on("playerDataUpdate", async player => {
                await SafeQuery(`UPDATE dbo.Users
                                 SET mc_x   = @mcx,
                                     mc_y   = @mcy,
                                     mc_z   = @mcz,
                                     mc_dim = @mcdim
                                 WHERE mc_id = @mcid`, [
                    {name: "mcx", type: mssql.TYPES.BigInt(), data: player.position[0]},
                    {name: "mcy", type: mssql.TYPES.BigInt(), data: player.position[1]},
                    {name: "mcz", type: mssql.TYPES.BigInt(), data: player.position[2]},
                    {name: "mcdim", type: mssql.TYPES.VarChar(100), data: player.dimension},
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
                ])
                await updateScoreboard()

                // Check for territory invasions
                SafeQuery(`SELECT *
                           FROM dbo.MCTerritories
                           WHERE ${player.position[0]} >= sx
                             AND ${player.position[1]} >= sy
                             AND ${player.position[2]} >= sz
                             AND ${player.position[0]} <= ex
                             AND ${player.position[1]} <= ey
                             AND ${player.position[2]} <= ez
                             AND dimension = '${player.dimension}'`).then(async res => {
                    if (res.recordset.length === 0) {
                        await SafeQuery(`UPDATE dbo.MCTerritoriesLog
                                         SET active = 0
                                         WHERE mc_id = '${player.id}'`)
                    }
                    else for (let territory of res.recordset) {
                        let res = await SafeQuery("SELECT * FROM dbo.MCTerritoriesLog WHERE territory_id = @tid AND mc_id = @mcid AND active = 1", [
                            {name: "tid", type: mssql.TYPES.Int(), data: territory.id},
                            {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                        ])

                        if (await res.recordset.length === 0) {
                            // Check if the player is whitelisted/blacklisted
                            let whitelist_entries = await SafeQuery(`SELECT *
                                                                     FROM dbo.MCTerritoriesWhitelist
                                                                     WHERE player_id = '${player.id}'
                                                                       AND territory_id = ${territory.id}`)
                            if (
                                (whitelist_entries.recordset.length !== 0 && !territory.blacklist_mode) ||
                                whitelist_entries.recordset.length === 0 && territory.blacklist_mode
                            ) continue

                            console.log(territory.id, player.id)
                            console.log("SQL: " + `INSERT INTO dbo.MCTerritoriesLog (territory_id, mc_id)
                                                   VALUES (${territory.id}, '${player.id}');`)
                            await SafeQuery(`INSERT INTO dbo.MCTerritoriesLog (territory_id, mc_id, x, y, z)
                                             VALUES (${territory.id}, '${player.id}', ${player.position[0]},
                                                     ${player.position[1]}, ${player.position[2]});`)
                            let owner = await client.users.fetch(territory.owner_id)
                            owner.send(`${player.username} has entered your territory: ${territory.name} (${player.position[0], player.position[1], player.position[2]})`)
                            if (!territory.kill) {
                                ServerConnection.broadcastCommand(`tellraw ${player.username} ["",{"text":"[Crash Bot - Territories] ","bold":true,"color":"dark_red"},{"text":"You have entered '","color":"white"},{"text":"${territory.name}","bold":true,"color":"white"},{"text":"'. The owner of this territory has indicated that this area is strictly private, and may receive an alert about your presence.","color":"white"}]`)
                            }
                            else {
                                ServerConnection.broadcastCommand(`tellraw ${player.username} ["",{"text":"[Crash Bot - Territories]","bold":true,"color":"dark_red"},{"text":" You have entered a territory ('"},{"text":"${territory.name}","bold":true},{"text":"') which you are not permitted to be in. Please leave the area within 10 seconds."}]`)
                            }
                        }
                        else if (territory.kill) {
                            // Teleport the invading player
                            ServerConnection.broadcastCommand(`tellraw @a ["",{"text":"[Crash Bot - Territories]","bold":true,"color":"dark_red"},{"text":" ${player.username} has been buried for invading a territory. Please do not invade territories."}]`)
                            let owner = await client.users.fetch(territory.owner_id)

                            ServerConnection.broadcastCommand(`tp ${player.username} ${player.position[0]} -50 ${player.position[2]}`)
                            owner.send(`${player.username} has been buried due to territory invasion.`)
                        }
                    }
                })
            })

            ServerConnection.on("playerAdvancementEarn", async (advancement, player) => {
                let data = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                ])
                SafeQuery(`UPDATE dbo.Users
                           SET mc_connected = 0
                           WHERE mc_id = @mcid`, [
                    {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                ])

                if (!advancement.display.title) return

                if (data.recordset.length === 0) {
                    let embed = new Discord.MessageEmbed()
                    embed.setAuthor({
                        name: `${player.username} just earned [${advancement.display.title}]`,
                        iconURL: "http://canada1.national.edu/wp-content/uploads/2018/05/iStock-504858574.jpg"
                    })

                    let row = new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setCustomId("link_minecraft_" + player.id)
                                .setLabel("This is me. Link my account.")
                                .setStyle("SECONDARY")
                        )

                    channel.send({content: ' ', embeds: [embed], components: [row]})
                }
                else {
                    let member = await channel.guild.members.fetch(data.recordset[0].discord_id)

                    let embed = new Discord.MessageEmbed()
                    embed.setAuthor({
                        name: `${player.username} just earned [${advancement.display.title}]`,
                        iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                    })
                    embed.setDescription(`<@${data.recordset[0].discord_id}>`)
                    channel.send({content: ' ', embeds: [embed]})
                }
            })

            ServerConnection.on("playerDeath", (player) => {
                channel.send(player.username + " died (rip)")
            })
        })
})

client.on("userUpdate", (oldUser, newUser) => {
    SafeQuery(`UPDATE dbo.Users
               SET avatar_url = @avatarurl
               WHERE discord_id = @discordid`, [
        {name: "avatarurl", type: mssql.TYPES.VarChar(200), data: newUser.avatarURL()},
        {name: "discordid", type: mssql.TYPES.VarChar(20), data: newUser.id}
    ])
})

client.on("interactionCreate", async (interaction): Promise<void> => {
    if (interaction.isCommand()) {
        if (interaction.commandName === "economy_stats") {
            let embed = new Discord.MessageEmbed()
                .setTitle("Current bank stats")

            for (let resource of bank.resources) {
                embed.addField(resource.name, "Stock: " + resource.stock + "/" + resource.max_inventory + "\n" + resource.calculateWorth() + "c per item")
            }
            interaction.reply({
                embeds: [embed]
            })
        }
        else if (interaction.commandName === "economy_modify_stocks") {
            let target_resource = interaction.options.getString("resource_tag_name")
            let out_resource
            let valid_tags = []
            for (let resource of bank.resources) {
                valid_tags.push(resource.tag_name)
                if (resource.tag_name === target_resource) {
                    out_resource = resource
                    break
                }
            }

            if (!out_resource) {
                interaction.reply({
                    content: "Invalid resource tag name. Valid tag names are; `" + valid_tags.join("`, `") + "`.",
                    ephemeral: true
                })
            }
            else {
                out_resource.stock = interaction.options.getInteger("stock_count") || 0
                out_resource.max_inventory = interaction.options.getInteger("max_stock_count") || 100
                out_resource.baseline_price = interaction.options.getInteger("baseline_price") || 10
                interaction.reply({content: "Resource sucessfully modified", ephemeral: true})
            }
        }
        else if (interaction.commandName === "economy_modify_bank_accounts") {
            interaction.reply("This section of the economy manager has been deprecated due to changes in background processing.")
            // let target_player = interaction.options.getString("mc_username")
            // let out_player
            // let valid_usernames = []
            // for (let player of CrashBotUser.map) {
            //     valid_usernames.push(player[1].player_name)
            //     if (player[1].player_name === target_player) {
            //         out_player = player
            //         break
            //     }
            // }
            //
            // if (!out_player) {
            //     interaction.reply({
            //         content: "Invalid player name. Valid player names are; `" + valid_usernames.join("`, `") + "`.",
            //         ephemeral: true
            //     })
            // }
            // else {
            //     CrashBotUser.map.get(out_player[0]).currency = interaction.options.getInteger("coins")
            //     interaction.reply({
            //         content: "Set " + out_player[1].player_name + "'s bank to " + interaction.options.getInteger("coins") + " coins.",
            //         ephemeral: true
            //     })
            //     wss.updateBank()
            // }
        }
        else if (interaction.commandName === "getlink") {
            // Get the code

            let req = await SafeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid",
                type: mssql.TYPES.VarChar(20),
                data: interaction.user.id
            }])
            console.log(req)

            if (req.recordset.length !== 0) {
                interaction.reply({
                    content: `Your website access link is: https://joemamadf7.jd-data.com:8050/home/${req.recordset[0].shortcode}.`,
                    ephemeral: true
                })
            }
            else {
                interaction.reply("You don't have a link yet. Run the `/username` command to generate your own link.")
            }
        }
        else if (interaction.commandName === "getcode") {
            let mc_username = interaction.options.getString("mc_username")
            let req = await SafeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE player_name = @username`, [{
                name: "username",
                type: mssql.TYPES.VarChar(30),
                data: mc_username
            }])

            if (req.recordset.length !== 0) {
                interaction.reply({
                    content: `The player's code is \`${req.recordset[0].shortcode}\`.`,
                    ephemeral: true
                })
            }
            else {
                interaction.reply({
                    content: "Could not find that player. They must run `/username` before you can get their code.",
                    ephemeral: true
                })
            }
        }
        else if (interaction.commandName === "addclaim") {
            interaction.reply("Managing claims is currently unsupported")
        }
        else if (interaction.commandName === "restart_server") {
            interaction.reply("Command is currently unavailable")
            // interaction.deferReply().then(async msg => {
            //     interaction.editReply("Shutting down server...")
            //     await mcServer.shutdown()
            //     interaction.editReply("Restarting server...")
            //     mcServer.start()
            // })
        }
        else if (interaction.commandName === "throw") {
            // Read available memes
            interaction.deferReply().then(async () => {
                let sender = interaction.member as GuildMember
                let target = interaction.options.getMember("user") as GuildMember

                generateThrow(await sender.fetch(), await target.fetch(), interaction.options.getString("template") || null).then(meme => {

                    interaction.editReply({
                        content: "TEMPLATE: `" + meme.template.location + "`", files: [
                            new Discord.MessageAttachment(fs.readFileSync(meme.file))
                        ]
                    }).then(() => {

                    })
                }).catch(e => {
                    console.log(e)
                    interaction.editReply({
                        content: e.toString()
                    })
                })
            })
        }
        else if (interaction.commandName === "random_capture") {
            interaction.reply(await generateRandomCaptureMsg() || "Oops. Could not find a random cature")
        }
        else if (interaction.commandName === "cheese" || interaction.commandName === "butter" || interaction.commandName === "bread" || interaction.commandName === "jam" || interaction.commandName === "peanutbutter") {
            // Say something as cheese
            const data: {
                [key: string]: {
                    name: string,
                    avatar: string
                }
            } = {
                cheese: {
                    name: "Cheese",
                    avatar: "https://www.culturesforhealth.com/learn/wp-content/uploads/2016/04/Homemade-Cheddar-Cheese-header-1200x900.jpg"
                },
                bread: {
                    name: "Bread",
                    avatar: "https://www.thespruceeats.com/thmb/ZJyWw36nZ1lLNi5FHOKRy9daQqs=/940x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/loaf-of-bread-182835505-58a7008c5f9b58a3c91c9a14.jpg"
                },
                butter: {
                    name: "Butter",
                    avatar: "https://cdn.golfmagic.com/styles/scale_1536/s3/field/image/butter.jpg"
                },
                jam: {
                    name: "Jam",
                    avatar: "https://media.istockphoto.com/photos/closeup-of-toast-with-homemade-strawberry-jam-on-table-picture-id469719908?k=20&m=469719908&s=612x612&w=0&h=X4Gzga0cWuFB5RfLh-o7s1OCTbbRNsZ8avyVSK9cgaY="
                },
                peanutbutter: {
                    name: "Peanut Butter",
                    avatar: "https://s3.pricemestatic.com/Images/RetailerProductImages/StRetailer2362/0046010017_ml.jpg"
                }
            }

            // @ts-ignore
            if (!interaction.channel?.fetchWebhooks) {
                interaction.editReply("Ooops. This channel is not supported")
                return
            }

            let channel = interaction.channel as TextChannel
            channel.fetchWebhooks()
                .then(async hooks => {
                    let webhooks = hooks.filter(hook => hook.name === data[interaction.commandName].name)
                    let webhook
                    if (webhooks.size === 0) {
                        // Create the webhook
                        webhook = await channel.createWebhook(data[interaction.commandName].name, {
                            avatar: data[interaction.commandName].avatar,
                            reason: "Needed new cheese"
                        })
                    }
                    else {
                        // console.log([...hooks][0])
                        webhook = [...hooks.filter(hook => hook.name.toLowerCase() === interaction.commandName.toLowerCase())][0][1]
                        console.log(webhook)
                    }

                    let message = interaction.options.getString("message") || ""
                        .replace(/<@!(\d+)>/, (match, userId): string => {
                            const member = interaction.guild?.members.cache.get(userId)
                            if (member) {
                                return member.nickname || member.user.username
                            }
                            else {
                                return match
                            }
                        })
                        .replace(/<@(\d+)>/, (match, userId): string => {
                            const member = interaction.guild?.members.cache.get(userId)
                            if (member) {
                                return member.user.username || member.user.username
                            }
                            else {
                                return match
                            }
                        })
                        .replace(/<@&(\d+)>/, (match, roleId) => {
                            const role = interaction.guild?.roles.cache.get(roleId)
                            if (role) {
                                return role.name
                            }
                            else {
                                return match
                            }
                        })
                        .replaceAll("@", "")

                    // @ts-ignore
                    webhook.send(removeAllMentions(message, interaction.channel))
                    interaction.reply({
                        content: "Mmm. Cheese.",
                        fetchReply: true
                    }).then(msg => {
                        // @ts-ignore
                        msg.delete()
                    })
                })
        }
        else if (interaction.commandName === "record") {
            let com = interaction.options.getSubcommand()
            let shortcode = (await getUserData(interaction.member as GuildMember)).shortcode

            let user = new CrashBotUser(shortcode)
            if (com === "last") {
                let minutes = interaction.options.getInteger("minutes") || 5

                let recordings = await SafeQuery("SELECT filename, start FROM dbo.VoiceRecordings WHERE user_id = @userid AND start >= DATEADD(MINUTE, @minutes, GETDATE())", [
                    {
                        name: "userid",
                        type: mssql.TYPES.VarChar(100),
                        data: (interaction.member as GuildMember)?.id || ""
                    },
                    {name: "minutes", type: mssql.TYPES.Int(), data: 0 - minutes}
                ])

                if (recordings.recordset.length === 0) {
                    interaction.reply({content: "No recordings from within the specified timeframe", ephemeral: true})
                    return
                }
                interaction.reply({
                    content: "We're processing the audio. You'll receive a DM once processing is complete.",
                    ephemeral: true
                })

                const command = ffmpeg()
                const write_stream = new PassThrough()

                let first_track_start = recordings.recordset[0].start
                let filters = []
                let i = 0
                for (let recording of recordings.recordset) {
                    let seek = (recording.start.getTime() - first_track_start.getTime())
                    console.log(recording, seek)
                    command.input(path.join(path.resolve("./"), "voice_recordings", recording.filename))


                    if (i !== 0) {
                        filters.push({
                            filter: "adelay",
                            options: seek + "|" + seek,
                            inputs: i.toString(),
                            outputs: `[a${i}]`
                        })
                    }
                    else {
                        filters.push({
                            filter: "adelay",
                            options: "0|0",
                            inputs: i.toString(),
                            outputs: `[a${i}]`
                        })
                    }
                    i++
                }
                // command.format("mp3")
                command.complexFilter([
                    ...filters,
                    {
                        filter: "amix",
                        options: "inputs=" + filters.length,
                        inputs: filters.map(i => i.outputs),
                        outputs: "[b]"
                    }
                ])
                command.outputOption("-map", "[b]")
                command.output(path.join(path.resolve("./"), "HERE.mp3"))
                // command.output(write_stream, {end: true})
                command.on("end", () => {
                    interaction.user.send({
                        content: "Enjoy your recording!",
                        files: [{
                            attachment: "HERE.mp3",
                            name: "recording.mp3",
                            // @ts-ignore
                            file: "HERE.mp3"
                        }]
                    }).catch(e => {
                        interaction.user.send({
                            content: "Oh no! Your audio may have been too large to send! Please try again."
                        })
                    })
                })
                command.on("error", (e) => {
                    console.error(e)
                    interaction.user.send({
                        content: "Oh no! An error occured while processing your audio. Please try again."
                    })
                })
                command.run()
                // command.output(write_stream, {end: true})
                // command.run()
            }
        }
        else if (interaction.commandName === "experiments") {
            // Used to manage experimental features
            let com = interaction.options.getSubcommand()
            if (com === "quoteresponseai") {
                let bool = interaction.options.getBoolean("setting")
                // Ensure that the user is in the database
                let user = await getUserData(interaction.member as GuildMember)
                let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentAIQuoteResponse = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                    name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
                }])

                interaction.reply({
                    content: "Set `quoteresponseai` to: `" + (bool ? "true" : "false") + "`",
                    ephemeral: true
                })
            }
            else if (com === "words") {
                let bool = interaction.options.getBoolean("setting")
                // Get the user's key
                let user = await getUserData(interaction.member as GuildMember)
                let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentWords = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                    name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
                }])

                interaction.reply({
                    content: "Set `experimentWords` to: `" + (bool ? "true" : "false") + "`. Individual words that you say, will now be saved. Words are saved independently of each other for security (not as full sentences).",
                    ephemeral: true
                })
            }
            else if (com === "babyspeak") {
                let bool = interaction.options.getBoolean("setting")
                // Get the user's key
                let user = await getUserData(interaction.member as GuildMember)
                let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentBabyWords = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                    name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
                }])

                interaction.reply({
                    content: "Set `experimentBabyWords` to: `" + (bool ? "true" : "false") + "`.",
                    ephemeral: true
                })
            }
        }
        else if (interaction.commandName === "minecraft") {
            // Used to manage experimental features
            let com = interaction.options.getSubcommand()
            if (com === "share_location") {
                console.log("Getting user coordinates..")

                // Ensure that the user is in the database
                let user = await getUserData(interaction.member as GuildMember)

                if (!user.mc_id) {
                    interaction.reply("You haven't linked your Minecraft account yet. You must do this first.")
                    return
                }
                if (user.mc_connected) {
                    await RemoteStatusServer.requestPlayerList()
                    user = await getUserData(interaction.member as GuildMember)
                }

                let member = interaction.member as GuildMember
                member = await member.fetch()
                let player = RemoteStatusServer.connections["pczWlxfMzPmuI6yjQMaQYA=="].getPlayer(user.mc_id)

                let embed = new Discord.MessageEmbed()
                embed.setAuthor({
                    name: `${member.user.username} (${player?.username || "not connected"})`,
                    iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                })
                if (player) embed.setDescription(`Currently exploring \`${user.mc_dim}\` at \`X${user.mc_x} Y${user.mc_y} Z${user.mc_z}\``)
                else embed.setDescription(`Last seen in \`${user.mc_dim}\` at \`X${user.mc_x} Y${user.mc_y} Z${user.mc_z}\``)
                interaction.reply({content: ' ', embeds: [embed]})
            }
            else if (com === "detailed_scoreboard") {
                let bool = interaction.options.getBoolean("setting")
                // Get the user's key
                let user = await getUserData(interaction.member as GuildMember)
                let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET mc_detailed_scoreboard = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                    name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
                }])

                updateScoreboard()
                interaction.reply({
                    content: "Set `detailed scoreboard` to: `" + (bool ? "true" : "false") + "`.",
                    ephemeral: true
                })
            }
        }
        else if (interaction.commandName === "vanish") {
            (interaction.member as GuildMember).timeout(5 * 60 * 1000, "They vanished!")
                .then(() => interaction.reply("You have vanished for 5 minutes!"))
                .catch(e => {
                    interaction.reply("Oh no! My magic doesn't work on you!")
                })
        }
        else if (interaction.commandName === "fetch_d2_item") {
            let name = interaction.options.getString("name") || ""
            if (name.length < 3) {
                interaction.reply({
                    content: "That search is a bit short. Please try something longer"
                })
                return
            }
            itemNameSearch(name)
                .then(items => {
                    return buildItemMessage(name, items[0], items)
                })
                .then(message => {
                    interaction.reply(message)
                })
                .catch(e => {
                    console.error(e)
                    interaction.reply({
                        content: "oops! We couldn't find an item with that name."
                    })
                })
        }
        else if (interaction.commandName === "fetch_d2_activity") {
            let name = interaction.options.getString("name") || ""
            if (name.length < 3) {
                interaction.reply({
                    content: "That search is a bit short. Please try something longer"
                })
                return
            }
            activityNameSearch(name)
                .then(items => {
                    return buildActivityMessage(name, items[0], items)
                })
                .then(message => {
                    interaction.reply(message)
                })
                .catch(e => {
                    console.error(e)
                    interaction.reply({
                        content: "oops! We couldn't find an item with that name."
                    })
                })
        }
        else if (interaction.commandName === "fetch_d2_vendor") {
            let name = interaction.options.getString("name") || ""
            if (name.length < 3) {
                interaction.reply({
                    content: "That search is a bit short. Please try something longer"
                })
                return
            }
            interaction.deferReply()
                .then(() => {
                    return vendorNameSearch(name)
                })
                .then(items => {
                    return buildVendorMessage(name, items[0], items)
                })
                .then(message => {
                    interaction.editReply(message)
                })
                .catch(e => {
                    console.error(e)
                    interaction.editReply({
                        content: "oops! We couldn't find an item with that name."
                    })
                })
        }
        else if (interaction.commandName === "catchphrase") {
            getUserData(interaction.member as GuildMember)
                .then(res => {
                    if (res.experimentWords === false) {
                        interaction.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                        return
                    }

                    let member = interaction.options.getMember("user") || interaction.user
                    let sample_size = interaction.options.getNumber("sample_size") || 50

                    if (sample_size < 20 || sample_size > 1000) sample_size = 50
                        interaction.deferReply()
                        .then(() => {
                            return SafeQuery("SELECT TOP " + (sample_size * 1.5) + " word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                                // @ts-ignore
                                {name: "discordid", type: mssql.TYPES.VarChar(100), data: (member.id || "")}
                            ])
                        })
                        .then(async res => {
                            if (res.recordset.length < 20) {
                                interaction.editReply("We don't quite have enough data yet. Keep talking and we'll be able to tell you.")
                            }
                            else {
                                let top: {
                                    word: string,
                                    count: number
                                }[] = ShuffleArray(res.recordset).slice(0, sample_size).map((i: any) => {
                                    return {
                                        word: toTitleCase(i.word),
                                        count: i.sum
                                    }
                                })
                                ChatGPT.sendMessage(
                                    "Using some of these words, create a catchphrase. Extra words can be added. I've also included a counter for each word, to indicate how often the word has been used before.\n\n" +
                                    top.map(i => `${i.word} (${i.count})`).join(", ")
                                )
                                    .then(AIres => {
                                        let embed = new Discord.MessageEmbed()
                                        // console.log("Using some of these words, create a catchphrase. Extra words can be added. I've also included a counter for each word, to indicate how often the word has been used before.\n\n" +
                                        //     top.map(i => `${i.word} (${i.count})`).join(", "))

                                        embed.setTitle("Is this your catchphrase?")
                                        embed.setDescription("<@" + member + "> - " + AIres.text)
                                        embed.setFooter({text: "Crashbot words experiment"})
                                        interaction.editReply({content: " ", embeds: [embed, new Discord.MessageEmbed()
                                                .setDescription("Sampled words: " + top.map(i => i.word).join(", "))
                                            ]})
                                    })
                                    .catch(e => {
                                        console.log(e)
                                        let embed = new Discord.MessageEmbed()
                                        embed.setTitle("Service unavailable")
                                        embed.setDescription("This service is currently unavailable. Please try again later")
                                        embed.setColor("RED")
                                        embed.setFooter({text: "Crash Bot words experiment"})
                                        interaction.editReply({content: " ", embeds: [embed]})
                                    })
                            }
                        })
                })
        }
        else if (interaction.commandName === "ask-gpt") {
            if (!interaction.channel) {
                interaction.reply("Oops! Plase try again in a different channel")
                return
            }
            askGPTQuestion(interaction.user.username + " said: " + (interaction.options.getString("message") || ""), interaction.channel, interaction)
        }
        else if (interaction.commandName === "tldr") {
            await interaction.deferReply({fetchReply: true, ephemeral: true})
            let lookback_hours = interaction.options.getInteger("hours") || 24
            if (lookback_hours < 1) {
                interaction.editReply(`Oops. We couldn't fufill that request.`)
                return
            }

            let lookback_until = Date.now() - (lookback_hours * 60 * 60 * 1000)

            let messages: Discord.Collection<string, Discord.Message<boolean>> = new Discord.Collection([])
            let last_message: Discord.Message<boolean> | undefined
            while (messages.size < 150 || (messages.last()?.createdTimestamp || 0) >= lookback_until) {
                let new_messages = await interaction.channel?.messages.fetch({
                    limit: 100,
                    before: last_message?.id
                })
                if (!new_messages) break
                last_message = new_messages.last()
                messages = messages.concat(new_messages.filter(i => i.content !== "" && i.createdTimestamp >= lookback_until))
                if (new_messages.find(i => i.createdTimestamp >= lookback_until)) break
                console.log(messages.size)
                console.log(messages.last()?.createdTimestamp, lookback_until)
                if (new_messages.size < 100) break
            }
            if (!messages) throw "Error while generating tldr"

            let tldr: string[] = []
            for (let message of messages) {
                tldr.push(message[1].content)
            }
            tldr = tldr.reverse().slice(0,180)
            let gpt_response = await ChatGPT.sendMessage("Please write an overview of this conversation:\n" + JSON.stringify(tldr))
            // @ts-ignore
            interaction.editReply(removeAllMentions(gpt_response.text, interaction.channel))
        }
        else {
            console.log("Unknown command interaction picked up")
            console.log(interaction)
        }
    }
    else if (interaction.isMessageContextMenu()) {

    }
    else if (interaction.isButton()) {
        console.log("HERE!", interaction.customId)
        if (interaction.customId === "getlink") {
            // Get the code

            let req = await SafeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            if (req.recordset.length !== 0) {
                interaction.reply({
                    content: `Your website access link is: https://joemamadf7.jd-data.com:8050/home/${req.recordset[0].shortcode}. It has also been DMed to you to help you find it again later.`,
                    ephemeral: true
                })
            }
            else {
                interaction.reply("You don't have a link yet. Run the `/username` command to generate your own link.")
            }
        }
        else if (interaction.customId.startsWith("verify_throw_")) {
            let template_id = interaction.customId.replace("verify_throw_", "")
            console.log(template_id)

            let memes = fetchThrowTemplates()
            let meme = memes.find(meme => {
                return meme.location === template_id
            })
            if (!meme) {
                interaction.reply("Ooop. We could not find that template")
                return
            }
            else {
                memes[memes.indexOf(meme)].verified = true
                fs.writeFileSync(path.resolve("./") + "/assets/throw/memes.json", JSON.stringify(memes))
                interaction.reply("👍 Verified")
            }
        }
        else if (interaction.customId === "audio_shuffle") {
            if (VoiceConnectionManager.connections.has(interaction.guildId || "no guild")) {
                VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.shuffle()
                interaction.reply({content: "The queue has been shuffled", ephemeral: true})
            }
            else {
                interaction.reply("There is no active queue. Connect to a voice channel and run `/play` first.")
            }
        }
        else if (interaction.customId === "audio_stop") {
            if (VoiceConnectionManager.connections.has(interaction.guildId || "no guild")) {
                interaction.reply({content: "Stopping audio...", ephemeral: true})
                VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.stop()
            }
            else {
                interaction.reply({content: "Queue is empty", ephemeral: true})
            }
        }
        else if (interaction.customId === "audio_rewind") {
            interaction.reply({content: "Rewinding track...", ephemeral: true})
            VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.rewind()
        }
        else if (interaction.customId === "audio_pause") {
            interaction.reply({content: "Pausing/Resuming track...", ephemeral: true})
            VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.pause()
        }
        else if (interaction.customId === "audio_skip") {
            interaction.reply({content: "Skipping track...", ephemeral: true})
            VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.skip()
        }
        else if (interaction.customId === "audio_challenge") {
            let res = await VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.challenge()
            if (res) {
                interaction.reply("Challenge mode has been enabled!")
            }
            else {
                interaction.reply("Challenge mode has been disabled.")
            }
        }
        else if (interaction.customId === "random_capture") {
            interaction.reply(await generateRandomCaptureMsg() || "Ooops. Couldn't find a random capture")
        }
        else if (interaction.customId.startsWith("link_minecraft_")) {
            let player_id = interaction.customId.replace("link_minecraft_", "")
            // @ts-ignore
            let player = RemoteStatusServer.connections["pczWlxfMzPmuI6yjQMaQYA=="].getPlayer({id: player_id})

            if (!player) {
                interaction.reply({
                    content: "Could not find that player. The player must be connected to the Minecraft Server.",
                    ephemeral: true
                })
                return
            }
            let res = await SafeQuery("SELECT * FROM CrashBot.dbo.users WHERE mc_id = @mcid", [
                {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
            ])
            if (res.recordset.length > 0) {
                interaction.reply({
                    content: `This account was already linked to <@${res.recordset[0].discord_id}>. If this is incorrect, please contact <@404507305510699019>.`,
                    ephemeral: true
                })
                return
            }
            await SafeQuery("UPDATE CrashBot.dbo.Users SET mc_id = @mcid WHERE discord_id = @discordid", [
                {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
                {name: "discordid", type: mssql.TYPES.VarChar(100), data: (interaction.member as GuildMember).id}
            ])

            interaction.reply({content: "Successfully linked!", ephemeral: true})
        }
        else if (interaction.customId === "offensive_inspiro_quote") {
            (interaction.message as Message).delete()
            interaction.reply({
                content: "That's ok. Inspirobot isn't perfect, and can sometimes create some offensive quotes.",
                ephemeral: true
            })
        }
        else if (interaction.customId === "another_inspiro_quote") {
            if (!interaction.channel) throw "Unknown channel"
            quoteReply(interaction.channel, interaction)
        }

    }
    else if (interaction.isSelectMenu()) {
        if (interaction.customId === "d2_item_search_adjust") {
            let value = JSON.parse(interaction.values[0])

            itemNameSearch(value[0])
                .then(items => {
                    let selected_item = items.find(i => i.hash === value[1])
                    if (!selected_item) throw "Selected an invalid item"
                    return buildItemMessage(value[0], selected_item, items)
                })
                .then(message => {
                    // @ts-ignore
                    interaction.update(message)
                })
                .catch(e => {
                    console.error(e)
                    interaction.reply({
                        content: "oops! We couldn't find an item with that name."
                    })
                })
        }
        else if (interaction.customId === "d2_activity_search_adjust") {
            let value = JSON.parse(interaction.values[0])
            activityNameSearch(value[0])
                .then(items => {
                    console.log(value[1])
                    let selected_item = items.find(i => i.hash === value[1])
                    if (!selected_item) throw "Selected an invalid item"
                    return buildActivityMessage(value[0], selected_item, items)
                })
                .then(message => {
                    // @ts-ignore
                    interaction.update(message)
                })
                .catch(e => {
                    console.error(e)
                    interaction.reply({
                        content: "oops! We couldn't find an item with that name."
                    })
                })
        }
        else if (interaction.customId === "d2_vendor_search_adjust") {
            let value = JSON.parse(interaction.values[0])
            interaction.deferUpdate()
                .then(() => {
                    return vendorNameSearch(value[0])
                })
                .then(items => {
                    console.log(value[1])
                    let selected_item = items.find(i => i.hash === value[1])
                    if (!selected_item) throw "Selected an invalid item"
                    return buildVendorMessage(value[0], selected_item, items)
                })
                .then(message => {
                    // @ts-ignore
                    interaction.editReply(message)
                })
                .catch(e => {
                    console.error(e)
                    interaction.editReply({
                        content: "oops! We couldn't find an item with that name."
                    })
                })
        }
        else if (interaction.customId === "d2_item_notification") {
            let value = JSON.parse(interaction.values[0])
            interaction.deferReply({ephemeral: true})
                .then(() => {
                    return SetupNotifications.itemAvailableAtVendor(interaction.user, value[1])
                })
                .then(() => {
                    interaction.editReply({
                        content: "Awesome! We'll send you a DM when this item is next available!",
                    })
                })
        }
    }
})

client.on("messageCreate", async (msg): Promise<void> => {
    if (msg.author.bot) return
    if (msg.content.toLowerCase() === "who's not touching grass?") {
        msg.reply("This command is currently unavailable")
        // let players = await mcServer.getOnlinePlayers()

        // let embed = new Discord.MessageEmbed()
        //
        // if (players.online === 0) {
        //     embed.setTitle("Ooh. It seems like everyone is touching grass at the moment")
        // }
        // else if (players.online < 3) {
        //     embed.setTitle("A few people aren't touching grass at the moment")
        // }
        // else {
        //     embed.setTitle("My Lord. There are a lot of people not touching grass at the moment")
        // }
        // embed.setDescription(players.online + "/" + players.total + " players online\n" + players.players.join(", "))
        // msg.reply({content: " ", embeds: [embed]})
    }

    if (msg.channel.id === "968298113427206195") {
        let guild = msg.guild as Guild
        if (!guild) throw "Unknown Guild"
        let message = msg.content
            .replace(/<@!(\d+)>/, (match: string, userId: string): string => {
                const member = guild.members.cache.get(userId)
                if (member) {
                    return member.nickname || member.user.username
                }
                else {
                    return match
                }
            })
            .replace(/<@(\d+)>/, (match, userId) => {
                const member = guild.members.cache.get(userId)
                if (member) {
                    return member.user.username
                }
                else {
                    return match
                }
            })
            .replace(/<@&(\d+)>/, (match, roleId) => {
                const role = guild.roles.cache.get(roleId)
                if (role) {
                    return role.name
                }
                else {
                    return match
                }
            })
            .replaceAll("@", "")
            .replaceAll("\"", "\\\"")
        RemoteStatusServer.broadcastCommand(`tellraw @a ["",{"text":"[${msg.member?.nickname || msg.member?.user.username} via Discord]","color":"${msg.member?.displayHexColor}"},{"text":" ${message}"}]`)
    }
    // if (msg.channel.id === "892518396166569994" && msg.author.bot === false) {
    //     // mcServer.sendCommand(msg.content)
    // }
    // if (msg.author.id === "404507305510699019" && msg.content.startsWith("test")) {
    //     console.log("RUNNING TEST...")
    //     let attachment = msg.attachments.first()
    //     console.log(attachment)
    //     let name = attachment.name.split(".")
    //     let extension = name[name.length - 1]
    //     let file = await download_discord_attachment(attachment.url, extension)
    //     let font_big = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
    //     let font_small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
    //     Jimp.read(file)
    //         .then(async image => {
    //             // console.log(image.getWidth(), image.getHeight())
    //             let width = image.getWidth()
    //             let height = image.getHeight()
    //
    //             if (width > height && width > 1080) {
    //                 height = (height / width) * 1080
    //                 width = 1080
    //                 image.resize(width, height)
    //             } else if (height > width && height > 1080) {
    //                 width = (width / height) * 1080
    //                 height = 1080
    //                 image.resize(width, height)
    //             }
    //
    //             // Place black bar along bottom
    //             let color = Jimp.rgbaToInt(255, 255, 255, .75)
    //             new Jimp(width, height + 130, "#000", async (err, out) => {
    //                 out.composite(image, 0, 0)
    //
    //                 let author = await Jimp.read(msg.member.avatarURL({format: "jpg"}) || msg.author.avatarURL({format: "jpg"}))
    //                 author.resize(100, 100)
    //                 author.circle()
    //                 out.composite(author, 20, height + 20)
    //
    //                 out.print(font_big, 140, height + 20, msg.member.nickname || msg.author.username)
    //                 out.print(font_small, 140, height + 80, "#" + msg.channel.name)
    //                 if (msg.content && msg.content.length < 100) out.print(font_small, 200, height + 20, {
    //                         text: msg.content,
    //                         alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT
    //                         // alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    //                     },
    //                     width - 220,
    //                     height)
    //                 out.getBufferAsync(Jimp.MIME_JPEG).then(buffer => {
    //                     msg.reply({
    //                         content: "TEST", files: [
    //                             new Discord.MessageAttachment()
    //                                 .setFile(buffer)
    //                         ]
    //                     })
    //                 })
    //             })
    //         })
    // }
    if (msg.channel.id === "968298113427206195" && msg.author.bot === false) {
        let content: any[] = ["", {
            text: "["
        }, {
            text: msg.member?.user.username || "Unknown user",
            color: msg.member?.displayHexColor || "#fff"
        }, {
            text: "] (via Discord) " + msg.content
        }]
        if (msg.attachments.size > 0) {
            for (let attachment of msg.attachments) {
                content.push({
                    text: " - " + attachment[1].name,
                    color: "blue",
                    clickEvent: {
                        action: "open_url",
                        value: attachment[1].url
                    }
                })
                attachment[1].name
            }
        }
        // mcServer.sendCommand("tellraw @a " + JSON.stringify(content))
    }
    else if (msg.content.toLowerCase() === "guess what?") {
        msg.reply({
            content: "_", files: [
                new Discord.MessageAttachment(fs.readFileSync(path.resolve("./") + "/assets/guess_what.jpg"))
            ]
        })
    }
    else if (msg.content.toLowerCase().replaceAll(/[^a-zA-Z0-9]/g, "") === "herecomesanotherchineseearthquake") {
        msg.reply({content: "e" + "br".repeat(Math.floor(Math.random() * 999)), tts: true})
    }
    if ((msg.channel.id === "910649212264386583" || msg.channel.id === "892518396166569994") && msg.content.replace(/[^"“”‘’]/g, "").length >= 2) {
        // Assume this message is a quote
        await SafeQuery("INSERT INTO dbo.Quotes (msg_id, quote) VALUES (@msg,@quote)", [
            {name: "msg", type: mssql.TYPES.VarChar(100), data: msg.id},
            {name: "quote", type: mssql.TYPES.VarChar(100), data: msg.content}
        ])
        msg.react("🫃")

        // Check to see if all users have 'quoteresponseai' enabled
        let users: string[] = ([] as string[]).concat(Array.from(msg.mentions.users.values()).map(u => u.id), msg.member?.id || "")
        let ai = true
        for (let id of users) {
            console.log(id)
            let req = await SafeQuery(`SELECT experimentAIQuoteResponse
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid",
                type: mssql.TYPES.VarChar(20),
                data: id
            }])
            let user = await getUserData(id)

            if (user["experimentAIQuoteResponse"] === false) {
                console.log(req.recordset[0])
                ai = false
                break
            }
        }

        if (ai) {
            console.log("AI responding...")
            let AIres = await ChatGPT.sendMessage(
                "respond to this quote in a funny way:\n\n" +
                msg.content
            )
            let embed = new Discord.MessageEmbed()
            embed.setDescription(AIres.text)
            msg.reply({embeds: [embed]})
        }
    }
    if (msg.content.toLowerCase() === "what are my most popular words?") {
        getUserData(msg.member as GuildMember)
            .then(res => {
                if (res.experimentWords === false) {
                    msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                    return
                }

                SafeQuery("SELECT word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                    {name: "discordid", type: mssql.TYPES.VarChar(100), data: msg.member?.id || ""}
                ])
                    .then(res => {
                        if (res.recordset.length < 20) {
                            msg.reply("We don't quite have enough data yet. Keep talking and we'll be able to tell you.")
                        }
                        else {
                            let embed = new Discord.MessageEmbed()
                            let top = res.recordset.slice(0, 20).map((i: any) => {
                                return "`" + toTitleCase(i.word) + "` " + i.sum + " times"
                            })
                            embed.setTitle("You've said...")
                            embed.setDescription(top.join("\n"))
                            embed.setFooter({text: "Crash Bot words experiment"})
                            msg.reply({content: " ", embeds: [embed]})
                        }
                    })
            })
    }
    else if (msg.content.toLowerCase().includes("how many times have i said ")) {
        getUserData(msg.member as GuildMember)
            .then(async res => {
                if (res.experimentWords === false) {
                    msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                    return
                }

                let words = msg.content.toLowerCase().split("how many times have i said ")[1].replace(/[^A-Za-z ]/g, "").split(" ")
                let words_results = []
                let embed = new Discord.MessageEmbed()

                for (let word of words) {
                    if (word === "") continue

                    let res = await SafeQuery("SELECT word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid AND word = @word GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                        {name: "discordid", type: mssql.TYPES.VarChar(100), data: msg.member?.id || ""},
                        {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                    ])
                    if (res.recordset.length === 0) {
                        words_results.push("You haven't said `" + toTitleCase(word) + "` yet.")
                    }
                    else {
                        words_results.push("`" + toTitleCase(word) + "` " + res.recordset[0].sum + " times")
                    }
                }

                embed.setTitle("You've said...")
                embed.setDescription(words_results.join("\n"))
                embed.setFooter({text: "Crash Bot words experiment"})
                msg.reply({content: " ", embeds: [embed]})
            })
    }
    else if (msg.content.toLowerCase().includes("how many times have we said ")) {
        getUserData(msg.member as GuildMember)
            .then(async res => {
                if (res.experimentWords === false) {
                    msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                    return
                }

                let words = msg.content.toLowerCase().split("how many times have we said ")[1].replace(/[^A-Za-z ]/g, "").split(" ")
                let words_results = []
                let embed = new Discord.MessageEmbed()

                let likelihood = -1

                for (let word of words) {
                    if (word === "") continue

                    let res = await SafeQuery("SELECT word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE word = @word AND guild_id = @guildid GROUP BY word ORDER BY sum DESC", [
                        {name: "word", type: mssql.TYPES.VarChar(100), data: word},
                        {name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || ""},
                    ])
                    if (res.recordset.length === 0) {
                        words_results.push("We haven't said `" + toTitleCase(word) + "` yet.")
                        likelihood = 0
                    }
                    else {
                        words_results.push("We've said `" + toTitleCase(word) + "` " + res.recordset[0].sum + " times")
                        if (likelihood === -1) likelihood = res.recordset[0].sum
                        else if (likelihood === 0) {}
                        else likelihood = likelihood / res.recordset[0].sum
                    }
                }

                embed.setTitle("Of all the people on this server who have the experiment enabled...")
                embed.setDescription(words_results.join("\n"))
                embed.setFooter({text: `The overall phrase (statistically) has been said ${Math.floor(likelihood)} times. Crash Bot words experiment`})
                msg.reply({content: " ", embeds: [embed]})
            })
    }
    else if (msg.content.toLowerCase().includes("what are some barely spoken words")) {
        if (msg.channel.type === "DM") {
            msg.reply("Oops. You can't use this phrase in this channel")
            return
        }
        let results = await SafeQuery("SELECT TOP 10 word, SUM(count + pseudo_addition) as 'count', discord_id FROM CrashBot.dbo.WordsExperiment WHERE guild_id=@guildid AND \"count\" = 1 GROUP BY word, discord_id ORDER BY \"count\", NEWID()", [
            {name: "guildid", type: mssql.TYPES.VarChar(), data: msg.channel.guild.id}
        ])
        msg.reply({
            content: " ",
            embeds: [
                new Discord.MessageEmbed()
                    .setDescription("These words have only ever been spoken once in this server:\n" +
                        results.recordset.map(i => {return `- \`${i.word}\` by <@${i.discord_id}>`}).join("\n")
                    )
                    .setFooter({text: "Crash Bot only counts words as of 2023-08-01, and only from users who have the words experiment enabled."})
            ]
        })
    }
    else if (msg.content.toLowerCase().replaceAll(" ", "").startsWith("whatis<@") && msg.content.toLowerCase().replaceAll(" ", "").endsWith("'scatchphrase?") && (msg.mentions.members?.size || 0) > 0) {
        getUserData(msg.member as GuildMember)
            .then(res => {
                if (res.experimentWords === false) {
                    msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                    return
                }

                SafeQuery("SELECT TOP 30 word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                    {name: "discordid", type: mssql.TYPES.VarChar(100), data: msg.mentions.members?.firstKey() || ""}
                ])
                    .then(async res => {
                        if (res.recordset.length < 20) {
                            msg.reply("We don't quite have enough data yet. The user you mentioned may not have this experiment enabled.")
                        }
                        else {
                            let top = ShuffleArray(res.recordset).slice(0, 20).map((i: any) => {
                                return toTitleCase(i.word)
                            })
                            ChatGPT.sendMessage(
                                "Using some of these words, create a catchphrase. Extra words can be added.\n\n" +
                                top.join(", ")
                            )
                                .then(AIres => {
                                    let embed = new Discord.MessageEmbed()
                                    console.log("Using some of these words, create a catchphrase. Extra words can be added.\n\n" +
                                        top.join(", "))

                                    embed.setTitle("Is this your catchphrase?")
                                    embed.setDescription(AIres.text)
                                    embed.setFooter({text: "Crash Bot words experiment"})
                                    msg.reply({content: " ", embeds: [embed]})
                                })
                                .catch(e => {
                                    console.log(e)
                                    let embed = new Discord.MessageEmbed()
                                    embed.setTitle("Service unavailable")
                                    embed.setDescription("This service is currently unavailable. Please try again later")
                                    embed.setColor("RED")
                                    embed.setFooter({text: "Crash Bot words experiment"})
                                    msg.reply({content: " ", embeds: [embed]})
                                })
                        }
                    })
            })
    }
    else if (msg.content.toLowerCase().replace(/[^a-z]/g, '') === "whatisourserverscatchphrase") {
        getUserData(msg.member as GuildMember)
            .then(res => {
                if (res.experimentWords === false) {
                    msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                    return
                }

                SafeQuery("SELECT TOP 40 word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE guild_id = @guildid GROUP BY word ORDER BY sum DESC",
                    [{name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || ""},
                    ]
                )
                    .then(async res => {
                        if (res.recordset.length < 20) {
                            msg.reply("We don't quite have enough data yet. Keep talking and we'll be able to tell you.")
                        }
                        else {
                            let top = ShuffleArray(res.recordset).slice(0, 20).map((i: any) => {
                                return {
                                    word: i.word,
                                    sum: i.sum
                                }
                            })
                            ChatGPT.sendMessage(
                                "Using some of these words, create a catchphrase. Extra words can be added.\n\n" +
                                top.map(i => i.word).join(", ")
                            )
                                .then(AIres => {
                                    let embed = new Discord.MessageEmbed()

                                    embed.setTitle("Would this be a suitable catchphrase?")
                                    embed.setDescription(AIres.text)
                                    embed.setFooter({text: "Crash Bot words experiment"})
                                    embed.setFields([{name: "Sampled words", value: top.map(i => i.word).join(", ")}])
                                    msg.reply({content: " ", embeds: [embed]})
                                })
                                .catch(e => {
                                    console.log(e)
                                    let embed = new Discord.MessageEmbed()
                                    embed.setTitle("Service unavailable")
                                    embed.setDescription("This service is currently unavailable. Please try again later")
                                    embed.setColor("RED")
                                    embed.setFooter({text: "Crash Bot words experiment"})
                                    msg.reply({content: " ", embeds: [embed]})
                                })
                        }
                    })
            })
    }
    else if (msg.channel.id !== "892518159167393823" && (Math.random() <= 0.01 || msg.content.toLowerCase() === "i need inspiring")) {
        quoteReply(msg.channel)
    }
    else if (msg.channel.id === "999848214691852308") {
        let url = msg.content

        // Check audio queue
        if (!msg.member?.voice.channel) {
            msg.reply("You need to join a voice channel first")
                .then(msg_2 => {
                    setTimeout(() => {
                        msg.delete()
                        msg_2.delete()
                    }, 3000)
                })
            return
        }
        VoiceConnectionManager.join((msg.channel as TextChannel).guild, msg.member.voice.channel)
            .then(manager => {
                manager?.addToQueue(url)
                msg.delete()
            })
            .catch(e => {
                console.log(e)
            })
    }
    else if (msg.channel.type === "DM") {
        askGPTQuestion(msg.author.username + " said: " + msg.content, msg.channel)
    }
    else {
        // Do word count
        if (!msg.member) return
        getUserData(msg.member as GuildMember)
            .then(async res => {
                if (res.experimentBabyWords && msg.mentions.members?.size === 0 && msg.mentions.roles.size === 0) {
                    // Talk like a 5-year-old
                    if (msg.content.startsWith("b - ")) return

                    let _words = msg.content.split(" ")

                    for (let i in _words) {
                        if (_words[i].startsWith("http") || _words[i].startsWith("<") || _words[i].startsWith(">") || _words[i].startsWith("`")) continue
                        if (_words[i] in bad_baby_words.words) _words[i] = "dumb"
                        // @ts-ignore
                        if (Math.random() < .1) _words[i] = randomWords(1)[0]

                        let letters = _words[i].split("")
                        for (let r in letters) {
                            if (Math.random() < .1) letters[r] = baby_alphabet[Math.floor(Math.random() * baby_alphabet.length)]
                        }
                        _words[i] = letters.join("")
                        console.log(_words[i])

                    }

                    if (Math.random() < .1) {
                        _words = ([] as string[]).concat(_words.map(word => word.toUpperCase()), ["\n", "sorry.", "I", "left", "caps", "lock", "on"])
                    }

                    if (!(msg.channel instanceof TextChannel)) {
                        return
                    }
                    let channel = msg.channel as TextChannel
                    channel
                        .fetchWebhooks()
                        .then((hooks): Promise<Discord.Webhook> => {
                            let webhook = hooks.find(hook => {
                                return hook.name === (msg.member?.nickname || msg.member?.user.username || "Unknown member")
                            })
                            if (webhook) {
                                return new Promise((resolve) => {
                                    // @ts-ignore
                                    resolve(webhook)
                                })
                            }
                            else {
                                return channel.createWebhook(msg.member?.nickname || msg.member?.user.username || "Unknown user", {
                                    avatar: msg.member?.avatarURL() || msg.member?.user.avatarURL(),
                                    reason: "Needed new cheese"
                                })
                            }
                        })
                        .then(webhook => {
                            console.log(webhook)
                            webhook.send(_words.join(' ')).then(() => {
                                msg.delete()
                                webhook.delete()
                            })
                        }).catch(e => {
                        console.error(e)
                    })
                }
                if (res.experimentWords) {
                    let words = msg.content.replace(/[^A-Za-z ]/g, "").toLowerCase().split(" ")
                    let spam = false
                    for (let word of words) {
                        let appears = words.filter(i => i === word)
                        if ((appears.length / words.length) > 0.40 && words.length > 5) {
                            spam = true
                            continue
                        }

                        if (word.length > 100) continue
                        if (word === "") continue
                        let data = await SafeQuery("SELECT * FROM dbo.WordsExperiment WHERE discord_id = @discordid AND word = @word AND guild_id = @guildid", [
                            {
                                name: "discordid",
                                type: mssql.TYPES.VarChar(20),
                                data: msg.member?.id || "Unknown member"
                            },
                            {name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || "Unknown guild"},
                            {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                        ])
                        if (data.recordset.length === 0) {
                            await SafeQuery("INSERT INTO dbo.WordsExperiment (word, discord_id, guild_id) VALUES (@word, @discordid, @guildid);", [
                                {
                                    name: "discordid",
                                    type: mssql.TYPES.VarChar(20),
                                    data: msg.member?.id || "Unknown member"
                                },
                                {
                                    name: "guildid",
                                    type: mssql.TYPES.VarChar(20),
                                    data: msg.guild?.id || "Unknown guild"
                                },
                                {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                            ])
                        }
                        else {
                            await SafeQuery("UPDATE dbo.WordsExperiment SET count=count + 1, last_appeared=SYSDATETIME() WHERE id = @id", [
                                {name: "id", type: mssql.TYPES.BigInt(), data: data.recordset[0].id}
                            ])
                            let res = await SafeQuery("SELECT SUM(count + pseudo_addition) AS 'sum' FROM dbo.WordsExperiment WHERE word = @word AND guild_id = @guildid", [
                                {name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || ""},
                                {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                            ])
                            if (!res.recordset[0].sum) return
                            if ((res.recordset[0].sum % 100) === 0) {
                                client.channels.fetch("950939869776052255")
                                    .then((channel) => {
                                        let title: string = `<@${msg.author.username}> just said ${word} for the ${res.recordset[0].sum}th time!`
                                        let message = `Of all users with this experiment enabled, <@${msg.author.id}> just said \`${word}\`for the ${res.recordset[0].sum}th time!`;

                                        (channel as TextBasedChannel).send({content: ' ', embeds: [
                                            new Discord.MessageEmbed()
                                                .setTitle(title)
                                                .setDescription(message)
                                                ]})
                                        msg.reply(`Of everyone with the words experiment enabled, you just said \`${word}\` for the ${res.recordset[0].sum}th time!`)
                                    })
                            }
                        }
                    }
                    if (spam) msg.react("😟")
                }
            })
        if (imageCaptureChannels.indexOf(msg.channel.id) !== -1 && !msg.author.bot) {
            let urls = msg.content.match(/\bhttps?:\/\/\S+/gi) || []
            let yt_urls: any[] = []
            for (let url of urls) {
                if (ytdl.validateURL(url)) yt_urls.push(url)
            }

            if (msg.attachments.size > 0 || yt_urls.length > 0) {
                msg.react("❌").then(reaction => {
                    msg.awaitReactions({
                        filter: (reaction, user) => {
                            return reaction.emoji.name === "❌" && user.id === msg.author.id
                        },
                        max: 1,
                        time: 15000
                    }).then(async reactions => {
                        if (reactions.size === 0) {
                            console.log("Saving memory...")
                            for (let attachment of msg.attachments) {
                                console.log(attachment)
                                await SafeQuery("INSERT INTO dbo.Memories (author_discord_id, channel_id, data, msg_id, attachment_id) VALUES (@author,@channel,@data,@msg,@attachmentid)", [
                                    {name: "author", type: mssql.TYPES.VarChar(100), data: msg.author.id},
                                    {name: "channel", type: mssql.TYPES.VarChar(100), data: msg.channel.id},
                                    {name: "data", type: mssql.TYPES.VarChar(100), data: attachment[1].name},
                                    {name: "msg", type: mssql.TYPES.VarChar(100), data: msg.id},
                                    {name: "attachmentid", type: mssql.TYPES.VarChar(100), data: attachment[1].id}
                                ])
                                console.log("Saved attachment")
                            }

                            for (let url of yt_urls) {
                                await SafeQuery("INSERT INTO dbo.Memories (author_discord_id, channel_id, data, msg_id, type) VALUES (@author,@channel,@data,@msg,1)", [
                                    {name: "author", type: mssql.TYPES.VarChar(100), data: msg.author.id},
                                    {name: "channel", type: mssql.TYPES.VarChar(100), data: msg.channel.id},
                                    {name: "data", type: mssql.TYPES.VarChar(100), data: url},
                                    {name: "msg", type: mssql.TYPES.VarChar(100), data: msg.id}
                                ])
                            }
                        }
                    }).catch(e => {
                    })
                        .finally(() => {
                            reaction.remove()
                        })
                })
            }
        }
    }
})

process.on("unhandledRejection", (e) => {
    console.error(e)
})

function quoteReply(channel: TextBasedChannel, interaction: MessageComponentInteraction | null = null) {
    inspirobot.generateImage()
        .then((image: string) => {
            let msg_content = {
                content: 'Created by: inspirobot.me',
                files: [
                    new Discord.MessageAttachment(image, "quote.jpg")
                ],
                components: [
                    new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setCustomId("another_inspiro_quote")
                                .setLabel("Another!")
                                .setStyle("PRIMARY"),
                            new Discord.MessageButton()
                                .setCustomId("offensive_inspiro_quote")
                                .setLabel("I found this offensif")
                                .setStyle("SECONDARY")
                        )
                ]
            }
            if (interaction) interaction.reply(msg_content)
            else channel.send(msg_content)
        })
}

async function askGPTQuestion(message: string, channel: TextBasedChannel, interaction?: Discord.BaseCommandInteraction) {
    let gpt_channel_search = await SafeQuery("SELECT * FROM dbo.GPTCHannels WHERE channelid = @channelid", [
        {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id}
    ])
    if (interaction) await interaction.deferReply()
    else await channel.sendTyping();
    message = removeAllMentions(message, channel)

    let result_message
    if (message.toLowerCase().endsWith("reset conversation") && gpt_channel_search.recordset.length === 0) {
        result_message = "There is no conversation to reset"
    } else if (gpt_channel_search.recordset.length === 0) {
        let gpt_message = await ChatGPT.sendMessage(message)
        console.log(gpt_message)
        await SafeQuery("INSERT INTO CrashBot.dbo.GPTChannels (channelid, conversationid, lastmessageid) VALUES (@channelid, @conversationid, @messageid);", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
            {name: "conversationid", type: mssql.TYPES.VarChar(100), data: gpt_message.conversationId || ""},
            {name: "messageid", type: mssql.TYPES.VarChar(100), data: gpt_message.parentMessageId || ""}
        ])
        result_message = gpt_message.text
    } else if (message.toLowerCase().endsWith("reset conversation")) {
        await SafeQuery("DELETE FROM dbo.GPTChannels WHERE channelid = @channelid", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
        ])
        result_message = "This conversation has been reset"
    }
    else {
        let gpt_message = await ChatGPT.sendMessage(message, {
            parentMessageId: gpt_channel_search.recordset[0].lastmessageid
        })
        await SafeQuery("UPDATE dbo.GPTChannels SET lastmessageid=@messageid WHERE channelid = @channelid", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
            {name: "messageid", type: mssql.TYPES.VarChar(100), data: gpt_message.parentMessageId || ""}
        ])

        result_message = gpt_message.text
    }

    let interaction_replied = false
    for (let text of splitMessage(result_message)) {
        if (interaction && !interaction_replied) {
            await interaction.editReply({
                content: " ",
                embeds: [new Discord.MessageEmbed()
                    .setDescription(message)
                ]
            })
            interaction_replied = true
        }
        channel.send(text)
    }
}

function splitMessage(message: string): string[] {
    let messages: string[] = []
    while (message.length > 0) {
        messages.push(message.slice(0,2000))
        message = message.slice(2000, message.length)
    }
    console.log(messages)
    return messages
}

function toTitleCase(str: string) {
    return str.replace(
        /\w\S*/g,
        function (txt: string) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

client.on("messageDelete", msg => {
    console.log(msg)
    for (let attachment of msg.attachments) {
        SafeQuery(`DELETE
                   FROM dbo.Banners
                   WHERE url = @url`, [{
            name: "url",
            type: mssql.TYPES.VarChar(200),
            data: attachment[1].url
        }])
    }
})


function removeAllMentions(str: string, channel_or_guild: Discord.Guild | TextBasedChannel): string {
    let channel: Discord.TextBasedChannel | undefined
    let guild: Discord.Guild | undefined
    if (channel_or_guild instanceof Discord.TextChannel) {
        channel = channel_or_guild
        guild = channel.guild
    } else if (channel_or_guild instanceof Discord.Guild) {
        guild = channel_or_guild
    } else {
        channel = channel_or_guild
    }
    return str.replace(/<@!(\d+)>/, (match: string, userId: string): string => {
        const user = client.users.cache.get(userId)
        if (user) {
            return user.username
        }
        else {
            return match
        }
    })
        .replace(/<@(\d+)>/, (match, userId) => {
            const user = client.users.cache.get(userId)
            if (user) {
                return user.username
            }
            else {
                return match
            }
        })
        .replace(/<@&(\d+)>/, (match, roleId) => {
            if (!guild) return `<@&${roleId}>`
            const role = guild.roles.cache.get(roleId)
            if (role) {
                return role.name
            }
            else {
                return match
            }
        })
        .replaceAll("@", "")
        .replaceAll("\"", "\\\"")
}

// Setup
async function setup() {
    let array_entities;
    try {
        // console.log(await SafeQuery("SELECT * FROM dbo.Users"))
        //
        // let tracks = JSON.parse(fs.readFileSync(path.resolve("./") + "/tracks.json").toString())
        // let sql = "INSERT INTO dbo.PlaylistItems (playlist_id, player, source_id) VALUES "
        // sql = sql + tracks.map(track => {
        //     if (track.player === "ytdl") {
        //         return `(1, 0, '${track.id}')`
        //     }
        //     return `(1, 1, '${track.id}')`
        // }).join(", ")
        // await SafeQuery(sql)
        console.log("Performing setup!")

        await setupBungieAPI()
        // await updateMSVendors()

        // let manifest = await getManifest()
        // console.log(manifest.)
        // console.log(manifest)


        if (false) {
            // Process pack blocks
            // let blocks = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/blocks.json").toString())
            let sound_defs = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/sounds/sound_definitions.json").toString()).sound_definitions
            let queries = []

            for (let item of Object.keys(sound_defs)) {
                await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundDefinitions (Name, category) VALUES (@name, @category);", [
                    {name: "name", type: mssql.TYPES.VarChar(100), data: item},
                    {name: "category", type: mssql.TYPES.VarChar(100), data: sound_defs[item].category}
                ])
                sound_defs[item].id = (await SafeQuery("SELECT SoundDefID FROM CrashBot.dbo.PackSoundDefinitions WHERE Name = @name;", [
                    {name: "name", type: mssql.TYPES.VarChar(100), data: item}
                ])).recordset[0].SoundDefID

                for (let sound of sound_defs[item].sounds) {
                    if (typeof sound === "string") {
                        queries.push(`INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, DefaultFile)
                                      VALUES (${sound_defs[item].id}, '${sound}')`)
                    }
                    else {
                        // SafeQuery("INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch) VALUES (@defid, @is3D, @vol, @pitch);", [
                        //     {name: "defid", type: mssql.TYPES.Int(), data: sound_defs[item].id},
                        //     {name: "is3D", type: mssql.TYPES.Bit(), data: sound.is3D || false},
                        //     {name: "vol", type: mssql.TYPES.Decimal, data: sound.volume || 1},
                        //     {name: "pitch", type: mssql.TYPES.Decimal, data: sound.pitch || 1},
                        //     {name: "weight", type: mssql.TYPES.Int(), data: sound.weight || 1}
                        // ])
                        queries.push(`INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch, DefaultFile)
                                      VALUES (${sound_defs[item].id},
                                              ${sound.is3D || typeof sound.is3D === "undefined" ? 1 : 0},
                                              ${sound.volume || 1},
                                              ${sound.pitch || 1}, '${sound.name}')`)
                    }
                }
                // console.log(sound_defs[item].id)
            }
            await SafeQuery(queries.join(";") + ";")

            let sounds = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/sounds.json").toString())
            let _sounds
            _sounds = sounds.block_sounds
            for (let sound of Object.keys(_sounds)) {
                let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                    {name: "pitchlow", type: mssql.TYPES.Float(), data: pitch_low},
                    {name: "pitchhigh", type: mssql.TYPES.Float(), data: pitch_high},
                    {name: "vollow", type: mssql.TYPES.Float(), data: vol_low},
                    {name: "volhigh", type: mssql.TYPES.Float(), data: vol_high},
                    {name: "name", type: mssql.TYPES.VarChar(100), data: sound},
                    {name: "type", type: mssql.TYPES.VarChar(100), data: "block_sounds"},
                ])

                _sounds[sound].id = (await SafeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                    name: "name",
                    type: mssql.TYPES.VarChar(100),
                    data: sound
                }])).recordset[0].SoundGroupID

                for (let event of Object.keys(_sounds[sound].events)) {
                    if (!_sounds[sound].events[event].sound) continue
                    if (!sound_defs[_sounds[sound].events[event].sound]) continue
                    console.log(_sounds[sound].events[event].sound)
                    SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                        {
                            name: "pitchlow",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "pitchhigh",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "vollow",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                        },
                        {
                            name: "volhigh",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                        },
                        {name: "id", type: mssql.TYPES.Int(), data: _sounds[sound].id},
                        {name: "type", type: mssql.TYPES.VarChar(100), data: event},
                        {
                            name: "defid",
                            type: mssql.TYPES.Int(),
                            data: sound_defs[_sounds[sound].events[event].sound].id
                        },
                    ])

                }
            }

            _sounds = sounds.entity_sounds.entities
            for (let sound of Object.keys(_sounds)) {
                let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                    {name: "pitchlow", type: mssql.TYPES.Float(), data: pitch_low},
                    {name: "pitchhigh", type: mssql.TYPES.Float(), data: pitch_high},
                    {name: "vollow", type: mssql.TYPES.Float(), data: vol_low},
                    {name: "volhigh", type: mssql.TYPES.Float(), data: vol_high},
                    {name: "name", type: mssql.TYPES.VarChar(100), data: sound},
                    {name: "type", type: mssql.TYPES.VarChar(100), data: "block_sounds"},
                ])

                _sounds[sound].id = (await SafeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                    name: "name",
                    type: mssql.TYPES.VarChar(100),
                    data: sound
                }])).recordset[0].SoundGroupID

                sounds.entity_sounds.entities[sound].id = _sounds[sound].id

                for (let event of Object.keys(_sounds[sound].events)) {
                    if (!_sounds[sound].events[event].sound) continue
                    if (!sound_defs[_sounds[sound].events[event].sound]) continue
                    console.log(_sounds[sound].events[event].sound)
                    SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                        {
                            name: "pitchlow",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "pitchhigh",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "vollow",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                        },
                        {
                            name: "volhigh",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                        },
                        {name: "id", type: mssql.TYPES.Int(), data: _sounds[sound].id},
                        {name: "type", type: mssql.TYPES.VarChar(100), data: event},
                        {
                            name: "defid",
                            type: mssql.TYPES.Int(),
                            data: sound_defs[_sounds[sound].events[event].sound].id
                        },
                    ])

                }
            }

            _sounds = sounds.individual_event_sounds.events
            await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (1, 1, 1, 1, 'indiv', 'individual_event_sounds');")

            let individual_id = (await SafeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = 'indiv'")).recordset[0].SoundGroupID
            for (let event of Object.keys(_sounds)) {
                if (!_sounds[event].sound) continue
                if (!sound_defs[_sounds[event].sound]) continue
                console.log(_sounds[event].sound)
                SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                    {
                        name: "pitchlow",
                        type: mssql.TYPES.Float(),
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].pitch[0] : (_sounds[event].pitch || 1)
                    },
                    {
                        name: "pitchhigh",
                        type: mssql.TYPES.Float(),
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].pitch[1] : (_sounds[event].pitch || 1)
                    },
                    {
                        name: "vollow",
                        type: mssql.TYPES.Float(),
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].volume[0] : (_sounds[event].volume || 1)
                    },
                    {
                        name: "volhigh",
                        type: mssql.TYPES.Float(),
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].volume[1] : (_sounds[event].volume || 1)
                    },
                    {name: "id", type: mssql.TYPES.Int(), data: individual_id},
                    {name: "type", type: mssql.TYPES.VarChar(100), data: event},
                    {name: "defid", type: mssql.TYPES.Int(), data: sound_defs[_sounds[event].sound].id},
                ])

            }

            _sounds = sounds.interactive_sounds.block_sounds
            for (let sound of Object.keys(_sounds)) {
                let _sounds = sounds.block_sounds
                let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                    {name: "pitchlow", type: mssql.TYPES.Float(), data: pitch_low},
                    {name: "pitchhigh", type: mssql.TYPES.Float(), data: pitch_high},
                    {name: "vollow", type: mssql.TYPES.Float(), data: vol_low},
                    {name: "volhigh", type: mssql.TYPES.Float(), data: vol_high},
                    {name: "name", type: mssql.TYPES.VarChar(100), data: sound},
                    {name: "type", type: mssql.TYPES.VarChar(100), data: "interactive_sounds.block_sounds"},
                ])

                _sounds[sound].id = (await SafeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                    name: "name",
                    type: mssql.TYPES.VarChar(100),
                    data: sound
                }])).recordset[0].SoundGroupID

                for (let event of Object.keys(_sounds[sound].events)) {
                    if (!_sounds[sound].events[event].sound) continue
                    if (!sound_defs[_sounds[sound].events[event].sound]) continue
                    console.log(_sounds[sound].events[event].sound)
                    SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                        {
                            name: "pitchlow",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "pitchhigh",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "vollow",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                        },
                        {
                            name: "volhigh",
                            type: mssql.TYPES.Float(),
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                        },
                        {name: "id", type: mssql.TYPES.Int(), data: _sounds[sound].id},
                        {name: "type", type: mssql.TYPES.VarChar(100), data: event},
                        {
                            name: "defid",
                            type: mssql.TYPES.Int(),
                            data: sound_defs[_sounds[sound].events[event].sound].id
                        },
                    ])

                }
            }

            _sounds = sounds.interactive_sounds.entity_sounds.entities
            for (let sound of Object.keys(_sounds)) {
                for (let sound of Object.keys(_sounds)) {
                    console.log(_sounds[sound])
                    let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                    let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                    let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                    let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                    await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                        {name: "pitchlow", type: mssql.TYPES.Float(), data: pitch_low},
                        {name: "pitchhigh", type: mssql.TYPES.Float(), data: pitch_high},
                        {name: "vollow", type: mssql.TYPES.Float(), data: vol_low},
                        {name: "volhigh", type: mssql.TYPES.Float(), data: vol_high},
                        {name: "name", type: mssql.TYPES.VarChar(100), data: sound},
                        {name: "type", type: mssql.TYPES.VarChar(100), data: "interactive_sounds.entity_sounds"},
                    ])

                    _sounds[sound].id = (await SafeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                        name: "name",
                        type: mssql.TYPES.VarChar(100),
                        data: sound
                    }])).recordset[0].SoundGroupID

                    sounds.interactive_sounds.entity_sounds.entities[sound].id = _sounds[sound].id

                    if (!_sounds[sound].events) continue
                    for (let event of Object.keys(_sounds[sound].events)) {
                        if (!_sounds[sound].events[event].sound) continue
                        if (!sound_defs[_sounds[sound].events[event].sound]) continue
                        console.log(_sounds[sound].events[event].sound)
                        SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                            {
                                name: "pitchlow",
                                type: mssql.TYPES.Float(),
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                            },
                            {
                                name: "pitchhigh",
                                type: mssql.TYPES.Float(),
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                            },
                            {
                                name: "vollow",
                                type: mssql.TYPES.Float(),
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                            },
                            {
                                name: "volhigh",
                                type: mssql.TYPES.Float(),
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                            },
                            {name: "id", type: mssql.TYPES.Int(), data: _sounds[sound].id},
                            {name: "type", type: mssql.TYPES.VarChar(100), data: event},
                            {
                                name: "defid",
                                type: mssql.TYPES.Int(),
                                data: sound_defs[_sounds[sound].events[event].sound].id
                            },
                        ])

                    }
                }
            }
            // IMPORT TEXTURES
            let terrain_textures = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/textures/terrain_texture.json").toString()).texture_data
            for (let item of Object.keys(terrain_textures)) {
                await SafeQuery("INSERT INTO CrashBot.dbo.PackTextureGroups (GameID, type) VALUES (@item, 'terrain_texture');", [
                    {name: "item", type: mssql.TYPES.VarChar(100), data: item}
                ])
                terrain_textures[item].id = (await SafeQuery("SELECT TextureGroupID FROM dbo.PackTextureGroups WHERE GameID = @item AND type = 'terrain_texture'", [
                    {name: "item", type: mssql.TYPES.VarChar(100), data: item}
                ])).recordset[0].TextureGroupID
                if (!terrain_textures[item].textures) continue
                let sub_textures = Array.isArray(terrain_textures[item].textures) ? terrain_textures[item].textures : [terrain_textures[item].textures]
                for (let i = 0; i < sub_textures.length; i++) {
                    if (typeof sub_textures[i] === "string") {
                        SafeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile) VALUES (@id, @pos, @deffile)", [
                            {name: "id", type: mssql.TYPES.Int(), data: terrain_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int(), data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar(100), data: sub_textures[i]}
                        ])
                    }
                    else {
                        SafeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile, OverlayColor) VALUES (@id, @pos, @deffile, @color)", [
                            {name: "id", type: mssql.TYPES.Int(), data: terrain_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int(), data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar(100), data: sub_textures[i].path},
                            {
                                name: "color",
                                type: mssql.TYPES.VarChar(100),
                                data: sub_textures[i].overlay_color ? sub_textures[i].overlay_color.replace("#", "") : null
                            }
                        ])
                    }
                }
            }

            let item_textures = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/textures/item_texture.json").toString()).texture_data
            for (let item of Object.keys(item_textures)) {
                await SafeQuery("INSERT INTO CrashBot.dbo.PackTextureGroups (GameID, type) VALUES (@item, 'item_texture');", [
                    {name: "item", type: mssql.TYPES.VarChar(100), data: item}
                ])
                item_textures[item].id = (await SafeQuery("SELECT TextureGroupID FROM dbo.PackTextureGroups WHERE GameID = @item AND type = 'item_texture'", [
                    {name: "item", type: mssql.TYPES.VarChar(100), data: item}
                ])).recordset[0].TextureGroupID

                SafeQuery("INSERT INTO CrashBot.dbo.PackItems (PackID, TextureGroupID, GameID) VALUES (1, @id, @gameid);", [
                    {name: "id", type: mssql.TYPES.Int(), data: item_textures[item].id},
                    {name: "gameid", type: mssql.TYPES.VarChar(100), data: item}
                ])

                if (!item_textures[item].textures) continue
                let sub_textures = Array.isArray(item_textures[item].textures) ? item_textures[item].textures : [item_textures[item].textures]
                for (let i = 0; i < sub_textures.length; i++) {
                    if (typeof sub_textures[i] === "string") {
                        SafeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile) VALUES (@id, @pos, @deffile)", [
                            {name: "id", type: mssql.TYPES.Int(), data: item_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int(), data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar(100), data: sub_textures[i]}
                        ])
                    }
                    else {
                        SafeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile, OverlayColor) VALUES (@id, @pos, @deffile, @color)", [
                            {name: "id", type: mssql.TYPES.Int(), data: item_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int(), data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar(100), data: sub_textures[i].path},
                            {
                                name: "color",
                                type: mssql.TYPES.VarChar(100),
                                data: sub_textures[i].overlay_color ? sub_textures[i].overlay_color.replace("#", "") : null
                            }
                        ])
                    }
                }
            }

            // IMPORT BLOCKS
            let blocks = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/blocks.json").toString())
            for (let item of Object.keys(blocks)) {
                await SafeQuery("INSERT INTO CrashBot.dbo.PackBlocks (PackID, GameID, SoundGroupID) VALUES (1, @name, @sound);", [
                    {name: "name", type: mssql.TYPES.VarChar(100), data: item},
                    {
                        name: "sound",
                        type: mssql.TYPES.Int(),
                        data: blocks[item].sound ? sounds.block_sounds[blocks[item].sound].id : null
                    }
                ])
                blocks[item].id = (await SafeQuery("SELECT BlockID FROM dbo.PackBlocks WHERE GameID = @name", [
                    {name: "name", type: mssql.TYPES.VarChar(100), data: item}
                ])).recordset[0].BlockID

                if (!blocks[item].textures) continue
                let block_textures = typeof blocks[item].textures === "string" ? {default: blocks[item].textures} : blocks[item].textures
                for (let texture of Object.keys(block_textures)) {
                    SafeQuery('INSERT INTO CrashBot.dbo.PackBlockTextures (BlockID, TextureGroupID, Type) VALUES (@id, @textureid, @type);', [
                        {name: "id", type: mssql.TYPES.Int(), data: blocks[item].id},
                        {
                            name: "textureid",
                            type: mssql.TYPES.Int(),
                            data: terrain_textures[block_textures[texture]].id
                        },
                        {name: "type", type: mssql.TYPES.VarChar(100), data: texture}
                    ])
                }
            }

            // IMPORT ENTITIES
            let array_entities = fs.readdirSync(path.resolve("./") + "/assets/pack/entity").map(file => {
                console.log(file);
                return JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/entity/" + file).toString())
            })
            let entities: any = {}
            // De-duplicate entities
            for (let entity of array_entities) entities[entity["minecraft:client_entity"]["description"]["identifier"]] = entity
            array_entities = Object.values(entities)
            entities = {}

            for (let entity of array_entities) {
                let identifier = entity["minecraft:client_entity"]["description"]["identifier"]
                entities[identifier] = entity
                let sound_group = sounds.entity_sounds.entities[identifier.split(":")[1]] || null
                let interactive_sound_group = sounds.interactive_sounds.entity_sounds.entities[identifier.split(":")[1]] || null
                await SafeQuery("INSERT INTO CrashBot.dbo.PackEntities (PackID, identifier, SoundGroupID, InteractiveSoundGroupID) VALUES (1, @name, @sgroup, @isgroup);", [
                    {name: "name", type: mssql.TYPES.VarChar(100), data: identifier},
                    {name: "sgroup", type: mssql.TYPES.Int(), data: sound_group ? sound_group.id : null},
                    {
                        name: "isgroup",
                        type: mssql.TYPES.Int(),
                        data: interactive_sound_group ? interactive_sound_group.id : null
                    }
                ])
                entities[identifier].id = (await SafeQuery("SELECT EntityID FROM dbo.PackEntities WHERE identifier = @name", [
                    {name: "name", type: mssql.TYPES.VarChar(100), data: identifier}
                ])).recordset[0].EntityID

                if (!entity["minecraft:client_entity"]["description"].textures) continue
                let entity_textures = typeof entity["minecraft:client_entity"]["description"].textures === "string" ? {default: entity["minecraft:client_entity"]["description"].textures} : entity["minecraft:client_entity"]["description"].textures
                for (let texture of Object.keys(entity_textures)) {
                    await SafeQuery("INSERT INTO CrashBot.dbo.PackTextures (Position, DefaultFile) VALUES (0, @deffile)", [
                        {name: "deffile", type: mssql.TYPES.VarChar(100), data: entity_textures[texture]}
                    ])

                    let id = (await SafeQuery("SELECT TextureID FROM dbo.PackTextures WHERE DefaultFile = @deffile", [
                        {name: "deffile", type: mssql.TYPES.VarChar(100), data: entity_textures[texture]}
                    ])).recordset[0].TextureID

                    SafeQuery('INSERT INTO CrashBot.dbo.PackEntityTextures (EntityID, TextureID, Type) VALUES (@entity, @texture, @type);', [
                        {name: "entity", type: mssql.TYPES.Int(), data: entities[identifier].id},
                        {name: "texture", type: mssql.TYPES.Int(), data: id},
                        {name: "type", type: mssql.TYPES.VarChar(100), data: texture}
                    ])
                }
            }

            // for (let item of fs.readdirSync(path.resolve("./") + "/assets/pack/assets/minecraft")) {
            //     console.log(item)
            //     await processItem(path.resolve("./") + "/assets/pack/assets/", path.resolve("./") + "/assets/pack/assets/minecraft", item)
            // }
            //
            // for (let item of fs.readdirSync(path.resolve("./") + "/assets/pack/assets/realms")) {
            //     console.log(item)
            //     await processItem(path.resolve("./") + "/assets/pack/assets/", path.resolve("./") + "/assets/pack/assets/realms", item)
            // }

            // IMPORT LANGUAGES
            // console.log("Importing languages")
            // let percent = 0
            //
            // let languages = JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/pack/texts/language_names.json").toString())
            // queries = []
            // for (let i = 0; i < languages.length; i++) {
            //     let language = languages[i]
            //     queries.push(`INSERT INTO CrashBot.dbo.PackLanguages (LanguageID, LanguageName, PackID)
            //                   VALUES ('${language[0]}', '${language[1]}', 1);`)
            //
            //     // Parse language items
            //     let language_items = fs.readFileSync(path.resolve("./") + "/assets/pack/texts/" + language[0] + ".lang").toString().split("\n")
            //     for (let r = 0; r < language_items.length; r++) {
            //         let item = language_items[r]
            //         if (item.startsWith("#")) continue // This is a comment line
            //         if (!(item.includes("=") && item.includes("#"))) continue // Invalid line
            //
            //         let item_split = item.split("=")
            //         let game_item = item_split[0]
            //
            //         let item_split_2 = item_split[1].split("#")
            //         let name = item_split_2[0]
            //         await SafeQuery("INSERT INTO CrashBot.dbo.PackLanguageItems (LanguageID, Text, GameItem) VALUES (@language, @text, @item)", [
            //             {name: "language", type: mssql.TYPES.Char(5), data: language[0]},
            //             {name: "text", type: mssql.TYPES.VarChar(100), data: name},
            //             {name: "item", type: mssql.TYPES.VarChar(100), data: game_item}
            //         ])
            //         if (Math.floor(((r + (i * language_items.length)) / (language_items.length * languages.length)) * 100) > percent) {
            //             percent = Math.floor(((r + (i * language_items.length)) / (language_items.length * languages.length)) * 100)
            //             console.log(percent + "%")
            //         }
            //     }
            // }
            // await SafeQuery(queries.join(";") + ";")
            queries = []

            console.log("DONE!")
        }
        else {
            console.log("Logging into Discord...")
            client.login(fs.readFileSync(path.join(path.resolve("./"), "botToken")).toString())
        }
    } catch (e) {
        console.log("Unable to connect to SQL server")
        console.error(e)
        process.exit(5)
    }
}

function download_ytdl(url: string, archive: archiver.Archiver): Promise<void> {
    return new Promise(async (resolve, reject) => {
        // Pick a filename
        let name = makeid(10) + ".mp4"
        while (fs.existsSync(path.resolve("./") + "/memories/" + name)) {
            name = makeid(10) + ".mp4"
        }
        try {
            // await ytdl.getInfo(url, {filter: "audioandvideo"})
            // console.log("GOT INFO!")
            let audio_download = ytdl(url, {filter: "audioonly", quality: "highestaudio"})
            audio_download.pipe(fs.createWriteStream("ffmpeg_tmp/" + name + ".mp3"))
            audio_download.on("end", () => {
                let video_download = ytdl(url, {filter: "videoonly", quality: "highestvideo"})
                video_download.pipe(fs.createWriteStream("ffmpeg_tmp/" + name))
                video_download.on("end", () => {
                    console.log("HERE!")
                    console.log(`ffmpeg -i ${name} -i ${name}.mp3 -c:v copy -c:a aac ${name}.mp4`)
                    exec(`ffmpeg -i ffmpeg_tmp/${name} -i ffmpeg_tmp/${name}.mp3 -c:v copy -c:a aac ffmpeg_tmp/${name}.mp4`, (err, stdout, stderr) => {
                        if (err) {
                            console.log(err)
                        }
                        archive.append(fs.createReadStream("ffmpeg_tmp/" + name + ".mp4"), {name})
                        setTimeout(() => {
                            fs.rmSync("ffmpeg_tmp/" + name)
                            fs.rmSync("ffmpeg_tmp/" + name + ".mp3")
                            fs.rmSync("ffmpeg_tmp/" + name + ".mp4")
                        }, 30000)
                        resolve()
                    })
                })
            })
        } catch (e) {
            reject(e)
        }
    })
}

//
// setTimeout(() => {
//     rot_potato()
// }, 30000)

let last_scoreboard_update = Date.now()

async function updateScoreboard() {
    if (Date.now() < last_scoreboard_update + 30000) return
    last_scoreboard_update = Date.now()

    let channel = await client.channels.fetch("968298113427206195") as TextChannel
    if (!channel) return
    let msg = await channel.messages.fetch("1105257601450651719")

    let embed = new Discord.MessageEmbed
    embed.setTitle("Scoreboard")
    embed.setDescription("Here you can see a list of online players")

    let res = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id IS NOT NULL")
    for (let user of res.recordset) {
        let member = await channel.guild.members.fetch(user.discord_id)
        let player = RemoteStatusServer.connections["pczWlxfMzPmuI6yjQMaQYA=="].getPlayer(user.mc_id)

        if (player && user.mc_detailed_scoreboard) {
            embed.addFields({
                name: member.nickname || member.user.username,
                value: `Currently exploring: \`${player.dimension}\``
            })
        }
        else if (player) {
            embed.addFields({
                name: member.nickname || member.user.username,
                value: `Online`
            })
        }
        // else {
        //     embed.addFields({
        //         name: member.nickname || member.user.username,
        //         value: "offline"
        //     })
        // }
    }
    msg.edit({content: ' ', embeds: [embed]})
}

async function generateRandomCaptureMsg(): Promise<RandomCaptureData | void> {
    let capture = (await SafeQuery("SELECT TOP 1 * from dbo.Memories ORDER BY NEWID()")).recordset[0]
    if (capture.type === 0) {
        let channel = await client.channels.fetch(capture.channel_id)
        if (capture.attachment_id) {
            let data: RandomCaptureData = {
                content: "https://cdn.discordapp.com/attachments/" + capture.channel_id + "/" + capture.attachment_id + "/" + capture.data,
                components: [
                    new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setStyle("LINK")
                                .setURL("https://discord.com/channels/892518158727008297/" + capture.channel_id + "/" + capture.msg_id)
                                .setLabel("Go to original message"),
                            new Discord.MessageButton()
                                .setStyle("SECONDARY")
                                .setCustomId("random_capture")
                                .setLabel("Another")
                                .setEmoji("🔃")
                        )
                ]
            }
            return data
        }
        else {
            let data: RandomCaptureData = {
                content: "Unfortunately this capture does not support previewing. Click the button below to see it.",
                components: [
                    new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setStyle("LINK")
                                .setURL("https://discord.com/channels/892518158727008297/" + capture.channel_id + "/" + capture.msg_id)
                                .setLabel("Go to original message"),
                            new Discord.MessageButton()
                                .setStyle("SECONDARY")
                                .setCustomId("random_capture")
                                .setLabel("Another")
                                .setEmoji("🔃")
                        )
                ]
            }
            return data
        }
    }
}

async function generatePackArchive(pack_id: string, increase_version_num = false, format: archiver.Format, options?: archiver.ArchiverOptions) {
    let archive = archiver(format, options)

    await generatePack(pack_id, increase_version_num, (file, location) => {
        archive.append(file, {name: location})
    })

    archive.finalize()
    return archive
}

async function generatePack(pack_id: string, increase_version_num = false, onFile = (file: Buffer, location: string) => {
}, onPackFound = (p: any) => {
}) {
    let pack = (await SafeQuery("SELECT * FROM dbo.Packs WHERE pack_id = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset[0]

    if (increase_version_num) {
        if (pack.version_num_3 < 255) {
            pack.version_num_3 += 1
        }
        else if (pack.version_num_2 < 255) {
            pack.version_num_2 += 1
            pack.version_num_3 = 0
        }
        else if (pack.version_num_1 < 255) {
            pack.version_num_3 = 0
            pack.version_num_2 = 0
            pack.version_num_1 += 1
        }
        else {
            console.log("VERSION NUMBERS EXCEEDED")
        }
        await SafeQuery("UPDATE CrashBot.dbo.Packs SET version_num_1 = @n1, version_num_2 = @n2, version_num_3 = @n3 WHERE pack_id = @packid;", [
            {name: "n1", type: mssql.TYPES.TinyInt(), data: pack.version_num_1},
            {name: "n2", type: mssql.TYPES.TinyInt(), data: pack.version_num_2},
            {name: "n3", type: mssql.TYPES.TinyInt(), data: pack.version_num_3},
            {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
        ])
    }
    onPackFound(pack)

    // Load sounds
    console.log("LOADING SOUNDS")
    let sounds: any[] = (await SafeQuery("SELECT * FROM dbo.PackSounds WHERE PackID = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset

    // Check for sounds that are not default
    let sounds_folder = path.join(path.resolve("./"), "assets", "pack_sounds")
    for (let sound of sounds) {
        sound.changed = fs.existsSync(path.join(sounds_folder, sound.SoundID + ".ogg"))
    }

    // Load sound definitions
    console.log("LOADING SOUND DEFINITIONS")
    let sound_definitons: any[] = (await SafeQuery("SELECT * FROM dbo.PackSoundDefinitions WHERE PackID = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset

    console.log("EXPORTING SOUNDS")
    let sound_definitions_out: any = {
        "format_version": "1.14.0",
        "sound_definitions": {}
    }

    // Parse sound definitions into sound definitions JSON file
    for (let definition of sound_definitons) {
        // Check all linked sounds
        let linked_sounds = sounds.filter(sound => sound.SoundDefID === definition.SoundDefID)
        if (linked_sounds.length === 0 || linked_sounds.filter(sound => sound.changed).length === 0) {
            definition.changed = false
            continue
        } // Ignore this definition as it has not changed.
        definition.changed = true
        sound_definitions_out.sound_definitions[definition.Name] = {
            category: definition.category,
            sounds: linked_sounds.map(sound => {
                return {
                    is3D: sound.is3D,
                    volume: sound.volume,
                    pitch: sound.pitch,
                    weight: sound.weight,
                    name: sound.changed ? "sounds/i/" + sound.SoundID : sound.DefaultFile
                }
            })
        }
    }

    // Append files to archive
    console.log("APPENDING SOUNDS TO ARCHIVE")
    console.log(sound_definitions_out)
    for (let sound of sounds.filter(sound => sound.changed)) {
        onFile(fs.readFileSync(path.join(sounds_folder, sound.SoundID + ".ogg")), "sounds/i/" + sound.SoundID + ".ogg")
    }

    // // Cleanup
    // delete sounds

    // Export sound groups
    let sound_groups = (await SafeQuery("SELECT * FROM dbo.PackSoundGroups WHERE PackSoundGroups.PackID = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset

    let sound_groups_out: any = {
        "block_sounds": {},
        "entity_sounds": {entities: {}},
        "individual_event_sounds": {
            "events": {}
        },
        "interactive_sounds": {
            "block_sounds": {},
            "entity_sounds": {
                "defaults": {
                    "events": {
                        "fall": {
                            "default": {
                                "pitch": 0.750,
                                "sound": "",
                                "volume": 1.0
                            }
                        },
                        "jump": {
                            "default": {
                                "pitch": 0.750,
                                "sound": "",
                                "volume": 0.250
                            }
                        }
                    },
                    "pitch": 1.0,
                    "volume": 0.250
                },
                "entities": {}
            }
        }
    }
    for (let item of sound_groups) {
        let events: any[] = (await SafeQuery("SELECT * FROM dbo.PackSoundGroupEvents WHERE PackSoundGroupEvents.SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: item.SoundGroupID}
        ])).recordset

        let _events: any = {}

        for (let event of events) {
            // Check if event has changed
            let sound_definition = sound_definitons.find(definition => definition.SoundDefID === event.SoundDefID)
            event.definition = sound_definition

            _events[event.EventType] = {
                sound: event.definition.Name,
                volume: event.vol_lower === event.vol_higher ? event.vol_lower : [event.vol_lower, event.vol_higher],
                pitch: event.pitch_lower === event.pitch_higher ? event.pitch_lower : [event.pitch_lower, event.pitch_higher],
            }
        }

        if (!events.find(event => event.definition.changed)) continue

        let _item = {
            pitch: item.pitch_lower === item.pitch_higher ? item.pitch_lower : [item.pitch_lower, item.pitch_higher],
            volume: item.vol_lower === item.vol_higher ? item.vol_lower : [item.vol_lower, item.vol_higher],
            events: _events
        }

        if (item.type === "block_sounds") {
            sound_groups_out["block_sounds"][item.GroupName] = _item
        }
        else if (item.type === "entity_sounds") {
            sound_groups_out.entity_sounds.entities[item.GroupName] = _item
        }
        else if (item.type === "individual_event_sounds") {
            sound_groups_out.individual_event_sounds.events = _item
        }
        else if (item.type === "interactive_sounds.block_sounds") {
            sound_groups_out.interactive_sounds.block_sounds[item.GroupName] = _item.events
        }
        else if (item.type === "interactive_sounds.entity_sounds") {
            sound_groups_out.interactive_sounds.entity_sounds.entities[item.GroupName] = _item
        }
    }


    onFile(Buffer.from(JSON.stringify(sound_definitions_out)), "sounds/sound_definitions.json")
    onFile(Buffer.from(JSON.stringify(sound_groups_out)), "sounds.json")

    // Export terrain textures
    let terrain_textures_array = (await SafeQuery(`SELECT dbo.PackTextureGroups.GameID  AS 'identifier',
                                                          dbo.PackTextures.DefaultFile  AS 'DefaultFile',
                                                          dbo.PackTextures.OverlayColor AS 'OverlayColor',
                                                          dbo.PackTextures.TextureID
                                                   FROM dbo.PackTextureGroups
                                                            JOIN dbo.PackTextures ON dbo.PackTextures.TextureGroupID =
                                                                                     dbo.PackTextureGroups.TextureGroupID
                                                   WHERE dbo.PackTextureGroups.PackID = @packid
                                                     AND type = 'terrain_texture'
                                                   ORDER BY GameID ASC, Position ASC`, [
        {name: "packid", type: mssql.TYPES.Int(), data: pack_id}
    ])).recordset

    let terrain_textures: any = {
        num_mip_levels: 4, padding: 8, resource_pack_name: "vanilla", texture_data: {}
    }
    for (let texture of terrain_textures_array) {
        if (!terrain_textures.texture_data[texture.identifier]) {
            terrain_textures.texture_data[texture.identifier] = {textures: []}

            let _path = texture.DefaultFile
            if (fs.existsSync(path.join(path.resolve("./"), "assets", "pack_textures", texture.TextureID + ".png"))) {
                onFile(fs.readFileSync(path.join(path.resolve("./"), "assets", "pack_textures", texture.TextureID + ".png")), "textures/i/" + texture.TextureID + ".png")
                _path = "textures/i/" + texture.TextureID
            }

            if (texture.OverlayColor) {
                terrain_textures.texture_data[texture.identifier].textures.push({
                    overlay_color: "#" + texture.OverlayColor,
                    path: _path
                })
            }
            else terrain_textures.texture_data[texture.identifier].textures.push(_path)
        }
    }

    // Export blocks
    let blocks_array = (await SafeQuery(`
                SELECT PB.GameID AS 'GameID', PBT.Type AS 'type', PTG.GameID AS 'TextureGameID', PSG.GroupName AS 'SoundGameID'
                FROM dbo.PackBlocks PB
                         JOIN dbo.PackBlockTextures PBT on PB.BlockID = PBT.BlockID
                         JOIN dbo.PackTextureGroups PTG ON PBT.TextureGroupID = PTG.TextureGroupID
                         JOIN dbo.PackSoundGroups PSG on PB.SoundGroupID = PSG.SoundGroupID
                WHERE PB.PackID = @packid`,
        [
            {name: "packid", type: mssql.TYPES.Int(), data: pack_id}
        ])).recordset
    onFile(Buffer.from(JSON.stringify(terrain_textures)), "textures/terrain_texture.json")

    let blocks: any = {}
    for (let block of blocks_array) {
        if (!blocks[block.GameID]) blocks[block.GameID] = {textures: {}}
        if (block.SoundGameID) blocks[block.GameID].sound = block.SoundGameID
        blocks[block.GameID].textures[block.type] = block.TextureGameID
    }
    onFile(Buffer.from(JSON.stringify(blocks)), "blocks.json")

    onFile(Buffer.from(JSON.stringify({
        "format_version": 2,
        "header": {
            "description": "Re-Flesh SEASON 5",
            "name": "Re-Flesh SEASON 5",
            "uuid": "5eb74438-a581-4b21-97bf-c13e4c4522f5",
            "version": [pack.version_num_1, pack.version_num_2, pack.version_num_3],
            "min_engine_version": [1, 19, 50]
        },
        "modules": [
            {
                "description": "Example vanilla resource pack",
                "type": "resources",
                "uuid": "b1b947d5-dece-484d-a6c8-6a0c829d5d96",
                "version": [0, 0, 3]
            }
        ]
    })), "manifest.json")
    onFile(fs.readFileSync(path.join(path.resolve("./"), "assets", "pack", "pack_icon.png")), "pack_icon.png")
}

async function getUserData(member: GuildMember | string) {
    let id = typeof member === "string" ? member : member.id
    let req = await SafeQuery(`SELECT *
                               FROM dbo.Users
                               WHERE discord_id = @discordid`, [
        {name: "discordid", type: mssql.TYPES.VarChar(20), data: id}
    ])
    if (req.recordset.length === 0) {
        let key = await CrashBotUser.NewKey("", id)
        req = await SafeQuery(`SELECT *
                               FROM dbo.Users
                               WHERE discord_id = @discordid`, [
            {name: "discordid", type: mssql.TYPES.VarChar(20), data: id}
        ])
    }
    return req.recordset[0]
}

setup()
