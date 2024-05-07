// Copyright 2022 - Jack Hawinkels - All Rights Reserved
// import {EndBehaviorType} from "@discordjs/voice";

import express from "express"
import fileUpload, {UploadedFile} from "express-fileupload"
import fs from "fs"
import * as path from "path";
import {client, getToken,} from "./src/services/Discord.js";
import openai from "./src/services/ChatGPT.js";
import SafeQuery, {sql} from "./src/services/SQL.js";
import {buildPack, dirTree, FindOwnership, searchIndex} from "./src/misc/ResourcePackManager.js";
import {CrashBotUser} from "./src/misc/UserManager.js";
import Discord, {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    Guild,
    GuildMember,
    MessageActionRowComponentBuilder,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import {fetchThrowTemplates, generateThrow} from "./src/misc/ThrowMaker.js";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import {makeid} from "./src/misc/Common.js";
import WSS from "./src/misc/WSS.js";
import {VoiceConnectionManager} from "./src/services/VoiceManager/VoiceManager.js";
import http from "http";
import https from "https";
import mssql from "mssql";
import randomWords from "random-words";
import bad_baby_words from "./badwords.json" assert {type: "json"}
import {setupBungieAPI,} from "./src/modules/D2/Bungie.NET.js";
import {BaseModule} from "./src/modules/BaseModule.js";
import {D2_ROUTER, D2Module} from "./src/modules/D2.js";
import {RoleplayModule} from "./src/modules/RoleplayModule.js";
import {GPTModule} from "./src/modules/GPT.js";
import {getUserData} from "./src/utilities/getUserData.js";
import {ResourcePackManagerModule} from "./src/modules/ResourcePackManagerModule.js";
import {ImagesModule} from "./src/modules/ImagesModule.js";
import {ExperimentsModule} from "./src/modules/ExperimentsModule.js";
import {MinecraftModule} from "./src/modules/Minecraft/MinecraftModule.js";
import {MiscModule} from "./src/modules/MiscModule.js";
import {VOICE_ROUTER, VoiceControlModule} from "./src/modules/VoiceControlModule.js";
import {quoteReply} from "./src/utilities/quoteReply.js";
import {sendNotifications} from "./src/modules/D2/SetupNotifications.js";
import dotenv from "dotenv"
import {ACHIEVEMENTS_ROUTER} from "./src/modules/GameAchievements.js";
import {MEMORIES_ROUTER} from "./src/modules/Memories.js";
import {PACK_ROUTER} from "./src/routes/packs.js";
import {DISCORD_AUTH_ROUTER} from "./src/routes/discordAuth.js";
import {SpeechModule} from "./src/modules/Speech.js";
import {PointsModule} from "./src/modules/Points.js";
import {InteractionTracker} from "./src/modules/UsageTrackingModule.js";

const moduleClasses = [
    D2Module,
    ExperimentsModule,
    GPTModule,
    ImagesModule,
    RoleplayModule,
    MinecraftModule,
    MiscModule,
    ResourcePackManagerModule,
    VoiceControlModule,
    SpeechModule,
    PointsModule
]

dotenv.config()

let modules: BaseModule[] = []
let pack_updated

// Parse memes and convert any items with the .url attribute
setInterval(async () => {
    let res = await SafeQuery("SELECT * FROM dbo.Webhook WHERE timeout < GETDATE()", [])
    for (let _webhook of res.recordset) {
        let webhook = new Discord.WebhookClient({id: _webhook.webhook_id, token: _webhook.token})
        webhook.delete()
    }
    await SafeQuery("DELETE FROM dbo.Webhook WHERE timeout < GETDATE()", [])
}, 60000)

let app = express()
let httpServer = http.createServer(app).listen(8051)
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

app.use(express.static("web"))

app.get("/home/:key", async (req, res) => {
    let html
    if (await CrashBotUser.CheckKey(req.params.key)) {
        let user = new CrashBotUser(req.params.key)
        await user.get()
        html = fs.readFileSync(
            path.resolve("./") + "/assets/html/index.html"
        ).toString()
    }
    else {
        html = "Invalid key"
    }
    // console.log(html)
    res.send(html)
})

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
                            new AttachmentBuilder(_meme.file as string)
                        ],
                        components: [
                            new ActionRowBuilder<MessageActionRowComponentBuilder>()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId("verify_throw_" + meme.location)
                                        .setStyle(ButtonStyle.Primary)
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

app.post("/vote/:id", (req, res) => {

})

app.use("/packs", PACK_ROUTER)
app.use("/destiny", D2_ROUTER)
app.use("/achievements", ACHIEVEMENTS_ROUTER)
app.use("/memories", MEMORIES_ROUTER)
app.use("/discord/auth", DISCORD_AUTH_ROUTER)
app.use("/voice", VOICE_ROUTER)

let wss = new WSS(httpServer, httpsServer)

client.on("ready", async () => {
    if (!client.application) throw new Error("Client does not have an associated application object. This is required.")
    const COMMANDS_TO_DELETE = await client.application.commands.fetch()

    // BIND MODULES
    for (let item of moduleClasses) {
        let module = new item(client)
        for (let command of module.createCommands()) {
            // Remove commands from the map that are still valid (ie defined in the code)
            let key = COMMANDS_TO_DELETE.find((existingCommand) => {
                return existingCommand.name === command
            })?.id

            // DOES NOT ACTUALLY DELETE THE COMMAND. ONLY REMOVES IT FROM THE MAP
            if (key) COMMANDS_TO_DELETE.delete(key)
        }
        modules.push(module)
    }

    // Delete commands that are no-longer defined in the code
    for (let item of COMMANDS_TO_DELETE.values()) item.delete()


    // Setup slash commands
    const guilds = ["892518158727008297", "830587774620139580"]
    const processGuild = (guild: Guild) => {
        guild.commands.fetch()
            .then(commands => {
                for (let command of commands) command[1].delete()
            })
    }
    for (let id of guilds) {
        client.guilds.fetch(id).then(processGuild)
    }
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
    interaction.type
    const tracker = await InteractionTracker.create(interaction)

    if (interaction.isChatInputCommand()) {
        interaction
        // Process module slash commands
        for (let module of modules) {
            for (let command of module.subscribedSlashCommands.filter(i => i[0] === interaction.commandName)) {
                tracker.newHandler(
                    command[1].name,
                    () => command[1].call(module, interaction)
                )
            }
        }
    }
    else if (interaction.isButton()) {
        for (let module of modules) {
            for (let command of module
                .subscribedButtonInteractions
                .filter(i => {
                    switch (typeof i[0]) {
                        case "function":
                            return i[0](interaction.customId)
                        case "string":
                            return i[0] === interaction.customId
                    }
                })) {
                tracker.newHandler(
                    command[1].name,
                    () => command[1](interaction)
                )
            }
        }
    }
    else if (interaction.isSelectMenu()) {
        for (let module of modules) {
            for (let command of module
                .subscribedSelectMenuInteractions
                .filter(i => {
                    switch (typeof i[0]) {
                        case "function":
                            return i[0](interaction.customId)
                        case "string":
                            return i[0] === interaction.customId
                    }
                })) {
                tracker.newHandler(
                    command[1].name,
                    () => command[1].call(module, interaction)
                )
            }
        }
    }
    else if (interaction.isAutocomplete()) {
        console.log("Registered autocomplete")
        for (let module of modules) {
            for (let command of module
                .subscribedAutocompleteInteractions
                .filter(i => {
                    switch (typeof i[0]) {
                        case "function":
                            return i[0](interaction.commandName)
                        case "string":
                            return i[0] === interaction.commandName
                    }
                })) {
                tracker.newHandler(
                    command[1].name,
                    () => command[1].call(module, interaction)
                )
            }
        }
    }
})

process.on("unhandledRejection", (e) => {
    console.error(e)
})

client.on("messageDelete", msg => {
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


// Setup
async function setup() {
    setInterval(() => {
        sendNotifications()
    }, 10000)


    try {
        console.log("Logging into Discord...")
        client.login(getToken())
    } catch (e) {
        console.log("Unable to connect to SQL server")
        console.error(e)
        process.exit(5)
    }
}

//
// setTimeout(() => {
//     rot_potato()
// }, 30000)

setup()


