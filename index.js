// Copyright 2022 - Jack Hawinkels - All Rights Reserved
const express = require("express");
const fileUpload = require('express-fileupload');
const ws = require("ws");
const fs_extra = require("fs-extra")
const fs = require("fs")
const os = require("os")
const EventEmitter = require("events").EventEmitter
const port = 80
const path = require("path")
const stream = require("stream")
const {spawn, exec} = require("child_process")
const ytdl = require("ytdl-core")
const ytpl = require("ytpl")
const spotifydl = require("spotifydl-core").default
const spotify = new spotifydl({
    clientId: "d93604d756db4462b019784e67b2e064",
    clientSecret: "fb849fadf5fb4404887cd27fe3cd0ad1"
})
// const spotify = require("spottydl")
const ftp = require("basic-ftp")
const {REST} = require('@discordjs/rest');
const {Routes} = require('discord-api-types/v9');
const events = require("events")
const Jimp = require("jimp")
let ffmpeg = require("fluent-ffmpeg");
const archiver = require('archiver');
let http = require("http")
let https = require("https")
let Discord = require("discord.js")
let audio_queue
const discord_voice = require('@discordjs/voice');
let console_channel, chat_channel, command_channel
let client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MEMBERS,
        Discord.Intents.FLAGS.GUILD_VOICE_STATES,
        Discord.Intents.FLAGS.DIRECT_MESSAGES,
        Discord.Intents.FLAGS.DIRECT_MESSAGE_TYPING,
        Discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS
    ], partials: ["CHANNEL"]
})
let pack_updated = true
let auto_pack_update_timeout
let schedule = require('node-schedule');
let dah
const {getAudioDurationInSeconds} = require("get-audio-duration");
const WaveformData = require("waveform-data");
const {readJson} = require("fs-extra");
const imageCaptureChannels = ["892518159167393824", "928215083190984745", "931297441448345660", "966665613101654017", "933949561934852127", "1002003265506000916"]
const mssql = require("mssql")
let search_index = []
// let banner_images = JSON.parse(fs.readFileSync(__dirname + "/assets/html/web_assets/banner_images.json").toString())
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
// let sound_mappings = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/sounds/sound_definitions.json").toString()).sound_definitions
let active_playlist_modifications = {}

// Parse memes and convert any items with the .url attribute
function fetchThrowTemplates() {
    return JSON.parse(fs.readFileSync(__dirname + "/assets/throw/memes.json"))
}

function sanitiseThrowTemplates() {
    let memes = fetchThrowTemplates()
    for (let meme of memes) {
        if (typeof meme.url !== "undefined") {
            let base64Image = meme.url.split(';base64,').pop();
            fs.writeFileSync(__dirname + "/assets/throw/" + meme.location, base64Image, {encoding: 'base64'})

            delete meme.url
        }

        if (typeof meme.verified === "undefined") meme.verified = true
    }
    fs.writeFileSync(__dirname + "/assets/throw/memes.json", JSON.stringify(memes))
}

sanitiseThrowTemplates()

setTimeout(async () => {
    search_index = search_index_flattener(dirTree(__dirname + "/assets/pack"))
}, 10000)
let search_index_updater = setInterval(() => {
    search_index = search_index_flattener(dirTree(__dirname + "/assets/pack"))
}, 30000)

function search_index_flattener(directory) {
    let out = []
    for (let item of directory.children) {
        if (item.type === "folder") {
            out = out.concat(search_index_flattener(item))
        } else {
            out.push(item.path)
        }
    }
    return out
}

class keyManager {
    constructor() {
        let data = JSON.parse(fs.readFileSync(__dirname + "/assets/json/keys.json").toString())
        this.map = new Map(data)
        // Setup backup

        for (let player of this.map) {
            player[1].active = false
            if (player[1].active_time > 734400) {
                player[1].active_time -= 734400
                console.log(player)
            }

            if (typeof player[1].banners === "undefined") player[1].banners = []

            for (let i in player[1].banners) {
                if (typeof player[1].banners[i] === "string") player[1].banners[i] = {
                    url: player[1].banners[i],
                    expire: (new Date()).getTime()
                }
            }
        }

        setInterval(() => {
            fs.writeFileSync(__dirname + "/assets/json/keys.json", JSON.stringify([...this.map]))
            fs.writeFileSync(__dirname + "/assets/json/keys_backup.json", JSON.stringify([...this.map]))
        }, 10000)
    }

    _makeid(length) {
        var result = '';
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() *
                charactersLength));
        }
        return result;
    }

    async newKey(player_name, user) {
        let key = ""
        while (true) {
            key = this._makeid(10)
            if (!await this.checkKey(key)) break
        }

        let req = await safeQuery(`INSERT INTO dbo.Users (player_name, discord_id, avatar_url, shortcode)
                                   VALUES (@playername, @discordid, @avatarurl, @shortcode)`, [
            {name: "playername", type: mssql.TYPES.VarChar(30), data: player_name},
            {name: "discordid", type: mssql.TYPES.VarChar(30), data: user.id},
            {name: "avatarurl", type: mssql.TYPES.VarChar(200), data: user.avatarURL()},
            {name: "shortcode", type: mssql.TYPES.VarChar(30), data: key}
        ])

        return key
    }

    async checkKey(key) {
        let req = await safeQuery(`SELECT shortcode
                                   FROM dbo.Users
                                   WHERE shortcode = @shortcode`, [{
            name: "shortcode",
            type: mssql.TYPES.VarChar(20),
            data: key
        }])
        return req.recordset.length !== 0
    }

    async listplayer_names(include_currency = true) {
        if (include_currency) {
            return (await safeQuery(`SELECT player_name, avatar_url, currency
                                     FROM dbo.Users`)).recordset
        } else {
            (await safeQuery(`SELECT player_name,
                              FROM dbo.Users`)).recordset
        }
    }
}

async function findOwnership(path) {
    let req = await safeQuery(`SELECT *
                               FROM dbo.OwnedItems
                               WHERE path = @path`, [{name: "path", type: mssql.TYPES.VarChar(200), data: path}])
    if (req.recordset.length === 0) throw "No ownership recorded for this path"
    return req.recordset[0]
}

class CrashBotUser {
    constructor(key) {
        this.key = key;
    }

    async get() {
        let req = await safeQuery(`SELECT *
                                   FROM dbo.Users
                                   WHERE shortcode = @shortcode`, [{
            name: "shortcode",
            type: mssql.TYPES.VarChar(10),
            data: this.key
        }])
        this.id = req.recordset[0].id
        this.data = {}
        for (let item of Object.keys(req.recordset[0])) this.data[item] = req.recordset[0][item]
        return req.recordset[0]
    }

    async getBanners() {
        if (!this.id) await this.get()
        return await safeQuery(`SELECT *
                                FROM dbo.Banners
                                WHERE owner_id = @ownerid`, [{
            name: "ownerid",
            type: mssql.TYPES.Int,
            data: this.id
        }]).recordset
    }

    async getOwned() {
        if (!this.id) await this.get()
        return await safeQuery(`SELECT *
                                FROM dbo.ResourcePackItems
                                WHERE @ownerid`, [{name: "ownerid", type: mssql.TYPES.Int, data: this.id}]).recordset
    }

    async addOwnership(path) {
        if (!this.id) await this.get()
        await safeQuery(`INSERT INTO dbo.OwnedItems (owner_id, path)
                         VALUES (@ownerid, @path)`, [{
            name: "ownerid",
            type: mssql.TYPES.Int,
            data: this.id
        }, {name: "path", type: mssql.TYPES.VarChar(200), path}])
    }

    async newBanner(path) {
        console.log(path)
        if (!this.id) await this.get()
        await safeQuery(`INSERT INTO dbo.Banners (owner_id, url)
                         VALUES (@ownerid, '${path}')`, [{
            name: "ownerid",
            type: mssql.TYPES.Int,
            data: this.id
        }])
    }

    async getPlaylists(include_public = false) {
        if (!this.id) await this.get()
        let data
        if (include_public) {
            data = await safeQuery("SELECT playlist_id FROM dbo.Playlists WHERE type = 1 OR owner_id = @id ORDER BY type ASC, playlist_name ASC", [
                {name: "id", type: mssql.TYPES.Int, data: this.id}
            ])
        } else {
            data = await safeQuery("SELECT playlist_id FROM dbo.Playlists WHERE owner_id = @id ORDER BY playlist_name ASC", [
                {name: "id", type: mssql.TYPES.Int, data: this.id}
            ])
        }
        return data.recordset.map(item => {
            return new Playlist(item.playlist_id)
        })
    }
}

class Playlist {
    constructor(playlist_id) {
        this.id = playlist_id
    }

    async get() {
        this.data = (await safeQuery("SELECT * FROM dbo.Playlists WHERE playlist_id = @id", [
            {name: "id", type: mssql.TYPES.Int, data: this.id}
        ])).recordset[0]
    }

    async getPlaylistItems() {
        return (await safeQuery("SELECT * FROM dbo.PlaylistItems WHERE playlist_id = @id", [
            {name: "id", type: mssql.TYPES.Int, data: this.id}
        ])).recordset
    }

    async addTrackUrl(url) {
        let player, id
        if (url.startsWith("https://m.youtube.com") || url.startsWith("https://youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://www.youtube.com") || url.startsWith("https://www.youtu.be")) {
            [player, id] = [0, ytdl.getURLVideoID(url)]
        } else if (url.startsWith("https://open.spotify.com/track/")) {
            [player, id] = [1, url.replace("https://open.spotify.com/track/", "")]
        } else {
            throw "Invalid URL"
        }
        await this.addTrack(player, id)
    }

    async addTrack(player, source_id) {
        return safeQuery("INSERT INTO PlaylistItems (playlist_id, player, source_id) VALUES (@playlist, @player, @id)", [
            {name: "playlist", type: mssql.TYPES.Int, data: this.id},
            {name: "player", type: mssql.TYPES.Int, data: player},
            {name: "id", type: mssql.TYPES.VarChar(500), data: source_id}
        ])
    }

    async removeTrack(player, source_id) {
        return safeQuery("DELETE FROM PlaylistItems WHERE playlist_id = @playlist AND player = @player AND source_id = @id", [
            {name: "playlist", type: mssql.TYPES.Int, data: this.id},
            {name: "player", type: mssql.TYPES.Int, data: player},
            {name: "id", type: mssql.TYPES.VarChar(500), data: source_id}
        ])
    }
}

class DAHServer extends EventEmitter {
    constructor() {
        super();
        this.process = spawn("./assets/dah", ["--all-packs", "--auto-start"])
        let self = this
        this.process.stdout.on("data", (data) => {
            if (data.includes("Server ready")) {
                self.emit("ready")
            }
        })
        this.process.on("close", (code) => {
            clearTimeout(self.timer)
            self.emit("end", code)
        })

        this.timer = setTimeout(() => {
            self.process.kill()
        }, 10800000)
    }
}

async function wait(milliseconds) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, milliseconds)
    })
}

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

async function update_banner() {
    let banners = (await safeQuery("SELECT * FROM dbo.Banners")).recordset

    if (Math.random() < 0.2) {
        let capture = (await safeQuery("SELECT * FROM dbo.Memories WHERE data LIKE '%.jpg' ORDER BY NEWID()")).recordset[0]
        console.log(capture)
        client.guilds.cache.get("892518158727008297").setBanner(
            "https://cdn.discordapp.com/attachments/" + capture.channel_id + "/" + capture.attachment_id + "/" + capture.data
        )
    } else {
        console.log("HERE!")
        client.guilds.cache.get("892518158727008297").setBanner(banners[Math.floor(Math.random() * banners.length)].url)
        client.user.setAvatar(banners[Math.floor(Math.random() * banners.length)].url)
    }
}

function date_to_sql_date(date) {
    return (1900 + date.getYear()).toString() + "-" + ("0" + date.getMonth().toString()).slice(-2) + "-" + ("0" + date.getDate().toString()).slice(-2) + " " + ("0" + date.getHours().toString()).slice(-2) + ":" + ("0" + date.getMinutes().toString()).slice(-2) + ":" + ("0" + date.getSeconds().toString()).slice(-2)
}

schedule.scheduleJob("0 0 * * * *", update_banner)
schedule.scheduleJob("0 30 * * * *", update_banner)

function spawnServer() {
    return spawn(server_env_options.shell, server_env_options.arguments, {
        cwd: server_env_options.cwd
    })
}

