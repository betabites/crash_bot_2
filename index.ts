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
    let array_entities;

    setInterval(() => {
        sendNotifications()
    }, 10000)

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
            await SafeQuery(queries.join(";") + ";", [])

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
            await SafeQuery("INSERT INTO CrashBot.dbo.PackSoundGroups (pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type) VALUES (1, 1, 1, 1, 'indiv', 'individual_event_sounds');", [])

            let individual_id = (await SafeQuery("SELECT SoundGroupID FROM dbo.PackSoundGroups WHERE PackSoundGroups.GroupName = 'indiv'", [])).recordset[0].SoundGroupID
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
            client.login(getToken())
        }
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


