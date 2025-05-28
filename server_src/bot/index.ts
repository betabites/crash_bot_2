// Copyright 2022 - Jack Hawinkels - All Rights Reserved
// import {EndBehaviorType} from "@discordjs/voice";

import {client, getToken,} from "../services/Discord.js";
import SafeQuery from "../services/SQL.js";
import {ButtonStyle, ChannelType, Guild, WebhookClient} from "discord.js";
import mssql from "mssql";
import {BaseModule} from "./modules/BaseModule.js";
import {D2Module} from "./modules/D2.js";
import {GPTModule} from "./modules/GPT.js";
import {ResourcePackManagerModule} from "./modules/ResourcePackManagerModule.js";
import {ImagesModule} from "./modules/ImagesModule.js";
import {ExperimentsModule} from "./modules/ExperimentsModule.js";
import {MiscModule} from "./modules/MiscModule.js";
// import {VoiceControlModule} from "./modules/VoiceControlModule.js";
import {sendNotifications} from "./modules/D2/SetupNotifications.js";
import dotenv from "dotenv"
import {SpeechModule} from "./modules/Speech.js";
import {PointsModule} from "./modules/points/Points.js";
import {InteractionTracker} from "./modules/UsageTrackingModule.js";
import {EventsModule} from "./modules/events.js";
import {
    AmongUsEventSessionHandler,
    BoplBattleCompanyEventSessionHandler,
    BorderlandsEventSessionHandler,
    ChillEventSessionHandler,
    EscapistsEventSessionHandler,
    GModEventSessionHandler,
    LethalCompanyEventSessionHandler,
    MinecraftEventSessionHandler,
    MovieTVShowEventSessionHandler,
    NorthgardEventSessionHandler,
    OhDeerEventSessionHandler,
    OtherEventSessionHandler,
    PhasmophobiaEventSessionHandler,
    ProjectPlaytimeEventSessionHandler,
    SpaceEngineersEventSessionHandler,
    TerrariaEventSessionHandler,
    WarframeEventSessionHandler,
    WhosYourDaddyEventSessionHandler
} from "./modules/events/eventSessionHandlers.js";
import {QuotesModule} from "./modules/Quotes.js";
import {Pterodactyl} from "./modules/Pterodactyl.js";
import {LethalCompanyModule} from "./modules/LethalCompanyModule.js";
import {BotemonModule} from "./botemon/BotemonModule.js";
import {Valheim} from "./modules/Valheim.js";
// import {MusicPlayerModule} from "./newVoice/modules/MusicPlayerModule.js";

console.log(`Node.js version: ${process.version}`);

const eventSessionHandlers = [
    OtherEventSessionHandler,
    ChillEventSessionHandler,
    MovieTVShowEventSessionHandler,
    AmongUsEventSessionHandler,
    SpaceEngineersEventSessionHandler,
    LethalCompanyEventSessionHandler,
    BoplBattleCompanyEventSessionHandler,
    MinecraftEventSessionHandler,
    PhasmophobiaEventSessionHandler,
    BorderlandsEventSessionHandler,
    EscapistsEventSessionHandler,
    GModEventSessionHandler,
    NorthgardEventSessionHandler,
    OhDeerEventSessionHandler,
    ProjectPlaytimeEventSessionHandler,
    TerrariaEventSessionHandler,
    WarframeEventSessionHandler,
    WhosYourDaddyEventSessionHandler
]

const moduleClasses = [
    D2Module,
    ExperimentsModule,
    GPTModule,
    ImagesModule,
    // MinecraftModule,
    MiscModule,
    ResourcePackManagerModule,
    // VoiceControlModule,
    SpeechModule,
    PointsModule,
    EventsModule,
    QuotesModule,
    Pterodactyl,
    LethalCompanyModule,
    BotemonModule,
    Valheim,
    //MusicPlayerModule,
    ...eventSessionHandlers
]

dotenv.config()

let modules: BaseModule[] = []
let pack_updated