function safeQuery(sql, params = []) {
    // {name: '', type: mssql.VarChar, data: '')
    return new Promise((resolve, reject) => {
        const ps = new mssql.PreparedStatement()
        let _params = {}
        for (let param of params) {
            ps.input(param.name, param.type)
            _params[param.name] = param.data
        }

        ps.prepare(sql, err => {
            if (err) {
                reject(err);
                return
            }

            ps.execute(_params, (err, result) => {
                if (err) {
                    reject(err);
                    return
                }
                ps.unprepare(err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(result)
                })
            })
        })
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
//                                 for (let _key of keys.map) {
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
//                     for (let key of keys.map) {
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

class bankResourceClass {
    constructor(name, tag_name, stock = 100, max_inventory = 1000, baseline_price = 0) {
        this.name = name
        this.tag_name = tag_name
        this.stock = stock
        this.max_inventory = max_inventory
        this.baseline_price = baseline_price
        // this.restock_interval = setInterval(() => this.addToStock(1), restock_rate)
    }

    addToStock(add_count) {
        this.stock += add_count
        wss.updateBank()
    }

    removeFromStock(remove_count) {
        this.stock -= remove_count
        wss.updateBank()
    }

    calculateWorth() {
        console.log(this)
        return Math.round(((this.max_inventory - this.stock) / this.max_inventory) * 1000) + this.baseline_price
    }
}

class bankClass {
    constructor() {
        this.tradeResources = []
        this.bankBackup = setInterval(() => {
            fs.writeFileSync(__dirname + "/assets/json/bank_backup.json", JSON.stringify(this.tradeResources))
        }, 60000)
    }

    addTradeResource(bankResource) {
        this.tradeResources.push(bankResource)
    }
}

let keys = new keyManager()
let bank = new bankClass()

// Setup banner expirer
// setInterval(() => {
//     for (let player of keys.map) {
//         for (let banner of player[1].banners) {
//             if (banner.expire + 1814400000 < (new Date).getTime()) {
//                 // Expire the banner
//                 player[1].banners.splice(player[1].banners.indexOf(banner), 1)
//             }
//         }
//     }
// }, 86400000)

let resources = JSON.parse(fs.readFileSync(__dirname + "/assets/json/bank_backup.json").toString())
for (let resource of resources) {
    console.log(resource)
    bank.addTradeResource(new bankResourceClass(resource.name, resource.tag_name, resource.stock, resource.max_inventory, resource.baseline_price))
}

for (let resource of bank.tradeResources) {
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
//     for (let _player of keys.map) {
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

function create_pack(name, output_stream = null) {
    return new Promise(resolve => {
        let output
        if (output_stream === null) {
            output = fs.createWriteStream(__dirname + '/' + name)
        } else {
            output = output_stream
        }
        console.log(__dirname + '/' + name)
        let archive = archiver('zip');

        output.on('close', function () {
            try {
                output.close()
            } catch (e) {
            }
            resolve()
        });

        archive.on('error', function (err) {
            throw err;
        });

        archive.pipe(output);

// append files from a sub-directory, putting its contents at the root of archive
        archive.directory(__dirname + "/assets/pack", false);

        archive.finalize();
    })
}

function toArrayBuffer(buf) {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

class queueManager {
    constructor(subqueues = 4) {
        this.items = []
        this.subqueues = []
        this.stop = false
        for (let i = 0; i < subqueues; i++) this.subqueues.push(new subqueue(this))
        this.started = false
    }

    pushToQueue(func, args) {
        this.items.push([func, args])
        if (this.started === false) this.start()
    }

    async start() {
        console.log("Queue started")
        this.started = true
        this.stop = false
        await Promise.all(this.subqueues.map(queue => queue.start()))
        this.started = false
        console.log("Queue finished")
    }

    stop() {
        this.stop = true
    }
}

class subqueue {
    constructor(parentQueue) {
        this.parentQueue = parentQueue
    }

    start() {
        return new Promise(async resolve => {
            while (this.parentQueue.items.length > 0 && this.parentQueue.stop === false) {
                let current_item = this.parentQueue.items.splice(0, 1)[0]
                await current_item[0](...current_item[1])
                console.log("(" + this.parentQueue.items.length + " items left to process)")
            }
            resolve()
        })
    }
}

let track_info_get_queue = new queueManager(6)

class queueItem extends EventEmitter {
    constructor(player_type, id, queue_pos) {
        super();
        this.player_type = player_type
        this.id = id
        this.downloaded = 0 // 0 = not downloaded, 1 = downloading, 2 = downloaded
        this.downloading_promise = null
        this.title = ""
        this.thumbnail = ""
        this.__fetchTrackInfo()
    }

    __fetchTrackInfo() {
        return new Promise(async (resolve, reject) => {
            track_info_get_queue.pushToQueue(this.__fetchTrackInfo2, [resolve, reject, this])
        })
    }

    async __fetchTrackInfo2(resolve, reject, obj) {
        try {
            if (obj.player_type === "spotifydl") {
                let data = await spotify.getTrack("https://open.spotify.com/track/" + obj.id)
                obj.title = data.name
                obj.thumbnail = data.cover_url
                resolve()
            } else {
                let data = await ytdl.getInfo("https://www.youtube.com/watch?v=" + obj.id)
                obj.title = data.videoDetails.title
                obj.thumbnail = data.videoDetails.thumbnails[data.videoDetails.thumbnails.length - 1].url
                resolve()
            }
        } catch (e) {
            console.log(e)
            obj.title = "Track data fetch failed"
        }
    }

    __spotifyDownload() {
        if (this.downloaded === 0) {
            this.downloading_promise = new Promise(async (resolve, reject) => {
                console.log("Downloading track... (" + this.id + ")")

                if (this.downloaded === 2) {
                    resolve(this.temp_path)
                    return
                }
                this.downloaded = 1
                this.temp_path = __dirname + "/assets/audio_queue/spotify_" + makeid(10) + ".mp3"
                fs.writeFileSync(this.temp_path, await spotify.downloadTrackFromInfo(await spotify.getTrack("https://open.spotify.com/track/" + this.id)), "binary")

                // if (file_data[0].status !== "Success") {
                //     console.log(file_data)
                //     reject("Unknown track loading error")
                //     return
                // }

                // Move the file
                // fs.renameSync(file_data[0].filename, this.temp_path)

                // this.temp_path = file_data[0].filename
                console.log("Track downloaded...")
                this.emit("trackDownloaded")
            })
        }
        return this.downloading_promise
    }

    stream(callback) {
        this.__stream2callback = callback
        if (this.player_type === "spotifydl" && this.downloaded !== 2) {
            this.__spotifyDownload()
            this.on("trackDownloaded", this.__stream2)
        } else {
            this.__stream2()
        }
    }

    async __stream2() {
        console.log("Streaming track...")

        try {
            this.removeListener("track_downloaded", this.__stream2)
        } catch (e) {
        }

        if (this.player_type === "spotifydl") {
            this.__stream2callback(fs.createReadStream(this.temp_path))
        } else {
            this.__stream2callback(await ytdl("https://www.youtube.com/watch?v=" + this.id, {
                filter: "audioonly",
                fmt: "mp3",
                highWaterMark: 1 << 62,
                liveBuffer: 1 << 62,
                dlChunkSize: 0, //disabling chunking is recommended in discord bot
                bitrate: 128,
                quality: "lowestaudio"
            }))
        }
    }

    async unload() {
        if (this.temp_path) fs.rmSync(this.temp_path)
    }
}

function shuffleArray(array) {
    let curId = array.length;
    // There remain elements to shuffle
    while (0 !== curId) {
        // Pick a remaining element
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        // Swap it with the current element.
        let tmp = array[curId];
        array[curId] = array[randId];
        array[randId] = tmp;
    }
    return array;
}

class audioQueueManager extends EventEmitter {
    constructor(vc_connection, channel) {
        super();
        this.vc_connection = vc_connection
        this.pos = 0
        this.queue = []
        this.ended = true
        this.paused = false
        this.player = discord_voice.createAudioPlayer({
            behaviors: {
                noSubscriber: discord_voice.NoSubscriberBehavior.Pause
            }
        })
        this.challenge_mode = false
        this.channel = channel
        this.player.on(discord_voice.AudioPlayerStatus.Idle, () => {
            this.nextTrack()
        })
        this.subscription = this.vc_connection.subscribe(this.player)

        this.interval2 = setInterval(() => {
            this.updateQueueMsg()
        }, 10000)
    }

    updateQueueMsgTimeout(timeout = 1000) {
        if (this.interval1) {
            clearTimeout(this.interval1)
        }
        this.interval1 = setTimeout(() => {
            this.updateQueueMsg()
        }, timeout)
    }

    async updateQueueMsg() {
        try {
            if (this.interval1) {
                clearTimeout(this.interval1)
            }
            if (!this.msg) await this.fetchQueueMessage()

            let embed = new Discord.MessageEmbed()
            if (!this.challenge_mode) {
                embed.setTitle("Play Queue (" + this.queue.length + " items currently)")

                if (this.queue.length > 0) {
                    if (this.queue[0].thumbnail) {
                        embed.setFooter({text: this.queue[0].title, iconURL: this.queue[0].thumbnail})
                        embed.setImage(this.queue[0].thumbnail)
                    } else {
                        embed.setFooter({text: this.queue[0].title})
                    }
                }

                let desc = []
                for (let i in this.queue) {
                    let line = i + ". "
                    let _i = parseInt(i)
                    if (_i === 0 && this.queue[_i].downloaded === 0) {
                        line += "⌛"
                    }
                    if (this.queue[_i].title === "") {
                        line += "*Data downloading...*"
                    } else {
                        line += this.queue[_i].title
                    }

                    desc.push(line)
                    if (parseInt(i) >= 20) {
                        desc.push("...")
                        break
                    }
                }
                if (this.queue.length === 0) {
                    embed.setImage("https://live.staticflickr.com/4361/36571823423_fa9f33d0dc_b.jpg")
                    embed.setFooter({text: "\"New Zealand - Castlepoint\" by Leni Sediva is licensed under CC BY-SA 2.0. "})
                }
                embed.setDescription(desc.join("\n"))
                if (track_info_get_queue.started) {
                    embed.setFooter({text: "Some information may be missing as data is still being downloaded. This may take awhile depending on the size of the queue."})
                }
                this.msg.edit({
                    content: " ", embeds: [embed], components: [
                        new Discord.MessageActionRow()
                            .addComponents([
                                new Discord.MessageButton()
                                    .setCustomId("audio_rewind")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏮"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_pause")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏯"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_skip")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏭"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_shuffle")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("🔀"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_stop")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏹"),
                            ]),
                        new Discord.MessageActionRow().addComponents([
                            new Discord.MessageButton()
                                .setCustomId("audio_challenge")
                                .setStyle("SECONDARY")
                                .setLabel("Challenge Mode")
                                .setEmoji("🏅")
                        ])
                    ]
                })
            } else {
                embed.setTitle("🏅 Challenge mode enabled!")
                embed.setDescription("Challenge mode has been enabled! See if you can guess the songs! To disable challenge mode, click 'Challenge Mode' again.")
                this.msg.edit({
                    content: " ", embeds: [embed], components: [
                        new Discord.MessageActionRow()
                            .addComponents([
                                new Discord.MessageButton()
                                    .setCustomId("audio_rewind")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏮"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_pause")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏯"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_skip")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏭"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_shuffle")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("🔀"),
                                new Discord.MessageButton()
                                    .setCustomId("audio_stop")
                                    .setStyle("SECONDARY")
                                    .setLabel(" ")
                                    .setEmoji("⏹")
                            ]),
                        new Discord.MessageActionRow().addComponents([
                            new Discord.MessageButton()
                                .setCustomId("audio_challenge")
                                .setStyle("PRIMARY")
                                .setLabel("Challenge Mode")
                                .setEmoji("🏅")
                        ])
                    ]
                })
            }
        } catch (e) {
        }
    }

    async fetchQueueMessage() {
        return new Promise((resolve, reject) => {
            client.channels.fetch("999848214691852308").then(channel => {
                channel.messages.fetch("1000265020795535430").then(msg => {
                    this.msg = msg
                    resolve()
                })
            })
        })
    }

    async addToQueue(url) {
        // Detect whether it's YouTube or Spotify
        let queue_item, queue_pos = this.queue.length + 1
        if (url.startsWith("https://m.youtube.com") || url.startsWith("https://youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://www.youtube.com") || url.startsWith("https://www.youtu.be")) {
            // YouTube

            // Validate the URL
            if (!ytdl.validateURL(url)) {
                throw "Invalid URL - ytdl"
            }

            queue_item = new queueItem("ytdl", ytdl.getURLVideoID(url), queue_pos)
        } else if (url.startsWith("https://open.spotify.com/track/")) {
            // Spotify

            // Validate the URL
            try {
                await spotify.getTrack(url)
                queue_item = new queueItem("spotifydl", url.replace("https://open.spotify.com/track/", ""), queue_pos)
                if (queue_pos - 2 < this.pos) {
                    queue_item.__spotifyDownload()
                }
            } catch (e) {
                console.error(e)
                throw "Invalid URL - spotifydl"
            }
        }

        this.queue.push(queue_item)
        if (this.queue.length === 1) {
            this.startTrack()
        }
        this.updateQueueMsgTimeout()
    }

    async nextTrack() {
        console.log("Loading next track...")
        // this.pos += 1
        await this.queue.shift().unload()
        await this.startTrack()
    }

    async startTrack() {
        console.log("Starting track....")
        this.ended = false
        this.updateQueueMsgTimeout()
        this.queue[this.pos].stream(stream => {
            this.updateQueueMsg()
            if (typeof stream === "undefined") {
                console.error("Failed to stream a track. Skipping...")
            } else {
                this.player.play(discord_voice.createAudioResource(stream))
            }
        })
    }

    shuffle() {
        let cur_item = this.queue.shift()
        this.queue = shuffleArray(this.queue)
        this.queue.unshift(cur_item)
        this.updateQueueMsg()
    }

    async stop() {
        this.player.stop()
        try {
            await this.queue[0].unload()
        } catch (e) {
        }
        this.queue = []
        await this.updateQueueMsg()
        this.challenge_mode = false

        this.subscription.unsubscribe()
        this.vc_connection.disconnect()
        clearInterval(this.interval1)
        clearInterval(this.interval2)
        try {
            track_info_get_queue.stop()
        } catch (e) {
        }
        delete this.channel
    }

    skip() {
        this.player.pause()
        this.nextTrack()
    }

    rewind() {
        this.startTrack()
    }

    pause() {
        if (this.paused) {
            this.player.unpause()
            this.paused = false
        } else {
            this.player.pause();
            this.paused = true
        }
    }

    async challenge() {
        if (this.challenge_mode) {
            this.challenge_mode = false
            this.updateQueueMsg()
            return false
        } else {
            this.challenge_mode = true
            this.shuffle()
            await this.nextTrack()
            return true
        }
    }
}

// setTimeout(() => {
//     create_backup()
// }, 30000)

let app = express()
let httpServer = http.createServer(app).listen(8080)
let httpsServer = https.createServer({
    key: fs.readFileSync(__dirname + "/assets/ssl/privkey.pem"),
    cert: fs.readFileSync(__dirname + "/assets/ssl/fullchain.pem")
}, app).listen(8050)
// enable files upload
app.use(fileUpload({
    createParentPath: true,
    useTempFiles: true,
    limits: {fileSize: 50 * 1024 * 1024}
}));

function dirTree(filename, parentFolder = "") {
    if (parentFolder === "") {
        parentFolder = filename
    }

    var stats = fs.lstatSync(filename),
        info = {
            path: filename.replace(parentFolder, ""),
            name: path.basename(filename, parentFolder)
        };

    if (stats.isDirectory()) {
        info.type = "folder";
        info.children = fs.readdirSync(filename).map(function (child) {
            return dirTree(filename + '/' + child, parentFolder);
        });
    } else {
        // Assuming it's a file. In real life it could be a symlink or
        // something else!
        info.type = "file";
    }

    return info;
}

app.get("/home/:key", async (req, res) => {
    let html
    if (await keys.checkKey(req.params.key)) {
        let user = new CrashBotUser(req.params.key)
        await user.get()
        html = fs.readFileSync(__dirname + "/assets/html/index.html").toString().replace(/:keyhere:/g, req.params.key).replace(/\[owned]/g, JSON.stringify(await user.getOwned())).replace(/:username:/g, user.data["player_name"])
    } else {
        html = "Invalid key"
    }
    // console.log(html)
    res.send(html)
})

app.get("/test", async (req, res) => {
    console.log("STARTING IP DISTRIBUTION!")
    client.guilds.fetch("892518158727008297").then(guild => {
        guild.members.fetch().then(members => {
            console.log(client.guilds.cache.get("892518158727008297").cache)
            for (let member of members) {
                console.log("Sending invite to: " + member[1].user.username)
                member[1].user.send(
                    {
                        content: " ",
                        embeds: [
                            new Discord.MessageEmbed()
                                .setTitle("You've been invited to join **Re-Flesh REDACTED**!\nA Minecraft Java server")
                                .setDescription("Before we can get started, I need to know your Minecraft username.\nThis is the username that you will use in-game.\nPlease send it to me in a dm using `/username [username]`. This can be changed later.\n\n**Don't have a Minecraft Java account yet?**\nNo problem! Just come back whenever you have one.")
                                .setImage("https://cdn.discordapp.com/attachments/894754274892972083/946186466147565658/banner.png")
                        ]
                    }
                ).catch(e => {
                    console.log("Failed to send an invite to: " + member[1].user.username)
                })
            }
        })
    })
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

    let output = __dirname + "/assets/pack" + req.body.location
    if (output.endsWith(".fsb") || output.endsWith(".ogg")) {
        if (typeof req.body.yturi === "undefined") {
            try {
                fs.unlinkSync(output)
            } catch (e) {
            }
            output = output.replace(".fsb", ".ogg")
            await user.addOwnership(req.body.location.replace(".fsb", ".ogg"))

            req.files.file.mv(req.files.file.tempFilePath + req.files.file.filename).then(r => {
                ffmpeg(req.files.file.tempFilePath + req.files.file.filename)
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
        } else {
            try {
                let video_info = await ytdl.getInfo(ytdl.getURLVideoID(req.body.yturi))

                if (parseInt(video_info.videoDetails.lengthSeconds) >= 420) {
                    res.send("TOO LONG")
                } else {
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
    } else if (output.endsWith(".png") || output.endsWith(".jpg")) {
        output.replace(".jpg", ".png")
        req.files.file.mv(req.files.file.tempFilePath + req.files.file.filename).then(r => {
            ffmpeg(req.files.file.tempFilePath + req.files.file.filename)
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
    } else if (output.endsWith(".json")) {
        if (req.body.json.length > 34275800) {
            res.end("ERROR: JSON is too long")
        } else {
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

    let cur_file = __dirname + "/assets/pack" + req.body.location
    let or_file_search = req.body.location.replace(".fsb", "").replace(".ogg", "").replace(".png", "")

    // Find the original file
    let or_file
    if (fs.existsSync(__dirname + "/assets/default_pack" + or_file_search + ".fsb")) {
        or_file = __dirname + "/assets/default_pack" + or_file_search + ".fsb"
    } else if (fs.existsSync(__dirname + "/assets/default_pack" + or_file_search + ".png")) {
        or_file = __dirname + "/assets/default_pack" + or_file_search + ".png"
    } else if (fs.existsSync(__dirname + "/assets/default_pack" + or_file_search + ".tga")) {
        or_file = __dirname + "/assets/default_pack" + or_file_search + ".tga"
    }
    if (!or_file) {
        res.send("CANNOT FIND DEFAULT")
        return false
    }

    fs.unlinkSync(cur_file)
    fs.copyFileSync(or_file, or_file.replace("default_pack", "pack"))

    // Remove item from owned
    try {
        let ownership = await findOwnership(req.body.location)
        await safeQuery(`DELETE
                         FROM dbo.OwnedItems
                         WHERE own_id = @ownid`, [{
            name: "ownid",
            types: mssql.TYPES.VarChar(200),
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

        req.files.file.mv(__dirname + "/assets/throw/" + meme.location).then(() => {
            delete meme.extension
            let memes = fetchThrowTemplates()
            memes.push(meme)
            fs.writeFileSync(__dirname + "/assets/throw/memes.json", JSON.stringify(memes))

            client.channels.fetch("894766287044096090").then(async channel => {
                generateThrow(await (await client.guilds.fetch("892518158727008297")).me.fetch(), (await client.guilds.cache.get("892518158727008297").members.fetch("689226786961489926")), meme.location).then(_meme => {
                    channel.send({
                        content: "This new template from <@" + player.data.discord_id + "> needs to be verified.",
                        files: [
                            new Discord.MessageAttachment()
                                .setFile(fs.readFileSync(_meme.file))
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

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

// app.post("/addOwnership/:key", (req, res) => {
//     keys.saveOwnership(req.params.key, req.body.fileLocation)
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
    //     for (let resource of bank.tradeResources) {
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
    //     for (let resource of bank.tradeResources) {
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
    res.send(JSON.stringify(dirTree(__dirname + "/assets/pack")))
})

app.get("/assets/search", (req, res) => {
    res.set({
        'Content-Type': 'application/json'
    });
    res.send(JSON.stringify(
        search_index.filter(item => {
            return item.replace(req.query.search, "").length !== item.length
        })
    ))
})

app.get("/lol.zip", async (req, res) => {
    let name = Math.floor(Math.random() * 100000000).toString() + "_lol.zip"
    console.log(name)
    await create_pack(name, res)
    try {
        res.end()
    } catch (e) {
    }
    // res.sendFile(__dirname + "/" + name, (err) => {
    //     // Delete the temporary file
    //     fs.unlinkSync(__dirname + "/" + name)
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
        ffmpeg(__dirname + "/assets/pack" + req.url.replace("/assets", "").replace(".mp3", ".ogg"))
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
    } else if (req.url.endsWith(".wav")) {
        console.log("Live converting wav...")
        console.log(req.headers)
        let output = Math.floor(Math.random() * 10000000000).toString() + "_temp.wav"
        res.set({
            'Content-Type': 'audio/x-wav',
            "Keep-Alive": "timeout=15, max=120"
        });
        // res.set("Content-Disposition", "attachment")
        ffmpeg(__dirname + "/assets/pack" + req.url.replace("/assets", "").replace(".wav", ".ogg"))
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
    } else if (fs.lstatSync(__dirname + "/assets/pack" + req.url.replace("/assets", "")).isDirectory()) {
        res.set("Content-Type", "application/json")
        let file_location = __dirname + "/assets/pack" + req.url.replace("/assets", "")
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

        files = files.sort((a, b) => {
            if (a.directory === b.directory) {
                return a.name > b.name
            }
            return a.directory > b.directory
        })

        res.send(JSON.stringify(files))
    } else {
        try {
            res.sendFile(__dirname + "/assets/pack" + req.url.replace("/assets", ""))
        } catch (e) {
            console.log(e)
        }
    }
})

app.get("/web_assets/*", (req, res) => {
    try {
        res.sendFile(__dirname + "/assets/html/web_assets" + req.url.replace("/web_assets", ""))
    } catch (e) {
        console.log(e)
    }
})

app.get("/favicon.ico", (req, res) => {
    res.sendFile(__dirname + "/assets/favicon.ico")
})

// app.get("/createNewKey/:player_name", (req, res) => {
//     let key = keys.newKey(req.params.player_name)
//     res.send("player name is " + req.params.player_name + ". Key is: " + key)
// })

app.get("/bannerimages", async (req, res) => {
    let banners = (await safeQuery("SELECT * FROM dbo.Banners")).recordset
    res.send(JSON.stringify(banners.map(banner => {
        return banner.url
    })))
})

app.post("/vote/:id", (req, res) => {

})

app.get("/updatebanner", async (req, res) => {
    update_banner()
    res.send("New banner!")
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
        memories = await safeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)`)
    } else {
        memories = await safeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)
                                      AND channel_id = '${req.params.channelid}'`)
    }
    let queue = new queueManager(8)
    queue.started = true
    for (let memory of memories.recordset) {
        if (memory.type === 0) {
            let extension = memory.data.split(".")[memory.data.split(".").length - 1]
            if (extension === "jpg" || extension === "jpeg" || extension === "png") {
                queue.pushToQueue(download_discord_attachment_with_info, [memory.msg_id, memory.channel_id, "https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            } else {
                queue.pushToQueue(download_discord_attachment, ["https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            }
        } else {
            queue.pushToQueue(download_ytdl, [memory.data, archive])
        }
    }
    queue.started = false
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
    if (req.params.userid === "all") {
        memories = await safeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)`)
    } else {
        memories = await safeQuery(`SELECT *
                                    FROM dbo.Memories
                                    WHERE (type = 1 OR attachment_id IS NOT NULL)
                                      AND author_discord_id = '${req.params.userId}'`)
    }
    console.log(memories)
    let queue = new queueManager(8)
    queue.started = true
    for (let memory of memories.recordset) {
        console.log(memory)
        if (memory.type === 0) {
            let extension = memory.data.split(".")[memory.data.split(".").length - 1]
            if (extension === "jpg" || extension === "jpeg" || extension === "png") {
                queue.pushToQueue(download_discord_attachment_with_info, [memory.msg_id, memory.channel_id, "https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            } else {
                queue.pushToQueue(download_discord_attachment, ["https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, archive])
            }
        } else {
            queue.pushToQueue(download_ytdl, [memory.data, archive])
        }
    }
    queue.started = false
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
//     let convert = spawn("/usr/bin/audiowaveform", ["-i", __dirname + "/assets/pack/" + audio_path + ".ogg", "-o", "track.dat", "-b", "8", "-z", "256"], {cwd: __dirname})
//     convert.on("close", () => {
//         // Get length of the track
//         getAudioDurationInSeconds(__dirname + "/assets/pack/" + audio_path + ".ogg").then(async duration => {
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
    res.send(JSON.stringify((await safeQuery("SELECT pack_id, pack_name, \"public\" FROM dbo.Packs")).recordset))
})
app.get("/packs/:packid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT pack_id, pack_name, \"public\" FROM dbo.Packs WHERE pack_id = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    if (data.recordset.length === 1) res.send(JSON.stringify(data.recordset[0]))
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/blocks", async (req, res) => {
    let data = await safeQuery("SELECT BlockID, GameID, SoundGroupID FROM dbo.PackBlocks WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await safeQuery("SELECT TextureGroupID, Type FROM dbo.PackBlockTextures WHERE BlockID = @blockid AND PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
            {name: "blockid", type: mssql.TYPES.Int, data: item.BlockID}
        ])
        item.texture_groups = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/blocks/:blockid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT BlockID, GameID, SoundGroupID FROM dbo.PackBlocks WHERE PackID = @id AND BlockID = @blockid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "blockid", type: mssql.TYPES.Int, data: parseInt(req.params.blockid)}
    ])
    if (data.recordset.length === 1) {
        data.recordset[0].texture_groups = (await safeQuery("SELECT TextureGroupID, Type FROM dbo.PackBlockTextures WHERE BlockID = @blockid AND PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
            {name: "blockid", type: mssql.TYPES.Int, data: parseInt(req.params.blockid)}
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/entities", async (req, res) => {
    let data = await safeQuery("SELECT EntityID, identifier FROM dbo.PackEntities WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await safeQuery("SELECT TextureID, Type FROM dbo.PackEntityTextures WHERE EntityID = @entity", [
            {name: "entity", type: mssql.TYPES.Int, data: item.EntityID}
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/entities/:entityid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT EntityID, identifier FROM dbo.PackEntities WHERE PackID = @id AND EntityID = @entityid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "entityid", type: mssql.TYPES.Int, data: parseInt(req.params.entityid)}
    ])
    if (data.recordset.length === 1) {
        // Find textures
        data.recordset[0].textures = (await safeQuery("SELECT TextureID, Type FROM dbo.PackEntityTextures WHERE EntityID = @entity", [
            {name: "entity", type: mssql.TYPES.Int, data: data.recordset[0].EntityID}
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/textures/groups", async (req, res) => {
    let data = await safeQuery("SELECT TextureGroupID, GameID, type FROM dbo.PackTextureGroups WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await safeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id ORDER BY Position ASC", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(item.TextureGroupID)},
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/textures/groups/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT TextureGroupID, GameID, type FROM dbo.PackTextureGroups WHERE PackID = @id AND TextureGroupID = @groupid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int, data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].textures = (await safeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id ORDER BY Position ASC", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(data.recordset[0].TextureGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/textures/", async (req, res) => {
    let data = await safeQuery("SELECT TextureID, TextureGroupID, Position, OverlayColor FROM dbo.PackTextures WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/textures/:textureid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT TextureID, TextureGroupID, Position, OverlayColor FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int, data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/textures/:textureid/stream", async (req, res) => {
    let data = await safeQuery("SELECT TextureID, DefaultFile FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int, data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        let _path = path.join(__dirname, "assets", "pack_textures", data.recordset[0].TextureID.toString() + ".png")
        if (fs.existsSync(_path)) res.sendFile(_path)
        else res.sendFile(path.join(__dirname, "assets", "pack", data.recordset[0].DefaultFile + ".png"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/groups", async (req, res) => {
    let data = await safeQuery("SELECT SoundGroupID, pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type FROM dbo.PackSoundGroups WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find sound events
        let events = await safeQuery("SELECT EventID, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID, EventType FROM dbo.PackSoundGroupEvents WHERE SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(item.SoundGroupID)},
        ])
        item.events = events.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/sounds/groups/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT SoundGroupID, pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type FROM dbo.PackSoundGroups WHERE PackID = @id AND SoundGroupID = @groupid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int, data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].events = (await safeQuery("SELECT EventID, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID, EventType FROM dbo.PackSoundGroupEvents WHERE SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(data.recordset[0].SoundGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/definitions", async (req, res) => {
    let data = await safeQuery("SELECT SoundDefID, Name FROM dbo.PackSoundDefinitions WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find sounds
        let sounds = await safeQuery("SELECT SoundID, is3D, volume, pitch, weight FROM dbo.PackSounds WHERE SoundDefID = @id", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(item.SoundDefID)},
        ])
        item.sounds = sounds.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/sounds/definitions/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT SoundDefID, Name FROM dbo.PackSoundDefinitions WHERE PackID = @id AND SoundDefID = @groupid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int, data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].sounds = (await safeQuery("SELECT SoundID, is3D, volume, pitch, weight FROM dbo.PackSounds WHERE SoundDefID = @id", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(data.recordset[0].SoundDefID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/sounds/", async (req, res) => {
    let data = await safeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight FROM dbo.PackSounds WHERE PackID = @id; SELECT @@IDENTITY AS NewID", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.post("/packs/:packid/sounds/", express.json(), async (req, res) => {
    let requirements = ["SoundDefID", "is3D", "volume", "pitch", "weight"]
    for (let item of requirements) if (typeof req.body[item] === "undefined") {
        res.status(400)
        res.send("Missing parameter: " + item)
        return
    }

    let data = await safeQuery("INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch, weight, PackID) VALUES (@sounddef, @is3D, @volume, @pitch, @weight, @packid); SELECT @@IDENTITY AS NewID;", [
        {name: "sounddef", type: mssql.TYPES.Int, data: req.body.SoundDefID},
        {name: "is3D", type: mssql.TYPES.Bit, data: req.body.is3D},
        {name: "volume", type: mssql.TYPES.Int, data: req.body.volume},
        {name: "pitch", type: mssql.TYPES.Int, data: req.body.pitch},
        {name: "weight", type: mssql.TYPES.Int, data: req.body.weight},
        {name: "packid", type: mssql.TYPES.Int, data: req.params.packid}
    ])
    res.setHeader("content-type", "application/json")
    console.log(data)
    res.send(JSON.stringify({
        SoundID: data.recordsets[0][0].NewID
    }))
})

app.post("/packs/:packid/sounds/:soundid/upload", fileUpload(), async (req, res) => {

})

app.get("/packs/:packid/sounds/:soundid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight FROM dbo.PackSounds WHERE PackID = @id AND SoundID = @soundid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "soundid", type: mssql.TYPES.Int, data: parseInt(req.params.soundid)}
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
    let data = await safeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight FROM dbo.PackSounds WHERE PackID = @id AND SoundID = @soundid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "soundid", type: mssql.TYPES.Int, data: parseInt(req.params.soundid)}
    ])

    if (data.recordset.length === 1) {
        let _path = path.join(__dirname, "assets", "pack_sounds", data.recordset[0].SoundID.toString() + ".ogg")
        if (fs.existsSync(_path)) res.sendFile(_path)
        else res.sendFile(path.join(__dirname, "assets", "pack_sounds", "template.mp3"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

app.get("/packs/:packid/items/", async (req, res) => {
    let data = await safeQuery("SELECT ItemID, TextureGroupID, GameID FROM dbo.PackItems WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)
        }
    ])

    for (let item of data.recordset) {
        // Find sound events
        let textures = await safeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(item.TextureGroupID)},
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

app.get("/packs/:packid/items/:itemid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await safeQuery("SELECT ItemID, TextureGroupID, GameID FROM dbo.PackItems WHERE PackID = @id AND ItemID = @itemid", [
        {name: "id", type: mssql.TYPES.Int, data: parseInt(req.params.packid)},
        {name: "itemid", type: mssql.TYPES.Int, data: parseInt(req.params.itemid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].textures = (await safeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int, data: parseInt(data.recordset[0].TextureGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

let wss = {
    http: new ws.Server({server: httpServer}),
    https: new ws.Server({server: httpsServer})
}

wss.onConenction = (ws => {
    ws.on("message", async msg => {
        let data = JSON.parse(msg.toString())
        if (data.action === "fetch_bank_data") {
            let player = new CrashBotUser(data.key)
            await player.get()
            ws.key = data.key
            let data_output = {
                "action": "bank_update",
                "data": {
                    "currency": player.currency,
                    "players": await keys.listplayer_names(),
                    "available_resources": bank.tradeResources.map(resource => {
                        return {
                            name: resource.name,
                            tag_name: resource.tag_name,
                            stock: resource.stock,
                            max_stock: resource.max_inventory,
                            worth: resource.calculateWorth()
                        }
                    })
                }
            }
            ws.send(JSON.stringify(data_output))
        }
    })
})

wss.http.on("connection", ws => wss.onConenction(ws))
wss.https.on("connection", ws => wss.onConenction(ws))
wss.fetchAllClients = () => {
    let clients = []
    for (let client of wss.http.clients) {
        clients.push(client)
    }

    for (let client of wss.https.clients) {
        clients.push(client)
    }
    return clients
}
wss.broadcast = function broadcast(msg) {
    // console.log(msg);
    try {
        wss.fetchAllClients().forEach(function (client) {
            client.send(msg);
        });
    } catch (e) {
    }
};
wss.updateBank = async () => {
    try {
        for (const client1 of wss.fetchAllClients()) {
            let player = new CrashBotUser(client1.key)
            await player.get()
            let data_output = {
                "action": "bank_update",
                "data": {
                    "currency": player.currency,
                    "players": await keys.listplayer_names(),
                    "available_resources": bank.tradeResources.map(resource => {
                        return {
                            name: resource.name,
                            tag_name: resource.tag_name,
                            stock: resource.stock,
                            max_stock: resource.max_inventory,
                            worth: resource.calculateWorth()
                        }
                    })
                }
            }
            client1.send(JSON.stringify(data_output))
        }

        // let online_players = await mcServer.getOnlinePlayers()
        //
        // let commands = [
        //     "scoreboard objectives remove bank",
        //     "scoreboard objectives add bank dummy Bank",
        //     "scoreboard objectives setdisplay list bank"
        // ]
        // for (let player of keys.map) {
        //     if (await online_players.players.indexOf(player[1].player_name) !== -1) {
        //         commands.push(`scoreboard players set "${player[1].player_name}" bank ${player[1].currency}`)
        //     }
        // }
        // console.log(commands)
        // mcServer.sendCommand(commands.join("\n"))
    } catch (e) {
        console.log(e)
    }
}

client.on("ready", async () => {
    client.channels.fetch("892518396166569994").then(channel => {
        console_channel = channel
    })

    client.channels.fetch("968298113427206195").then(channel => {
        chat_channel = channel
    })

    client.channels.fetch("968298431221211137").then(channel => {
        command_channel = channel
        command_channel.queue_array = []
        command_channel.queue_timeout = 0
        command_channel.queue = (item) => {
            clearTimeout(command_channel.queue_timeout)
            command_channel.queue_array.push(item)
            if (command_channel.queue_array.length === 10) {
                let embed = new Discord.MessageEmbed()
                embed.setDescription(command_channel.queue_array.join("\n"))
                command_channel.send({
                    embeds: [
                        embed
                    ]
                })
                command_channel.queue_array = []
            } else {
                command_channel.queue_timeout = setTimeout(() => {
                    let embed = new Discord.MessageEmbed()
                    embed.setDescription(command_channel.queue_array.join("\n"))
                    command_channel.send({
                        embeds: [
                            embed
                        ]
                    })
                    command_channel.queue_array = []
                }, 3000)
            }
        }
    })

    // Setup slash commands
    client.guilds.fetch("892518158727008297").then(async guild => {
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
        })

        guild.commands.create({
            name: "changemyname",
            description: "Change your nickname to something random. Will you get a good one, or one of the bad bad ones?"
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
        })

        guild.commands.create({
            name: "random_capture",
            description: "Receive the blessing (or curse) of a random screenshot.",
        })

        guild.commands.create({
            name: "economy_stats",
            description: "The server's economy system"
        })

        guild.commands.create({
            name: "economy_modify_stocks",
            description: "Modify the bank's stocks",
            defaultPermission: false,
            options: [
                {
                    type: 3,
                    name: "resource_tag_name",
                    description: "Example: iron_ingot",
                    required: true
                },
                {
                    type: 4,
                    name: "stock_count",
                    description: "How stocked the bank is on this item",
                    required: true
                },
                {
                    type: 4,
                    name: "max_stock_count",
                    description: "The maximum amount of stock the bank will take",
                    required: true
                }
                ,
                {
                    type: 4,
                    name: "baseline_price",
                    description: "The minimum price that this item will sell for.",
                    required: true
                }
            ]
        }).then(command => {
            guild.commands.permissions.add({
                command: command.id, permissions: [{
                    id: "894177595833339914",
                    type: "ROLE",
                    permission: true,
                }]
            })
        })

        guild.commands.create({
            name: "economy_modify_bank_accounts",
            description: "Modify the bank's stocks",
            defaultPermission: false,
            options: [
                {
                    type: 3,
                    name: "mc_username",
                    description: "The Minecraft username of the player who's bank account you are modifying",
                    required: true
                },
                {
                    type: 4,
                    name: "coins",
                    description: "Set the number of coins this player should have",
                    required: true
                }
            ]
        })
            .then(command => {
                guild.commands.permissions.add({
                    command: command.id, permissions: [{
                        id: "894177595833339914",
                        type: "ROLE",
                        permission: true
                    }]
                })
            })

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
        })
            .then(command => {
                guild.commands.permissions.add({
                    command: command.id, permissions: [{
                        id: "894177595833339914",
                        type: "ROLE",
                        permission: true
                    }]
                })
            })

        guild.commands.create({
            name: "addclaim",
            description: "Allow a user to edit an item in the resource pack editor",
            defaultPermission: false,
            options: [
                {
                    type: 3,
                    name: "mc_username",
                    description: "The player's Minecraft username",
                    required: true
                },
                {
                    type: 3,
                    name: "item_location",
                    description: "The location of the item. Example; /sounds/mob/chicken/say1.ogg",
                    required: true
                }
            ]
        })
            .then(command => {
                guild.commands.permissions.add({
                    command: command.id, permissions: [{
                        id: "894177595833339914",
                        type: "ROLE",
                        permission: true
                    }]
                })
            })

        guild.commands.create({
            name: "restart_server",
            description: "This will restart the server",
            defaultPermission: false
        })
            .then(command => {
                guild.commands.permissions.add({
                    command: command.id, permissions: [{
                        id: "894177595833339914",
                        type: "ROLE",
                        permission: true
                    }]
                })
            })

        guild.commands.create({
            name: "force_pack_update",
            description: "Negates the 5 minute wait that a resource pack update would usually have",
            defaultPermission: false
        })
            .then(command => {
                guild.commands.permissions.add({
                    command: command.id, permissions: [{
                        id: "894177595833339914",
                        type: "ROLE",
                        permission: true
                    }]
                })
            })

        guild.commands.create({
            name: "getlink",
            description: "Get your website link",
            defaultPermission: true
        })

        guild.commands.create({
            name: "#banner",
            defaultPermission: true,
            type: "MESSAGE"
        })

        guild.commands.create({
            name: "play",
            description: "Manage play queue",
            defaultPermission: true,
            options: [
                {
                    type: 1, // Sub command
                    name: "track",
                    description: "Add a track to the play queue",
                    options: [
                        {
                            type: 3,
                            name: "url",
                            description: "The link to the track. Only YouTube and Spotify are supported.",
                            required: true
                        },
                        {
                            type: 7,
                            name: "channel",
                            description: "The channel",
                            channelTypes: [2]
                        }
                    ]
                },
                {
                    type: 1, // Sub command
                    name: "playlist",
                    description: "Add a playlist to the play queue",
                    options: [
                        {
                            type: 3,
                            name: "url",
                            description: "The link to the playlist. Only YouTube and Spotify are supported.",
                            required: true
                        },
                        {
                            type: 7,
                            name: "channel",
                            description: "The channel",
                            channelTypes: [2]
                        }
                    ]
                }
            ]
        }).then(res => {
            console.log("Created /play!")
        }).catch(e => {
            console.log("Failed to create /play")
            console.error(e)
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
        })

        guild.commands.create({
            name: "dah-start",
            description: "Want to play Cards Against Humanity? Run this command to launch a game server and play!",
            defaultPermission: true
        })

        guild.commands.create({
            name: "dah-forceend",
            description: "This command is only available for admins",
            defaultPermission: false
        })

        // let secret_santa = ["291063946008592388", "393955339550064641", "404507305510699019", "405302588377006081", "633083986968576031", "741149173595766824"]
        // let secret_santa_2
        // while (true) {
        //     secret_santa_2 = shuffleArray(JSON.parse(JSON.stringify(JSON.parse(JSON.stringify(secret_santa)))))
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
        // fs.writeFileSync(__dirname + "/assets/secret_santa.json", JSON.stringify({santas: secret_santa, targets: secret_santa_2}))
        // guild.channels.fetch("899848529890148382").then(channel => {
        //     channel.send("Secret santa has begun! Please check your DMs for who you got. Maximum price limit is $40, but we recommend trying to stay around the $20 mark.")
        // })
    })
    client.application.commands.create({
        name: "username",
        description: "Add or change your name on our Minecraft server's whitelist",
        options: [
            {
                type: 3,
                name: "mc_username",
                description: "Your Minecraft username",
                required: true
            }
        ]
    })


    // Update player profile pictures
    // for (let player of keys.map) {
    //     client.users.fetch(player[1].discord_id).then(user => {
    //         player[1].avatar_url = user.avatarURL()
    //         console.log(user.username + ": " + player[1].avatar_url)
    //     }).catch(e => {})
    // }

    // Setup player active recorder
    let active_hours_message
    // client.channels.fetch("924454857908293713").then(channel => {
    //     channel.send({
    //         embeds : [new Discord.MessageEmbed().setTitle("Hold on a minute while we load player active hours...")]
    //     }).then(msg => {
    //         active_hours_message = msg
    //     })
    // })
    client.channels.fetch("924454857908293713").then(async channel => {
        active_hours_message = await channel.messages.fetch("926249152197832744")
    })

    // setInterval(() => {
    //     let embed = new Discord.MessageEmbed()
    //     let players_sorted = Array.from(keys.map, ([name, value]) => (value)).sort((a,b) => {
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
})

client.on("userUpdate", (oldUser, newUser) => {
    safeQuery(`UPDATE dbo.Users
               SET avatar_url = @avatarurl
               WHERE discord_id = @discordid`, [
        {name: "avatarurl", type: mssql.TYPES.VarChar(200), data: newUser.avatarURL()},
        {name: "discordid", type: mssql.TYPES.VarChar(20), data: newUser.id}
    ])
})

function shuffleArray(array) {
    let curId = array.length;
    // There remain elements to shuffle
    while (0 !== curId) {
        // Pick a remaining element
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        // Swap it with the current element.
        let tmp = array[curId];
        array[curId] = array[randId];
        array[randId] = tmp;
    }
    return array;
}

function generateThrow(sender, target, template = null) {
    return new Promise((resolve, reject) => {
        let memes = fetchThrowTemplates()

        let meme, temp_name, t
        if (template === null) {
            // Pick a random meme
            memes = memes.filter(meme => meme.verified)
            meme = memes[Math.floor(Math.random() * memes.length)]
            temp_name = Math.round(Math.random * 10000000) + meme.location
        } else {
            meme = memes.find(meme => {
                return meme.location === template
            })
            if (!meme) {
                console.log(template)
                reject("Ooop. We could not find that template")
                return false
            }
        }

        // Load in the image
        Jimp.read(__dirname + "/assets/throw/" + meme.location)
            .then(async image => {
                try {
                    let sender_pfp = sender.avatarURL({format: "jpg"})
                    if (!(sender_pfp && sender_pfp !== "")) {
                        sender_pfp = sender.user.avatarURL({format: "jpg"})
                    }
                    sender_pfp = await Jimp.read(sender_pfp)

                    let target_pfp = target.avatarURL({format: "jpg"})
                    if (!(target_pfp && sender_pfp !== "")) {
                        target_pfp = target.user.avatarURL({format: "jpg"})
                    }
                    target_pfp = await Jimp.read(target_pfp)
                    let random_users = shuffleArray((await sender.guild.members.fetch()).map(i => {
                        return i
                    }).filter(i => {
                        return i !== sender.id && i !== target.id
                    }))
                    let current_random = 0
                    for (let location of meme.pfp_locations) {
                        if (location.type === "target") {
                            let temp = await target_pfp.clone()
                            if (typeof location.circle !== "undefined") {
                                temp.circle()
                            }
                            temp.resize(location.size.x, location.size.y)
                            image.composite(temp, location.location.x, location.location.y)
                        } else if (location.type === "sender") {
                            let temp = await sender_pfp.clone()
                            if (typeof location.circle !== "undefined") {
                                temp.circle()
                            }
                            temp.resize(location.size.x, location.size.y)
                            image.composite(temp, location.location.x, location.location.y)
                        } else if (location.type === "random") {
                            let temp = random_users[current_random].avatarURL({format: "jpg"})
                            if (!(temp && temp !== "")) {
                                temp = random_users[current_random].user.avatarURL({format: "jpg"})
                            }
                            temp = await Jimp.read(temp)
                            if (typeof location.circle !== "undefined") {
                                temp.circle()
                            }
                            temp.resize(location.size.x, location.size.y)
                            image.composite(temp, location.location.x, location.location.y)

                            if (current_random === random_users.length) {
                                current_random = 0
                            } else {
                                current_random += 1
                            }
                        }
                    }
                    image.write(__dirname + "/" + temp_name, () => {
                        resolve({
                            template: meme,
                            file: __dirname + "/" + temp_name
                        })
                        setTimeout(() => {
                            fs.unlinkSync(__dirname + "/" + temp_name)
                        }, 5000)
                    })
                } catch (e) {
                    console.log(e)
                    reject("Whoops. It seems an error occoured while trying to generate a meme using `" + meme.location + "`\n\n```json\n" + JSON.stringify(meme) + "```\n" + e.toString())
                }
            })
    })
}

client.on("interactionCreate", async interaction => {
    if (interaction.isCommand()) {
        if (interaction.commandName === "economy_stats") {
            let embed = new Discord.MessageEmbed()
                .setTitle("Current bank stats")

            for (let resource of bank.tradeResources) {
                embed.addField(resource.name, "Stock: " + resource.stock + "/" + resource.max_inventory + "\n" + resource.calculateWorth() + "c per item")
            }
            interaction.reply({
                embeds: [embed]
            })
        } else if (interaction.commandName === "economy_modify_stocks") {
            let target_resource = interaction.options.getString("resource_tag_name")
            let out_resource
            let valid_tags = []
            for (let resource of bank.tradeResources) {
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
            } else {
                out_resource.stock = interaction.options.getInteger("stock_count")
                out_resource.max_inventory = interaction.options.getInteger("max_stock_count")
                out_resource.baseline_price = interaction.options.getInteger("baseline_price")
                interaction.reply({content: "Resource sucessfully modified", ephemeral: true})
            }
        } else if (interaction.commandName === "economy_modify_bank_accounts") {
            interaction.reply("This section of the economy manager has been deprecated due to changes in background processing.")
            // let target_player = interaction.options.getString("mc_username")
            // let out_player
            // let valid_usernames = []
            // for (let player of keys.map) {
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
            //     keys.map.get(out_player[0]).currency = interaction.options.getInteger("coins")
            //     interaction.reply({
            //         content: "Set " + out_player[1].player_name + "'s bank to " + interaction.options.getInteger("coins") + " coins.",
            //         ephemeral: true
            //     })
            //     wss.updateBank()
            // }
        } else if (interaction.commandName === "getlink") {
            // Get the code

            let req = await safeQuery(`SELECT shortcode
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
            } else {
                interaction.reply("You don't have a link yet. Run the `/username` command to generate your own link.")
            }
        } else if (interaction.commandName === "getcode") {
            let mc_username = interaction.options.getString("mc_username")
            let req = await safeQuery(`SELECT shortcode
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
            } else {
                interaction.reply({
                    content: "Could not find that player. They must run `/username` before you can get their code.",
                    ephemeral: true
                })
            }
        } else if (interaction.commandName === "addclaim") {
            interaction.reply("Managing claims is currently unsupported")
        } else if (interaction.commandName === "restart_server") {
            interaction.reply("Command is currently unavailable")
            // interaction.deferReply().then(async msg => {
            //     interaction.editReply("Shutting down server...")
            //     await mcServer.shutdown()
            //     interaction.editReply("Restarting server...")
            //     mcServer.start()
            // })
        } else if (interaction.commandName === "force_pack_update") {
            try {
                clearTimeout(auto_pack_update_timeout)
            } catch (e) {
            }
            interaction.reply({
                content: "Updating the pack...",
                ephemeral: true
            })
        } else if (interaction.commandName === "throw") {
            // Read available memes
            interaction.deferReply().then(async () => {
                generateThrow(await interaction.member.fetch(), await interaction.options.getMember("user").fetch(), interaction.options.getString("template")).then(meme => {
                    interaction.editReply({
                        content: "TEMPLATE: `" + meme.template.location + "`", files: [
                            new Discord.MessageAttachment()
                                .setFile(fs.readFileSync(meme.file))
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
        } else if (interaction.commandName === "random_capture") {
            interaction.reply(await generateRandomCaptureMsg())
        } else if (interaction.commandName === "username") {
            let username = interaction.options.getString("mc_username")
            let member = await interaction.user.fetch()
            // Check if the user has already inputted a username
            let req = await safeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])
            // let key = [...keys.map].find(key => {return key[1].discord_id === member.id})
            if (req.recordset.length > 0) {
                // Remove the previous username from the whitelist, and kick any user with that username
                // mcServer.sendCommand("whitelist remove " + key[1].player_name + "\n" +
                //     "kick " + key[1].player_name + " \"Your Minecraft account was disassociated with a Discord account on the Re-Flesh Discord server.")

                interaction.reply("You have already used `/username`. If you have forgotten or lost your special website link, you can use `/getlink`.")
            } else {
                key = keys.newKey(username, interaction.user)
                member.send({
                    content: "This is your special link to our website. This link will give you access" +
                        "to the modpack, tesxture pack maker, and much more. Please be aware that this link is" +
                        "**specifically for you** and should not be shared.\n\n" +
                        "https://joemamadf7.jd-data.com:8050/home/" + key
                })
                interaction.reply({
                    content: " ",
                    embeds: [
                        new Discord.MessageEmbed()
                            .setDescription("AWESOME `" + username + "`! Your username has been set to `" + username + "`! If you want to, you can change it by using `/username` again.\n\nNow that that's setup, when you're ready go to [our website](https://joemamadf7.jd-data.com:8050/home/" + key + ") to get your Minecraft game setup. Doing this before the server launch is recommended. You may also wanna bookmark our website, as the link we've given you is for **you only**.")
                            .setImage("https://cdn.discordapp.com/attachments/894754274892972083/946186466147565658/banner.png")
                    ],
                    components: [
                        new Discord.MessageActionRow()
                            .addComponents(
                                new Discord.MessageButton()
                                    .setLabel("Our website")
                                    .setStyle("LINK")
                                    .setURL("https://joemamadf7.jd-data.com:8050/home/" + key)
                            )
                    ],
                    ephemeral: true
                })
            }
            // mcServer.sendCommand("whitelist add " + username)
        } else if (interaction.commandName === "cheese" || interaction.commandName === "butter" || interaction.commandName === "bread" || interaction.commandName === "jam" || interaction.commandName === "peanutbutter") {
            // Say something as cheese
            const data = {
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


            interaction.channel.fetchWebhooks()
                .then(async hooks => {
                    let webhooks = hooks.filter(hook => hook.name === data[interaction.commandName].name)
                    let webhook
                    if (webhooks.size === 0) {
                        // Create the webhook
                        webhook = await interaction.channel.createWebhook(data[interaction.commandName].name, {
                            avatar: data[interaction.commandName].avatar,
                            reason: "Needed new cheese"
                        })
                    } else {
                        // console.log([...hooks][0])
                        webhook = [...hooks.filter(hook => hook.name.toLowerCase() === interaction.commandName.toLowerCase())][0][1]
                        console.log(webhook)
                    }
                    webhook.send(interaction.options.getString("message"))
                    interaction.reply({
                        content: "Mmm. Cheese.",
                        fetchReply: true
                    }).then(msg => {
                        msg.delete()
                    })
                })
        } else if (interaction.commandName === "play") {
            if (!interaction.member.voice.channel) {
                interaction.reply("You need to join a voice channel first")
                return
            }

            let com = interaction.options.getSubcommand()
            let channel = interaction.options.getChannel("channel") || interaction.member.voice.channel
            if (com === "track") {
                let url = interaction.options.getString("url")

                // Check audio queue
                if (!audio_queue) {
                    audio_queue = new audioQueueManager(discord_voice.joinVoiceChannel({
                        channelId: channel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator
                    }), channel)
                } else if (!audio_queue.channel) {
                    delete audio_queue
                    audio_queue = new audioQueueManager(discord_voice.joinVoiceChannel({
                        channelId: channel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator
                    }), channel)
                } else if (audio_queue.channel.id !== channel.id) {
                    console.log(audio_queue.vc_connection)
                    interaction.reply("I'm already playing music in another channel, sorry.")
                    return
                }

                audio_queue.addToQueue(url).then(() => {
                    interaction.reply({content: "Item has been queued!", ephemeral: true})
                }).catch(e => {
                    console.error(e)
                    interaction.reply({content: "Opps! An error occured.\n```" + e.toString() + "```", ephemeral: true})
                })
            } else if (com === "playlist") {
                let url = interaction.options.getString("url")

                // Check audio queue
                if (!audio_queue) {
                    audio_queue = new audioQueueManager(discord_voice.joinVoiceChannel({
                        channelId: channel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator
                    }), channel)
                } else if (!audio_queue.channel) {
                    delete audio_queue
                    audio_queue = new audioQueueManager(discord_voice.joinVoiceChannel({
                        channelId: channel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator
                    }), channel)
                } else if (audio_queue.channel.id !== channel.id) {
                    console.log(audio_queue.vc_connection)
                    interaction.reply("I'm already playing music in another channel, sorry.")
                    return
                }

                await interaction.deferReply({ephemeral: true})

                if (url.includes("youtube.com")) {
                    try {
                        let playlist = await ytpl(url)
                        for (let item of playlist.items) {
                            await audio_queue.addToQueue(item.url)
                        }
                        interaction.editReply("Playlist loaded")
                    } catch (e) {
                        interaction.editReply("Failed to load playlist")
                    }
                } else if (url.includes("spotify.com")) {
                    if (url.includes("/playlist")) {
                        try {
                            let data = await spotify.getPlaylist(url)
                            console.log(data)

                            for (let item of data.tracks) {
                                await audio_queue.addToQueue("https://open.spotify.com/track/" + item)
                            }
                            interaction.editReply("Loaded Spotify Album")
                        } catch (e) {
                            console.error(e)
                            interaction.editReply("Invalid spotify playlist link")
                        }
                    } else if (url.includes("/album")) {
                        try {
                            let data = await spotify.getAlbum(url)
                            console.log(data)

                            for (let item of data.tracks) {
                                await audio_queue.addToQueue("https://open.spotify.com/track/" + item)
                            }
                            interaction.editReply("Loaded Spotify Album")
                        } catch (e) {
                            console.error(e)
                            interaction.editReply("Invalid spotify playlist link")
                        }
                    }
                } else if (url.startsWith("crashbot://playlist/")) {
                    let playlist_search = await safeQuery("SELECT playlist_id FROM dbo.Playlists WHERE shortcode = @shortcode", [
                        {name: "shortcode", type: mssql.TYPES.VarChar, data: url.replace("crashbot://playlist/", "")}
                    ])
                    if (playlist_search.recordset.length !== 1) {
                        interaction.reply({
                            content: "An error occured while trying to load the playlist. Please ensure that the shortcode is correct first",
                            ephemeral: true
                        })
                        return
                    }

                    let playlist = new Playlist(playlist_search.recordset[0].playlist_id)
                    let tracks = await playlist.getPlaylistItems()
                    for (let item of tracks) {
                        console.log(item)
                        if (item.player === 0) {
                            await audio_queue.addToQueue("https://www.youtube.com/watch?v=" + item.source_id)
                        } else if (item.player === 1) {
                            await audio_queue.addToQueue("https://open.spotify.com/track/" + item.source_id)
                        }
                    }

                    audio_queue.startTrack()
                    interaction.editReply("Playlist is loading.  " + tracks.length + " tracks are being added to the queue")
                } else {
                    interaction.editReply("Only Spotify and YouTube are supported")
                }
            }
        } else if (interaction.commandName === "playlist") {
            let com = interaction.options.getSubcommand()
            let shortcode
            try {
                shortcode = (await safeQuery(`SELECT shortcode
                                              FROM dbo.Users
                                              WHERE discord_id = @discordid`, [
                    {name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.member.id}
                ])).recordset[0].shortcode
            } catch (e) {
                interaction.reply("You have not run `/username`. You need to run `/username` before you can use this functionality.")
                return
            }
            await interaction.deferReply({ephemeral: true})
            let user = new CrashBotUser(shortcode)
            if (com === "list") {
                // List all available playlists
                let playlists = await user.getPlaylists(true)
                let embed = new Discord.MessageEmbed()
                for (let playlist of playlists) await playlist.get()
                embed.setTitle("Your playlists")
                embed.setDescription(playlists.map(playlist => {
                    if (playlist.data.type === 0) {
                        return '`private` ' + playlist.data.playlist_name + " `crashbot://playlist/" + playlist.data.shortcode + "`"
                    } else if (playlist.data.type === 1) {
                        return '`public` ' + playlist.data.playlist_name + " `crashbot://playlist/" + playlist.data.shortcode + "`"
                    }
                }).join("\n"))
                interaction.editReply({content: " ", embeds: [embed]})
            } else if (com === "setactive") {
                await user.get()
                let playlist_search = await safeQuery("SELECT playlist_id FROM dbo.Playlists WHERE shortcode = @shortcode AND owner_id = @owner", [
                    {
                        name: "shortcode",
                        type: mssql.TYPES.VarChar,
                        data: interaction.options.getString("shortcode").replace("crashbot://playlist/", "")
                    },
                    {name: "owner", type: mssql.TYPES.Int, data: user.id}
                ])
                if (playlist_search.recordset.length !== 1) {
                    interaction.editReply({
                        content: "An error occured while trying to load the playlist. Please ensure that the shortcode/url is correct first, and that you are the playlist owner.",
                        ephemeral: true
                    })
                    return
                }

                active_playlist_modifications[interaction.member.id] = {
                    playlist: new Playlist(playlist_search.recordset[0].playlist_id),
                    timeout: setTimeout(() => {
                        delete active_playlist_modifications[interaction.member.id]
                    }, 300000)
                }
                interaction.editReply("Playlist selected successfully! You can now use other `/playlist` commands to modify it.")
            } else if (com === "new") {
                await user.get()
                let [shortcode, name, type] = [makeid(10), interaction.options.getString("name"), interaction.options.getBoolean("public")]
                await safeQuery("INSERT INTO Playlists (owner_id, playlist_name, shortcode, type) VALUES (@owner, @name, @shortcode, @type)", [
                    {name: "owner", type: mssql.TYPES.Int, data: user.id},
                    {name: "name", type: mssql.TYPES.VarChar(50), data: name},
                    {name: "shortcode", type: mssql.TYPES.VarChar(10), data: shortcode},
                    {name: "type", type: mssql.TYPES.TinyInt, data: type ? 1 : 0}
                ])
                interaction.editReply({
                    content: "New playlist created!", embeds: [new Discord.MessageEmbed()
                        .setTitle("New playlist")
                        .addFields([
                            {name: "Playlist name", value: name},
                            {name: "Public?", value: type ? "Playlist is public" : "Playlist is not public"},
                            {
                                name: "URL and shortcode",
                                value: `URL: \`crashbot://playlist/${shortcode}\`\nShortcode: ${shortcode}`
                            }
                        ])
                    ]
                })
            } else if (com === "addtrack") {
                if (typeof active_playlist_modifications[interaction.member.id] === "undefined") {
                    interaction.editReply("You need to select the playlist you want to odify first. use `/playlist setactive` to select the playlist.")
                    return
                }

                clearTimeout(active_playlist_modifications[interaction.member.id].timeout)
                active_playlist_modifications[interaction.member.id].timeout = setTimeout(() => {
                    delete active_playlist_modifications[interaction.member.id]
                }, 300000)

                try {
                    await active_playlist_modifications[interaction.member.id].playlist.addTrackUrl(interaction.options.getString("url"))
                } catch (e) {
                    interaction.editReply("Failed to add that track to your playlist: " + e)
                    return
                }
                interaction.editReply("The track has been added!")
            } else if (com === "addqueue") {
                if (typeof active_playlist_modifications[interaction.member.id] === "undefined") {
                    interaction.editReply("You need to select the playlist you want to odify first. use `/playlist setactive` to select the playlist.")
                    return
                }

                clearTimeout(active_playlist_modifications[interaction.member.id].timeout)
                active_playlist_modifications[interaction.member.id].timeout = setTimeout(() => {
                    delete active_playlist_modifications[interaction.member.id]
                }, 300000)

                let [total, success, failed] = [audio_queue.queue.length, 0, 0]
                for (let item of audio_queue.queue) {
                    try {
                        await active_playlist_modifications[interaction.member.id].playlist.addTrack(item.player === "ytdl" ? 0 : 1, item.id)
                        success += 1
                    } catch (e) {
                        failed += 1
                    }
                }

                interaction.editReply(`Saved the queue items to the playlist!\nTotal: ${total}, Successful: ${success}, Failed: ${failed}`)
            }
        } else if (interaction.commandName === "dah-start") {
            if (dah) {
                // A game is already in progress
                interaction.reply({
                    content: "A game is currently active. Please join the game, or wait until it ends.",
                    ephemeral: true
                })
                return
            }

            await interaction.deferReply()
            // Startup the DAH server
            dah = new DAHServer()
            dah.on("ready", () => {
                interaction.editReply("Discord Against Humanity is ready! Join the game at https://joemamadf7.jd-data.com:8086/ !")
            })
            dah.on("end", () => {
                dah = null
            })
        } else if (interaction.commandName === "dah-forceend") {
            if (!dah) {
                // A game is already in progress
                interaction.reply({content: "There is no active game", ephemeral: true})
                return
            }

            dah.process.kill()
            interaction.reply("The game server has been killed")
        } else if (interaction.commandName === "changemyname") {
            const nicknames = [
                "target's WaiFu", "Asian target", "No air frier :'(", "Numb Nuts - The Man", "Oh Daddy", "B*tch (luv u)",
                "British target", "Not target (sadly)", "target (but hairier)", "Zavala", "OoOoOoOoOoO I'M A GHOST", "Your mother", "Afraid of target",
                "Nerd", "Geek 2.0", "O-O", "OwO", "Free Robux (click for info)", "Free Minecraft Servers", "I no like nickname :(", "2:33 AM", "pls watch my yt apology video",
                "Crash Bot rules!", "Crash Bot sucks! :("
            ]
            let target = shuffleArray((await interaction.guild.members.fetch()).map(i => {
                return i
            }))[0]
            let or_nickname = (await interaction.member.fetch()).nickname
            let nickname = nicknames[Math.floor(Math.random() * nicknames.length)].replace("target", target.user.username.length < (target.nickname || "").length ? target.user.username : target.nickname)

            interaction.member.setNickname(nickname).then(m => {
                let embed = new Discord.MessageEmbed()
                embed.setTitle("New nickname!")
                if (or_nickname) {
                    embed.setDescription("Your nickname was `" + or_nickname + "`. It is now `" + nickname + "`")
                } else embed.setDescription("Your nickname was proudly generated by Crash Bot.")
                interaction.reply("Hello `" + nickname + "`!", {embeds: [embed]})
            }).catch(e => {
                console.log(e)
                interaction.reply("Your nickname is too powerful! I was gonna call you `" + nickname + "` but Discord didn't let me :'(.")
            })

        } else {
            console.log("Unknown command interaction picked up")
            console.log(interaction)
        }
    } else if (interaction.isMessageContextMenu()) {
        interaction.targetMessage.fetch().then(async msg => {
            try {
                let count = 0
                // Get the user's key
                let req = await safeQuery(`SELECT shortcode
                                           FROM dbo.Users
                                           WHERE discord_id = @discordid`, [{
                    name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
                }])

                if (req.recordset.length !== 0) {
                    let user = new CrashBotUser(req.recordset[0].shortcode)
                    if (msg.author.id === interaction.user.id) {
                        for (let attachment of msg.attachments) {
                            if (attachment[1].contentType.startsWith("image/")) {
                                await user.newBanner(attachment[1].url)
                                count += 1
                            }
                        }
                    } else {
                        interaction.reply("For privacy, security, and a few other reasons, you can only reply to messages with #banner if the original message was also sent by you. If the original message was sent by someone else, please ask them to add it to the banner queue.")
                    }
                    interaction.reply(`${count} banners have been added!`)
                } else {
                    interaction.reply({content: "This command is only available to users who have linked a Minecraft account to their Discord. Please use `/username` to link yours first."})
                }
            } catch (e) {
                console.error(e)
                interaction.reply("Failed to add you banner(s). Please try again.")
            }
        })
    } else if (interaction.isButton()) {
        if (interaction.customId === "getlink") {
            // Get the code

            let req = await safeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            if (req.recordset.length !== 0) {
                interaction.reply({
                    content: `Your website access link is: https://joemamadf7.jd-data.com:8050/home/${req.recordset[0].shortcode}. It has also been DMed to you to help you find it again later.`,
                    ephemeral: true
                })
            } else {
                interaction.reply("You don't have a link yet. Run the `/username` command to generate your own link.")
            }
        } else if (interaction.customId.startsWith("verify_throw_")) {
            let template_id = interaction.customId.replace("verify_throw_", "")
            console.log(template_id)

            let memes = fetchThrowTemplates()
            let meme = memes.find(meme => {
                return meme.location === template_id
            })
            if (!meme) {
                interaction.reply("Ooop. We could not find that template")
                return false
            } else {
                memes[memes.indexOf(meme)].verified = true
                fs.writeFileSync(__dirname + "/assets/throw/memes.json", JSON.stringify(memes))
                interaction.reply("👍 Verified")
            }
        } else if (interaction.customId === "audio_shuffle") {
            if (audio_queue) {
                audio_queue.shuffle()
                interaction.reply({content: "The queue has been shuffled", ephemeral: true})
            } else {
                interaction.reply("There is no active queue. Connect to a voice channel and run `/play` first.")
            }
        } else if (interaction.customId === "audio_stop") {
            if (audio_queue) {
                interaction.reply({content: "Stopping audio...", ephemeral: true})
                audio_queue.stop()
            } else {
                interaction.reply({content: "Queue is empty", ephemeral: true})
            }
        } else if (interaction.customId === "audio_rewind") {
            interaction.reply({content: "Rewinding track...", ephemeral: true})
            audio_queue.rewind()
        } else if (interaction.customId === "audio_pause") {
            interaction.reply({content: "Pausing/Resuming track...", ephemeral: true})
            audio_queue.pause()
        } else if (interaction.customId === "audio_skip") {
            interaction.reply({content: "Skipping track...", ephemeral: true})
            audio_queue.skip()
        } else if (interaction.customId === "audio_challenge") {
            let res = await audio_queue.challenge()
            if (res) {
                interaction.reply("Challenge mode has been enabled!")
            } else {
                interaction.reply("Challenge mode has been disabled.")
            }
        } else if (interaction.customId === "random_capture") {
            interaction.reply(await generateRandomCaptureMsg())
        }
    }
})

client.on("messageCreate", async msg => {
    console.log(msg.content.toLowerCase().replace(/\W/g, '').includes('bruh'))
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

    // if (msg.channel.id === "892518396166569994" && msg.author.bot === false) {
    //     // mcServer.sendCommand(msg.content)
    // }
    if (msg.author.id === "404507305510699019" && msg.content.startsWith("test")) {
        console.log("RUNNING TEST...")
        let attachment = msg.attachments.first()
        console.log(attachment)
        let name = attachment.name.split(".")
        let extension = name[name.length - 1]
        let file = await download_discord_attachment(attachment.url, extension)
        let font_big = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
        let font_small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
        Jimp.read(file)
            .then(async image => {
                // console.log(image.getWidth(), image.getHeight())
                let width = image.getWidth()
                let height = image.getHeight()

                if (width > height && width > 1080) {
                    height = (height / width) * 1080
                    width = 1080
                    image.resize(width, height)
                } else if (height > width && height > 1080) {
                    width = (width / height) * 1080
                    height = 1080
                    image.resize(width, height)
                }

                // Place black bar along bottom
                let color = Jimp.rgbaToInt(255, 255, 255, .75)
                new Jimp(width, height + 130, "#000", async (err, out) => {
                    out.composite(image, 0, 0)

                    let author = await Jimp.read(msg.member.avatarURL({format: "jpg"}) || msg.author.avatarURL({format: "jpg"}))
                    author.resize(100, 100)
                    author.circle()
                    out.composite(author, 20, height + 20)

                    out.print(font_big, 140, height + 20, msg.member.nickname || msg.author.username)
                    out.print(font_small, 140, height + 80, "#" + msg.channel.name)
                    if (msg.content && msg.content.length < 100) out.print(font_small, 200, height + 20, {
                            text: msg.content,
                            alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT
                            // alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                        },
                        width - 220,
                        height)
                    out.getBufferAsync(Jimp.MIME_JPEG).then(buffer => {
                        msg.reply({
                            content: "TEST", files: [
                                new Discord.MessageAttachment()
                                    .setFile(buffer)
                            ]
                        })
                    })
                })
            })
    }
    if (msg.channel.id === "968298113427206195" && msg.author.bot === false) {
        let content = ["", {
            text: "["
        }, {
            text: msg.member.user.username,
            color: msg.member.displayHexColor
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
    } else if (msg.content.toLowerCase() === "guess what?") {
        msg.reply({
            content: "_", files: [
                new Discord.MessageAttachment()
                    .setFile(fs.readFileSync(__dirname + "/assets/guess_what.jpg"))
            ]
        })
    } else if (msg.content.toLowerCase() === "aughua" && msg.author.bot !== true) {
        const responses = [
            "Nuh uh uh!",
            "That's illegal",
            "https://tenor.com/view/nope-not-a-chance-no-gif-13843355",
            "/throw",
            "You have been reported to the authorities"
        ]
        let msg_txt = responses[Math.floor(Math.random() * responses.length)]
        if (msg_txt === "/throw") {
            // Read available memes
            let memes = fetchThrowTemplates().filter(meme => meme.verified)

            let meme, temp_name, t
            // Pick a random meme
            meme = memes[Math.floor(Math.random() * memes.length)]
            temp_name = Math.round(Math.random * 10000000) + meme.location

            generateThrow(await msg.guild.me.fetch(), await msg.member.fetch()).then(meme => {
                msg.reply({
                    content: " ", files: [
                        new Discord.MessageAttachment()
                            .setFile(fs.readFileSync(meme.file))
                    ]
                }).then(() => {

                })
            }).catch(e => msg.reply(e))
        } else {
            msg.reply(msg_txt).then(_msg => {
                // setTimeout(() => {
                //     _msg.delete()
                //     msg.delete()
                // }, 5000)
            })
        }
        msg.channel.guild.channels.fetch("950939869776052255").then(channel => {
            let embed = new Discord.MessageEmbed()
            embed.setTitle("A user f*ked up in general. Time to raid them.")
            embed.setDescription("<@" + msg.author.id + "> said `" + msg.content + "` in <#" + msg.channel.id + ">. The message has since been removed.")
            channel.send({
                content: ' ',
                embeds: [embed]
            })
        })
    } else if (msg.content.replace("#banner").length !== msg.content.length && msg.author.bot === false) {
        try {
            if (msg.channel.nsfw) {
                msg.reply("For the safety of users in this server, setting banners inside an NSFW channel is prohibbited.")
                return false
            }

            let count = 0
            // Get the user's key
            let req = await safeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: msg.author.id
            }])

            if (req.recordset.length !== 0) {
                let user = new CrashBotUser(req.recordset[0].shortcode)
                for (let attachment of msg.attachments) {
                    console.log(attachment[1].contentType)
                    if (attachment[1].contentType.startsWith("image/")) {
                        await user.newBanner(attachment[1].url)
                        count += 1
                    }
                }

                if (msg.type === "REPLY") {
                    let msg2 = await msg.fetchReference()
                    if (msg2.author.id === msg.author.id) {
                        for (let attachment of msg2.attachments) {
                            if (attachment[1].contentType.startsWith("image/")) {
                                await user.newBanner(attachment[1].url)
                                count += 1
                            }
                        }
                    } else {
                        msg.reply("For privacy, security, and a few other reasons, you can only reply to messages with #banner if the original message was also sent by you. If the original message was sent by someone else, please ask them to add it to the banner queue.")
                    }
                }
                msg.reply({
                    content: `${count} banners have been added! To check the rules for banners (The Spotlight Gallery), please check the website.`,
                    components: [
                        new Discord.MessageActionRow()
                            .addComponents([
                                new Discord.MessageButton()
                                    .setCustomId("getlink")
                                    .setLabel("Get me my website link")
                                    .setStyle("SECONDARY")
                            ])
                    ]
                })
            } else {
                msg.reply("It seems you haven't linked a Minecraft account yet. Please go into my DMs and use the slash command `/username` to link your Minecraft **Java** account. **If you do not have a Minecraft Java account**, just use enter a random username instead.")
            }
        } catch (e) {
            console.error(e)
            msg.reply("Failed to add your banner(s). Please try again.")
        }
    } else if (msg.content.toLowerCase().replace(/\W/g, '').includes('bruh')) {
        let rand_member = shuffleArray((await msg.guild.members.fetch()).map(i => {
            return i
        }))[0]
        const msgs = [
            "balls",
            "That is quite the bruh moment",
            "This is not actually " + (rand_member.username || rand_member.user.username),
            "BALLS",
            "https://tenor.com/view/bruh-be-bruh-beluga-gif-25964074",
            "https://tenor.com/view/what-bruh-steve-harvey-shocked-surprised-gif-17654826",
            "https://tenor.com/view/bruh-gif-13889648",
            "Choccy milk anyone?",
            "https://tenor.com/view/bowling-ball-bowling-alley-bowling-pin-gif-25336718",
            "https://tenor.com/view/patrick-star-stare-spongebob-squarepants-gif-17131706",
            "https://tenor.com/view/kirakat5-liver-gif-25650211",
            "https://tenor.com/view/grill-grill-fail-idiot-fire-gif-25095963",
            "https://tenor.com/view/bench-warmers-throw-john-heder-lawn-mower-gif-11416065",
            "https://tenor.com/view/kermit-kermit-the-frog-bruh-smiling-drive-gif-15005835",
            "https://tenor.com/view/minecraft-meme-deepfried-oh-nah-bruh-gif-23469570",
            "https://tenor.com/view/dog-ball-dog-gets-ball-meme-bottles-gif-25461285",
            "https://tenor.com/view/balls-jaws-gumball-meme-gif-21859168",
            "https://tenor.com/view/sad-gif-18026986",
            "https://tenor.com/view/bruh-moai-moyai-zemby7-big_funky-gif-23796913"
        ]
        console.log("Someone bruhed")

        msg.channel.createWebhook(rand_member.nickname || rand_member.user.username, {
            avatar: rand_member.user.avatarURL(),
            reason: "Needed new cheese"
        }).then(webhook => {
            webhook.send(msgs[Math.floor(Math.random() * msgs.length)]).then(() => {
                webhook.delete()
            })
        }).catch(e => {
            console.error(e)
        })
    } else if ((msg.content.toLowerCase().replace(/\W/g, '').includes("augh")) && !msg.author.bot) {
        msg.reply(msg.content)
    } else if (msg.content.toLowerCase() === "damn it stinks" && msg.member.voice.channelId) {
        if (!fart_player || msg.guild.me.voice.channelId !== msg.member.voice.channelId) {
            msg.reply("Wasn't me")
        } else {
            fart_connection.unsubscribe()
            fart_connection.disconnect()
            fart_player = null
            msg.reply("sorry")
        }
    } else if (msg.content.toLowerCase().replaceAll(/[^a-zA-Z0-9]/g, "") === "herecomesanotherchineseearthquake") {
        msg.reply({content: "e" + "br".repeat(Math.floor(Math.random() * 999)), tts: true})
    } else if (msg.content.length <= 5 && (!isNaN(msg.content))) {
        if (!isNaN((parseFloat(msg.content) - 1))) setTimeout(() => {
            let num = parseFloat(msg.content)
            msg.reply((num - 1).toString())
        }, 1000)
    } else if (msg.mentions.has(client.user)) {
        // Read available memes
        let memes = fetchThrowTemplates().filter(meme => meme.verified)
        is
        let meme, temp_name, t
        // Pick a random meme
        meme = memes[Math.floor(Math.random() * memes.length)]
        temp_name = Math.round(Math.random * 10000000) + meme.location

        generateThrow(await msg.guild.me.fetch(), await msg.member.fetch()).then(meme => {
            msg.reply({
                content: " ", files: [
                    new Discord.MessageAttachment()
                        .setFile(fs.readFileSync(meme.file))
                ]
            }).then(() => {

            })
        }).catch(e => msg.reply(e))
    } else if (msg.content.toLowerCase().replaceAll(/[^a-zA-Z0-9]/g, "").includes("destiny2")) {
        let rand_member = shuffleArray((await msg.guild.members.fetch()).map(i => {
            return i
        }))[0]

        const memes = [
            "https://tenor.com/view/destiny-best-mates-sami-glitch-sami-destiny2-gif-15811476",
            "https://tenor.com/view/destiny-destiny2-titan-taunt-dance-gif-16756581",
            "https://tenor.com/view/sami-glitch-sami-julian-caddie-smooth-destiny-gif-15813239",
            "https://tenor.com/view/sami-glitch-sami-destiny2-destiny-best-mates-gif-15811472",
            "https://tenor.com/view/destiny2-destiny-best-mates-dance-phantoms-gif-15811468"
        ]
        msg.channel.createWebhook(rand_member.nickname || rand_member.user.username, {
            avatar: rand_member.user.avatarURL(),
            reason: "Needed new cheese"
        }).then(webhook => {
            webhook.send(memes[Math.floor(Math.random() * memes.length)]).then(() => {
                webhook.delete()
            })
        }).catch(e => {
            console.error(e)
        })
    }
    if (msg.channel.id === "910649212264386583" && msg.content.replace(/[^"]/g, "").length >= 2) {
        // Assume this message is a quote
        await safeQuery("INSERT INTO dbo.Quotes (msg_id, quote) VALUES (@msg,@quote)", [
            {name: "msg", type: mssql.TYPES.VarChar, data: msg.id},
            {name: "quote", type: mssql.TYPES.VarChar, data: msg.content}
        ])
        msg.react("🫃")
    }

    if (imageCaptureChannels.indexOf(msg.channel.id) !== -1 && !msg.author.bot) {
        let urls = msg.content.match(/\bhttps?:\/\/\S+/gi) || []
        let yt_urls = []
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
                            await safeQuery("INSERT INTO dbo.Memories (author_discord_id, channel_id, data, msg_id, attachment_id) VALUES (@author,@channel,@data,@msg,@attachmentid)", [
                                {name: "author", type: mssql.TYPES.VarChar, data: msg.author.id},
                                {name: "channel", type: mssql.TYPES.VarChar, data: msg.channel.id},
                                {name: "data", type: mssql.TYPES.VarChar, data: attachment[1].name},
                                {name: "msg", type: mssql.TYPES.VarChar, data: msg.id},
                                {name: "attachmentid", type: mssql.TYPES.VarChar, data: attachment[1].id}
                            ])
                            console.log("Saved attachment")
                        }

                        for (let url of yt_urls) {
                            await safeQuery("INSERT INTO dbo.Memories (author_discord_id, channel_id, data, msg_id, type) VALUES (@author,@channel,@data,@msg,1)", [
                                {name: "author", type: mssql.TYPES.VarChar, data: msg.author.id},
                                {name: "channel", type: mssql.TYPES.VarChar, data: msg.channel.id},
                                {name: "data", type: mssql.TYPES.VarChar, data: url},
                                {name: "msg", type: mssql.TYPES.VarChar, data: msg.id}
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
})

client.on("messageDelete", msg => {
    console.log(msg)
    for (let attachment of msg.attachments) {
        safeQuery(`DELETE
                   FROM dbo.Banners
                   WHERE url = @url`, [{
            name: "url",
            type: mssql.TYPES.VarChar(200),
            data: attachment[1].url
        }])
    }
})

// Setup
async function setup() {
    try {
        await mssql.connect("Server=localhost,1433;Database=CrashBot;User Id=node_js;Password=rDmX#8rAXAFa&ppD;trustServerCertificate=true")
        // console.log(await safeQuery("SELECT * FROM dbo.Users"))
        //
        // let tracks = JSON.parse(fs.readFileSync(__dirname + "/tracks.json").toString())
        // let sql = "INSERT INTO dbo.PlaylistItems (playlist_id, player, source_id) VALUES "
        // sql = sql + tracks.map(track => {
        //     if (track.player === "ytdl") {
        //         return `(1, 0, '${track.id}')`
        //     }
        //     return `(1, 1, '${track.id}')`
        // }).join(", ")
        // await safeQuery(sql)

        if (false) {
            // Process pack blocks
            // let blocks = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/blocks.json").toString())
            let sound_defs = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/sounds/sound_definitions.json").toString()).sound_definitions
            let queries = []

            for (let item of Object.keys(sound_defs)) {
                await safeQuery("INSERT INTO CrashBot.dbo.PackSoundDefinitions (Name) VALUES (@name);", [
                    {name: "name", type: mssql.TYPES.VarChar, data: item}
                ])
                sound_defs[item].id = (await safeQuery("SELECT SoundDefID FROM CrashBot.dbo.PackSoundDefinitions WHERE Name = @name;", [
                    {name: "name", type: mssql.TYPES.VarChar, data: item}
                ])).recordset[0].SoundDefID

                for (let sound of sound_defs[item].sounds) {
                    if (typeof sound === "string") {
                        queries.push(`INSERT INTO CrashBot.dbo.PackSounds (SoundDefID)
                                      VALUES (${sound_defs[item].id})`)
                    } else {
                        // safeQuery("INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch) VALUES (@defid, @is3D, @vol, @pitch);", [
                        //     {name: "defid", type: mssql.TYPES.Int, data: sound_defs[item].id},
                        //     {name: "is3D", type: mssql.TYPES.Bit, data: sound.is3D || false},
                        //     {name: "vol", type: mssql.TYPES.Decimal, data: sound.volume || 1},
                        //     {name: "pitch", type: mssql.TYPES.Decimal, data: sound.pitch || 1},
                        //     {name: "weight", type: mssql.TYPES.Int, data: sound.weight || 1}
                        // ])
                        queries.push(`INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch)
                                      VALUES (${sound_defs[item].id}, ${sound.is3D ? 1 : 0}, ${sound.volume || 1},
                                              ${sound.pitch || 1})`)
                    }
                }
                console.log(sound_defs[item].id)
            }
            await safeQuery(queries.join(";") + ";")

            let sounds = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/sounds.json").toString())
            let _sounds
            _sounds = sounds.block_sounds
            for (let sound of Object.keys(_sounds)) {
                let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                await safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                    {name: "pitchlow", type: mssql.TYPES.Float, data: pitch_low},
                    {name: "pitchhigh", type: mssql.TYPES.Float, data: pitch_high},
                    {name: "vollow", type: mssql.TYPES.Float, data: vol_low},
                    {name: "volhigh", type: mssql.TYPES.Float, data: vol_high},
                    {name: "name", type: mssql.TYPES.VarChar, data: sound},
                    {name: "type", type: mssql.TYPES.VarChar, data: "block_sounds"},
                ])

                _sounds[sound].id = (await safeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                    name: "name",
                    type: mssql.TYPES.VarChar,
                    data: sound
                }])).recordset[0].SoundGroupID

                for (let event of Object.keys(_sounds[sound].events)) {
                    if (!_sounds[sound].events[event].sound) continue
                    if (!sound_defs[_sounds[sound].events[event].sound]) continue
                    console.log(_sounds[sound].events[event].sound)
                    safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                        {
                            name: "pitchlow",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "pitchhigh",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "vollow",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                        },
                        {
                            name: "volhigh",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                        },
                        {name: "id", type: mssql.TYPES.Int, data: _sounds[sound].id},
                        {name: "type", type: mssql.TYPES.VarChar, data: event},
                        {name: "defid", type: mssql.TYPES.Int, data: sound_defs[_sounds[sound].events[event].sound].id},
                    ])

                }
            }

            _sounds = sounds.entity_sounds.entities
            for (let sound of Object.keys(_sounds)) {
                let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                await safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                    {name: "pitchlow", type: mssql.TYPES.Float, data: pitch_low},
                    {name: "pitchhigh", type: mssql.TYPES.Float, data: pitch_high},
                    {name: "vollow", type: mssql.TYPES.Float, data: vol_low},
                    {name: "volhigh", type: mssql.TYPES.Float, data: vol_high},
                    {name: "name", type: mssql.TYPES.VarChar, data: sound},
                    {name: "type", type: mssql.TYPES.VarChar, data: "block_sounds"},
                ])

                _sounds[sound].id = (await safeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                    name: "name",
                    type: mssql.TYPES.VarChar,
                    data: sound
                }])).recordset[0].SoundGroupID

                for (let event of Object.keys(_sounds[sound].events)) {
                    if (!_sounds[sound].events[event].sound) continue
                    if (!sound_defs[_sounds[sound].events[event].sound]) continue
                    console.log(_sounds[sound].events[event].sound)
                    safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                        {
                            name: "pitchlow",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "pitchhigh",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "vollow",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                        },
                        {
                            name: "volhigh",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                        },
                        {name: "id", type: mssql.TYPES.Int, data: _sounds[sound].id},
                        {name: "type", type: mssql.TYPES.VarChar, data: event},
                        {name: "defid", type: mssql.TYPES.Int, data: sound_defs[_sounds[sound].events[event].sound].id},
                    ])

                }
            }

            _sounds = sounds.individual_event_sounds.events
            await safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (1, 1, 1, 1, 'indiv', 'individual_event_sounds');")

            let individual_id = (await safeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = 'indiv'")).recordset[0].SoundGroupID
            for (let event of Object.keys(_sounds)) {
                if (!_sounds[event].sound) continue
                if (!sound_defs[_sounds[event].sound]) continue
                console.log(_sounds[event].sound)
                safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                    {
                        name: "pitchlow",
                        type: mssql.TYPES.Float,
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].pitch[0] : (_sounds[event].pitch || 1)
                    },
                    {
                        name: "pitchhigh",
                        type: mssql.TYPES.Float,
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].pitch[1] : (_sounds[event].pitch || 1)
                    },
                    {
                        name: "vollow",
                        type: mssql.TYPES.Float,
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].volume[0] : (_sounds[event].volume || 1)
                    },
                    {
                        name: "volhigh",
                        type: mssql.TYPES.Float,
                        data: Array.isArray(_sounds[event].pitch) ? _sounds[event].volume[1] : (_sounds[event].volume || 1)
                    },
                    {name: "id", type: mssql.TYPES.Int, data: individual_id},
                    {name: "type", type: mssql.TYPES.VarChar, data: event},
                    {name: "defid", type: mssql.TYPES.Int, data: sound_defs[_sounds[event].sound].id},
                ])

            }

            _sounds = sounds.interactive_sounds.block_sounds
            for (let sound of Object.keys(_sounds)) {
                let _sounds = sounds.block_sounds
                let pitch_low = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                let pitch_high = Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                let vol_low = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                let vol_high = Array.isArray(_sounds[sound].volume) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                await safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                    {name: "pitchlow", type: mssql.TYPES.Float, data: pitch_low},
                    {name: "pitchhigh", type: mssql.TYPES.Float, data: pitch_high},
                    {name: "vollow", type: mssql.TYPES.Float, data: vol_low},
                    {name: "volhigh", type: mssql.TYPES.Float, data: vol_high},
                    {name: "name", type: mssql.TYPES.VarChar, data: sound},
                    {name: "type", type: mssql.TYPES.VarChar, data: "interactive_sounds.block_sounds"},
                ])

                _sounds[sound].id = (await safeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                    name: "name",
                    type: mssql.TYPES.VarChar,
                    data: sound
                }])).recordset[0].SoundGroupID

                for (let event of Object.keys(_sounds[sound].events)) {
                    if (!_sounds[sound].events[event].sound) continue
                    if (!sound_defs[_sounds[sound].events[event].sound]) continue
                    console.log(_sounds[sound].events[event].sound)
                    safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                        {
                            name: "pitchlow",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "pitchhigh",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                        },
                        {
                            name: "vollow",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                        },
                        {
                            name: "volhigh",
                            type: mssql.TYPES.Float,
                            data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                        },
                        {name: "id", type: mssql.TYPES.Int, data: _sounds[sound].id},
                        {name: "type", type: mssql.TYPES.VarChar, data: event},
                        {name: "defid", type: mssql.TYPES.Int, data: sound_defs[_sounds[sound].events[event].sound].id},
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
                    await safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (@pitchlow, @pitchhigh, @vollow, @volhigh, @name, @type);", [
                        {name: "pitchlow", type: mssql.TYPES.Float, data: pitch_low},
                        {name: "pitchhigh", type: mssql.TYPES.Float, data: pitch_high},
                        {name: "vollow", type: mssql.TYPES.Float, data: vol_low},
                        {name: "volhigh", type: mssql.TYPES.Float, data: vol_high},
                        {name: "name", type: mssql.TYPES.VarChar, data: sound},
                        {name: "type", type: mssql.TYPES.VarChar, data: "interactive_sounds.entity_sounds"},
                    ])

                    _sounds[sound].id = (await safeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = @name", [{
                        name: "name",
                        type: mssql.TYPES.VarChar,
                        data: sound
                    }])).recordset[0].SoundGroupID

                    if (!_sounds[sound].events) continue
                    for (let event of Object.keys(_sounds[sound].events)) {
                        if (!_sounds[sound].events[event].sound) continue
                        if (!sound_defs[_sounds[sound].events[event].sound]) continue
                        console.log(_sounds[sound].events[event].sound)
                        safeQuery("INSERT INTO CrashBot.dbo.PackSoundGroupEvents (SoundGroupID, EventType, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID) VALUES (@id, @type, @pitchhigh, @pitchlow, @volhigh, @vollow, @defid);", [
                            {
                                name: "pitchlow",
                                type: mssql.TYPES.Float,
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[0] : (_sounds[sound].pitch || 1)
                            },
                            {
                                name: "pitchhigh",
                                type: mssql.TYPES.Float,
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].pitch[1] : (_sounds[sound].pitch || 1)
                            },
                            {
                                name: "vollow",
                                type: mssql.TYPES.Float,
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[0] : (_sounds[sound].volume || 1)
                            },
                            {
                                name: "volhigh",
                                type: mssql.TYPES.Float,
                                data: Array.isArray(_sounds[sound].pitch) ? _sounds[sound].volume[1] : (_sounds[sound].volume || 1)
                            },
                            {name: "id", type: mssql.TYPES.Int, data: _sounds[sound].id},
                            {name: "type", type: mssql.TYPES.VarChar, data: event},
                            {
                                name: "defid",
                                type: mssql.TYPES.Int,
                                data: sound_defs[_sounds[sound].events[event].sound].id
                            },
                        ])

                    }
                }
            }
            // IMPORT TEXTURES
            let terrain_textures = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/textures/terrain_texture.json").toString()).texture_data
            for (let item of Object.keys(terrain_textures)) {
                await safeQuery("INSERT INTO CrashBot.dbo.PackTextureGroups (GameID, type) VALUES (@item, 'terrain_texture');", [
                    {name: "item", type: mssql.TYPES.VarChar, data: item}
                ])
                terrain_textures[item].id = (await safeQuery("SELECT TextureGroupID FROM dbo.PackTextureGroups WHERE GameID = @item AND type = 'terrain_texture'", [
                    {name: "item", type: mssql.TYPES.VarChar, data: item}
                ])).recordset[0].TextureGroupID
                if (!terrain_textures[item].textures) continue
                let sub_textures = Array.isArray(terrain_textures[item].textures) ? terrain_textures[item].textures : [terrain_textures[item].textures]
                for (let i = 0; i < sub_textures.length; i++) {
                    if (typeof sub_textures[i] === "string") {
                        safeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile) VALUES (@id, @pos, @deffile)", [
                            {name: "id", type: mssql.TYPES.Int, data: terrain_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int, data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar, data: sub_textures[i]}
                        ])
                    } else {
                        safeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile, OverlayColor) VALUES (@id, @pos, @deffile, @color)", [
                            {name: "id", type: mssql.TYPES.Int, data: terrain_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int, data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar, data: sub_textures[i].path},
                            {
                                name: "color",
                                type: mssql.TYPES.VarChar,
                                data: sub_textures[i].overlay_color ? sub_textures[i].overlay_color.replace("#", "") : null
                            }
                        ])
                    }
                }
            }

            let item_textures = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/textures/item_texture.json").toString()).texture_data
            for (let item of Object.keys(item_textures)) {
                await safeQuery("INSERT INTO CrashBot.dbo.PackTextureGroups (GameID, type) VALUES (@item, 'item_texture');", [
                    {name: "item", type: mssql.TYPES.VarChar, data: item}
                ])
                item_textures[item].id = (await safeQuery("SELECT TextureGroupID FROM dbo.PackTextureGroups WHERE GameID = @item AND type = 'item_texture'", [
                    {name: "item", type: mssql.TYPES.VarChar, data: item}
                ])).recordset[0].TextureGroupID

                safeQuery("INSERT INTO CrashBot.dbo.PackItems (PackID, TextureGroupID, GameID) VALUES (1, @id, @gameid);", [
                    {name: "id", type: mssql.TYPES.Int, data: item_textures[item].id},
                    {name: "gameid", type: mssql.TYPES.VarChar, data: item}
                ])

                if (!item_textures[item].textures) continue
                let sub_textures = Array.isArray(item_textures[item].textures) ? item_textures[item].textures : [item_textures[item].textures]
                for (let i = 0; i < sub_textures.length; i++) {
                    if (typeof sub_textures[i] === "string") {
                        safeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile) VALUES (@id, @pos, @deffile)", [
                            {name: "id", type: mssql.TYPES.Int, data: item_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int, data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar, data: sub_textures[i]}
                        ])
                    } else {
                        safeQuery("INSERT INTO CrashBot.dbo.PackTextures (TextureGroupID, Position, DefaultFile, OverlayColor) VALUES (@id, @pos, @deffile, @color)", [
                            {name: "id", type: mssql.TYPES.Int, data: item_textures[item].id},
                            {name: "pos", type: mssql.TYPES.Int, data: i},
                            {name: "deffile", type: mssql.TYPES.VarChar, data: sub_textures[i].path},
                            {
                                name: "color",
                                type: mssql.TYPES.VarChar,
                                data: sub_textures[i].overlay_color ? sub_textures[i].overlay_color.replace("#", "") : null
                            }
                        ])
                    }
                }
            }

            // IMPORT BLOCKS
            let blocks = JSON.parse(fs.readFileSync(__dirname + "/assets/pack/blocks.json").toString())
            for (let item of Object.keys(blocks)) {
                await safeQuery("INSERT INTO CrashBot.dbo.PackBlocks (PackID, GameID, SoundGroupID) VALUES (1, @name, @sound);", [
                    {name: "name", type: mssql.TYPES.VarChar, data: item},
                    {
                        name: "sound",
                        type: mssql.TYPES.Int,
                        data: blocks[item].sound ? sounds.block_sounds[blocks[item].sound].id : null
                    }
                ])
                blocks[item].id = (await safeQuery("SELECT BlockID FROM dbo.PackBlocks WHERE GameID = @name", [
                    {name: "name", type: mssql.TYPES.VarChar, data: item}
                ])).recordset[0].BlockID

                if (!blocks[item].textures) continue
                let block_textures = typeof blocks[item].textures === "string" ? {default: blocks[item].textures} : blocks[item].textures
                for (let texture of Object.keys(block_textures)) {
                    safeQuery('INSERT INTO CrashBot.dbo.PackBlockTextures (BlockID, TextureGroupID, Type) VALUES (@id, @textureid, @type);', [
                        {name: "id", type: mssql.TYPES.Int, data: blocks[item].id},
                        {name: "textureid", type: mssql.TYPES.Int, data: terrain_textures[block_textures[texture]].id},
                        {name: "type", type: mssql.TYPES.VarChar, data: texture}
                    ])
                }
            }

            // IMPORT ENTITIES
            let array_entities = fs.readdirSync(__dirname + "/assets/pack/entity").map(file => {
                console.log(file);
                return JSON.parse(fs.readFileSync(__dirname + "/assets/pack/entity/" + file).toString())
            })
            let entities = {}
            for (let entity of array_entities) {
                let identifier = entity["minecraft:client_entity"]["description"]["identifier"]
                entities[identifier] = entity
                await safeQuery("INSERT INTO CrashBot.dbo.PackEntities (PackID, identifier) VALUES (1, @name);", [
                    {name: "name", type: mssql.TYPES.VarChar, data: identifier}
                ])
                entities[identifier].id = (await safeQuery("SELECT EntityID FROM dbo.PackEntities WHERE identifier = @name", [
                    {name: "name", type: mssql.TYPES.VarChar, data: identifier}
                ])).recordset[0].EntityID

                if (!entity["minecraft:client_entity"]["description"].textures) continue
                let entity_textures = typeof entity["minecraft:client_entity"]["description"].textures === "string" ? {default: entity["minecraft:client_entity"]["description"].textures} : entity["minecraft:client_entity"]["description"].textures
                for (let texture of Object.keys(entity_textures)) {
                    await safeQuery("INSERT INTO CrashBot.dbo.PackTextures (Position, DefaultFile) VALUES (0, @deffile)", [
                        {name: "deffile", type: mssql.TYPES.VarChar, data: entity_textures[texture]}
                    ])

                    let id = (await safeQuery("SELECT TextureID FROM dbo.PackTextures WHERE DefaultFile = @deffile", [
                        {name: "deffile", type: mssql.TYPES.VarChar, data: entity_textures[texture]}
                    ])).recordset[0].TextureID

                    safeQuery('INSERT INTO CrashBot.dbo.PackEntityTextures (EntityID, TextureID, Type) VALUES (@entity, @texture, @type);', [
                        {name: "entity", type: mssql.TYPES.Int, data: entities[identifier].id},
                        {name: "texture", type: mssql.TYPES.Int, data: id},
                        {name: "type", type: mssql.TYPES.VarChar, data: texture}
                    ])
                }
            }

            // for (let item of fs.readdirSync(__dirname + "/assets/pack/assets/minecraft")) {
            //     console.log(item)
            //     await processItem(__dirname + "/assets/pack/assets/", __dirname + "/assets/pack/assets/minecraft", item)
            // }
            //
            // for (let item of fs.readdirSync(__dirname + "/assets/pack/assets/realms")) {
            //     console.log(item)
            //     await processItem(__dirname + "/assets/pack/assets/", __dirname + "/assets/pack/assets/realms", item)
            // }

            console.log("DONE!")
        } else {
            console.log("Logging into Discord...")
            client.login("ODkyNTM1ODY0MTkyODI3Mzky.GBe_2E.iFchqslODvFaIimIiD0itIz_INcU-U_YgSbMfc")
        }
    } catch (e) {
        console.log("Unable to connect to SQL server")
        console.error(e)
        process.exit(5)
    }
}