// Parse memes and convert any items with the .url attribute
setInterval(async () => {
    let res = await SafeQuery("SELECT * FROM dbo.Webhook WHERE timeout < GETDATE()", [])
    for (let _webhook of res.recordset) {
        let webhook = new WebhookClient({id: _webhook.webhook_id, token: _webhook.token})
        webhook.delete()
    }
    await SafeQuery("DELETE FROM dbo.Webhook WHERE timeout < GETDATE()", [])
}, 60000)
let wss: any = {}

client.on("ready", async () => {
    console.log("Discord client ready")
    if (!client.application) throw new Error("Client does not have an associated application object. This is required.")
    let COMMANDS_TO_DELETE = await client.application.commands.fetch()

    // BIND GLOBAL SLASH COMMAND MODULES
    console.log("Building slash commands")
    for (let item of moduleClasses) modules.push(new item(client))

    for (let module of modules) {
        for (let command of module.createCommands()) {
            // Remove commands from the map that are still valid (ie defined in the code)
            let key = COMMANDS_TO_DELETE.find((existingCommand) => {
                return existingCommand.name === command
            })?.id

            // DOES NOT ACTUALLY DELETE THE COMMAND. ONLY REMOVES IT FROM THE MAP
            if (key) COMMANDS_TO_DELETE.delete(key)
        }
    }

    // BIND GLOBAL CONTEXT MENU COMMANDS
    console.log("Building context menu commands")
    for (let module of modules) {
        for (let command of module.createContextMenuCommands()) {
            // Remove commands from the map that are still valid (ie defined in the code)
            let key = COMMANDS_TO_DELETE.find((existingCommand) => {
                return existingCommand.name === command
            })?.id

            // DOES NOT ACTUALLY DELETE THE COMMAND. ONLY REMOVES IT FROM THE MAP
            if (key) COMMANDS_TO_DELETE.delete(key)
        }
    }

    // Delete commands that are no-longer defined in the code
    await client.application.commands.create({
        "name": "launch",
        // PRIMARY_ENTRY_POINT is type 4
        "type": 4,
        // DISCORD_LAUNCH_ACTIVITY is handler value 2
        "handler": 2,
        // integration_types and contexts define where your command can be used (see below)
        "integration_types": [0, 1],
        "contexts": [0, 1, 2]
    })
    console.log("Created entrypoint!")
    for (let item of COMMANDS_TO_DELETE.values()) {
        if (item.name !== "launch")
        item.delete()
    }
    console.log("Command building/updating complete")



    // Setup guild commands
    const guilds = ["892518158727008297"]
    const processGuild = async (guild: Guild) => {
        const COMMANDS_TO_DELETE = await guild.commands.fetch()

        // // BIND GLOBAL MODULES
        // for (let item of moduleClasses) {
        //     let module = new item(client)
        //     for (let command of module.createGuildCommands(guild)) {
        //         // Remove commands from the map that are still valid (ie defined in the code)
        //         let key = COMMANDS_TO_DELETE.find((existingCommand) => {
        //             return existingCommand.name === command
        //         })?.id
        //
        //         // DOES NOT ACTUALLY DELETE THE COMMAND. ONLY REMOVES IT FROM THE MAP
        //         if (key) COMMANDS_TO_DELETE.delete(key)
        //     }
        //     modules.push(module)
        // }
        //
        // // Delete commands that are no-longer defined in the code
        // for (let item of COMMANDS_TO_DELETE.values()) item.delete()
        //
        // guild.commands.fetch()
        //     .then(commands => {
        //         for (let command of commands) command[1].delete()
        //     })
    }
    for (let id of guilds) {
        client.guilds.fetch(id).then(processGuild)
    }
    // void (await client.channels.fetch("892518365766242375") as TextChannel).send("Now is the time to join Crash Bot! __*combine*__ with us and yee shall see!")
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
                    () => command[1].call(module, interaction),
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
    else if (interaction.isContextMenuCommand()) {
        console.log("Registered context menu command: ", interaction.commandName)
        for (let module of modules) {
            for (let command of module
                .subscribedContextMenuCommands
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


// Setup
export async function setup() {
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