function download_discord_attachment_with_info(msg_id, channel_id, url, extension, archive) {
    return new Promise(async resolve => {
        let msg
        try {
            let msg = await (await client.channels.fetch(channel_id)).messages.fetch(msg_id)
        } catch (e) {
            resolve(download_discord_attachment(url, extension, archive))
            return
        }

        let file = await download_discord_attachment(url, extension)
        let font_big = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
        let font_small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
        Jimp.read(file)
            .then(async image => {
                // console.log(image.getWidth(), image.getHeight())
                let width = image.getWidth()
                let height = image.getHeight()

                if (width > height && width > 1080) {
                    height = (height / width) * 1080
                    width = 1080
                    image.resize(width, height)
                } else if (height > width && height > 1080) {
                    width = (width / height) * 1080
                    height = 1080
                    image.resize(width, height)
                }

                // Place black bar along bottom
                let color = Jimp.rgbaToInt(255, 255, 255, .75)
                new Jimp(width, height + 130, "#000", async (err, out) => {
                    out.composite(image, 0, 0)

                    try {
                        let author = await Jimp.read((msg.member || msg.author).avatarURL({format: "jpg"}))
                        author.resize(100, 100)
                        author.circle()
                        out.composite(author, 20, height + 20)
                    } catch (e) {
                    }

                    out.print(font_big, 140, height + 20, (msg.member ? msg.member.nickname : msg.author.username) || "Unknown")
                    out.print(font_small, 140, height + 80, "#" + msg.channel.name)
                    if (msg.content && msg.content.length < 100) out.print(font_small, 200, height + 20, {
                            text: msg.content,
                            alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT
                            // alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                        },
                        width - 220,
                        height)
                    out.getBufferAsync(Jimp.MIME_JPEG).then(buffer => {
                        let name = makeid(10) + ".jpg"
                        while (fs.existsSync(__dirname + "/memories/" + name)) {
                            name = makeid(10) + ".jpg"
                        }
                        archive.append(buffer, {name})
                        resolve()
                    })
                })
            })
            .catch(e => {
                console.error(e)
                resolve()
            })
    })
}

function download_discord_attachment(url, fileextension, archive = null) {
    return new Promise(resolve => {
        // Pick a filename
        let name = makeid(10) + "." + fileextension
        while (fs.existsSync(__dirname + "/memories/" + name)) {
            name = makeid(10) + "." + fileextension
        }
        let req = https.get(url.replace("http:", "https:"), (res) => {
            let data = []
            if (archive) archive.append(res, {name})
            res.on("data", (chunk) => {
                data.push(chunk)
            })
            res.on('close', () => {
                resolve(Buffer.concat(data))
            })
        })
    })
}

function download_ytdl(url, archive) {
    return new Promise(async resolve => {
        // Pick a filename
        let name = makeid(10) + ".mp4"
        while (fs.existsSync(__dirname + "/memories/" + name)) {
            name = makeid(10) + ".mp4"
        }
        try {
            await ytdl.getInfo(url, {filter: "audioandvideo"})
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
            console.error(e)
            resolve()
        }
    })
}

async function generateRandomCaptureMsg() {
    let capture = (await safeQuery("SELECT TOP 1 * from dbo.Memories ORDER BY NEWID()")).recordset[0]
    if (capture.type === 0) {
        let channel = await client.channels.fetch(capture.channel_id)
        if (capture.attachment_id) {
            return {
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
        } else {
            return {
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
        }
    }
}

setup()


// wss.on("connection", socket => {
//     console.log(socket)
// })