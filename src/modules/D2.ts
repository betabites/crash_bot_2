import {
    BaseModule,
    InteractionAutocompleteResponse,
    InteractionButtonResponse,
    InteractionChatCommandResponse,
    InteractionSelectMenuResponse,
    OnClientEvent
} from "./BaseModule.js";
import {
    ActionRowBuilder,
    AutocompleteInteraction, BaseMessageOptions,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    Client,
    Colors,
    EmbedBuilder, InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    SelectMenuInteraction,
    StringSelectMenuBuilder,
    TextChannel
} from "discord.js";
import {SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {
    buildActivityMessage,
    buildItemMessage,
    buildTinyItemEmbed,
    buildTinyVendorEmbed,
    buildVendorMessage,
    getNextWeekday,
    onlyVendorsThatSellStuff,
    Weekdays
} from "./D2/Bungie.NET.js";
import {surfaceFlatten} from "../utilities/surfaceFlatten.js";
import {groupItemsWithMatchingNames} from "../utilities/groupItemsWithMatchingNames.js";
import {
    BungieMembershipType,
    DestinyActivityDefinition,
    DestinyComponentType,
    DestinyInventoryItemDefinition, DestinyItemType,
    DestinyRecordComponent, DestinyVendorDefinition
} from "bungie-net-core/lib/models/index.js";
import {atSpecificTime, itemAvailableAtVendor} from "./D2/SetupNotifications.js";
import express from "express";
import * as console from "console";
import SafeQuery, {PutOperation, sql} from "../services/SQL.js";
import cookieParser from "cookie-parser"
import {getMembershipDataForCurrentUser} from "bungie-net-core/lib/endpoints/User/index.js";
import {BasicBungieClient} from "bungie-net-core/lib/client.js";
import fetch from "node-fetch";
import {getProfile} from "bungie-net-core/lib/endpoints/Destiny2/index.js";
import {AchievementProgress, GAME_IDS} from "./GameAchievements.js";
import mssql from "mssql";
import {destinyManifestDatabase, MANIFEST_SEARCH} from "./D2/DestinyManifestDatabase.js";
import {mobaltyicsToDIMLoadout} from "./D2/mobaltyicsToDIMLoadout.js";

const AUTO_RESPOND_CHANNELS = [
    "892518396166569994", // #bot-testing
    "935472869129990154", // #dungeon-main
    "1049104983586517092" // #raids-and-dungeon-chat
]

interface SqlLiteItem {
    id: number,
    json: string,
}

const AUTO_MESSAGE_RESPONSE_EXCLUDE_TYPES = [
    DestinyItemType.None,
    DestinyItemType.Currency,
    DestinyItemType.Dummy,
    DestinyItemType.Package,
    DestinyItemType.Emote,
    DestinyItemType.Mod
]
const MOBALYTICS_REGEX = /https:\/\/mobalytics\.gg\/destiny-2\/builds\/([^\/]+)\/[^\/]+\/([^\/]+)/g

export const D2_ROUTER = express.Router()

export class D2Module extends BaseModule {
    readonly liveScheduleChannelID = "1049104983586517092"
    readonly liveScheduleID = "1188381813048094732"
    readonly maxFireteamSize = 6
    primaryScheduleMessage: Message | null = null
    private _scheduleMessages: Message[] = []

    readonly commands = [
        (new SlashCommandBuilder())
            .setName("destiny2")
            .setDescription("Commands relating to Destiny 2")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("items")
                    .setDescription("Fetch information about items available in Destiny 2")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("name")
                            .setDescription("The name of the item you are looking for")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("vendors")
                    .setDescription("Fetch information about activities available in Destiny 2")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("name")
                            .setDescription("The name of the vendor you are looking for")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("activities")
                    .setDescription("Fetch information about activities available in Destiny 2")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("name")
                            .setDescription("The name of the activity you are looking for")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("login")
                    .setDescription("Login to Bungie.NET")
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("schedule")
                    .setDescription("Show the summary for the next raid vote")
            )
    ]

    get scheduleMessages() {
        if (this.primaryScheduleMessage) return [...this._scheduleMessages, this.primaryScheduleMessage]
        else return [...this._scheduleMessages]
    }

    constructor(client: Client) {
        super(client);
        setTimeout(async () => {
            await this.updateScheduleMessages()
            void syncD2Achievements()
        }, 10000)
        setInterval(async () => {
            await this.updateScheduleMessages()
            void syncD2Achievements()
        }, 120000)

        setInterval(async () => {
            // Every 10 minutes, remove old schedule messages
            for (let message of this._scheduleMessages) {
                if (message.createdTimestamp > (Date.now() - 600000)) {
                    // Message is less than 10 minutes old
                    continue
                }
                await message.suppressEmbeds(true)
                await message.edit(`This message has expired. Please either run \`/destiny2 schedule\` again or check the pins.`)
                this._scheduleMessages.splice(this._scheduleMessages.indexOf(message), 1)
            }
        }, 600000)
        this.client.channels.fetch(this.liveScheduleChannelID).then(channel => {
            if (channel instanceof TextChannel) channel.messages.fetch(this.liveScheduleID).then(message => {
                this.primaryScheduleMessage = message
            })
        })
    }

    async updateScheduleMessages() {
        let embed = await this.generateScheduleMessage()
        for (let message of this.scheduleMessages) {
            await message.edit(embed)
        }
    }

    @OnClientEvent("messageCreate")
    async messageAutoResponses(msg: Message) {
        let match
        while (match = MOBALYTICS_REGEX.exec(msg.content)) {
            try {
                console.log(match)
                let req = await fetch("https://mobalytics.gg/api-dst/v2/graphql/query", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        "operationName": "Destiny2BuildPageQuery",
                        "variables": {"id": match[2], "class": match[1]},
                        "query": "query Destiny2BuildPageQuery($id: ID!, $class: ID!) {\n  destiny {\n    page {\n      buildPage {\n        __typename\n        ... on DestinyBuildPage {\n          header\n          metadata {\n            ...PageMetaFragment\n            __typename\n          }\n          __typename\n        }\n      }\n      __typename\n    }\n    game {\n      builds(filter: {ids: [$id], classes: [$class], isArchived: true}) {\n        __typename\n        ... on DestinyBuildPagination {\n          __typename\n          builds {\n            name\n            screenshot\n            class {\n              __typename\n              ... on DestinyClass {\n                id\n                name\n                __typename\n              }\n            }\n            damageType {\n              __typename\n              ... on DestinyDamageType {\n                id\n                name\n                iconUrl\n                __typename\n              }\n            }\n            buildType {\n              __typename\n              ... on DestinyBuildType {\n                name\n                __typename\n              }\n            }\n            author {\n              __typename\n              ... on DestinyAuthor {\n                name\n                iconUrl\n                description\n                socialLinks {\n                  __typename\n                  ... on DestinyAuthorSocialLink {\n                    __typename\n                    link\n                    type {\n                      name\n                      id\n                      __typename\n                    }\n                  }\n                }\n                __typename\n              }\n            }\n            superItems {\n              __typename\n              ...BuildItemFragment\n            }\n            abilityItems {\n              __typename\n              ...BuildItemFragment\n            }\n            aspectItems {\n              __typename\n              ...BuildItemFragment\n            }\n            fragmentItems {\n              __typename\n              ...BuildItemFragment\n            }\n            headMods {\n              __typename\n              ...BuildItemFragment\n            }\n            armMods {\n              __typename\n              ...BuildItemFragment\n            }\n            chestMods {\n              __typename\n              ...BuildItemFragment\n            }\n            legsMods {\n              __typename\n              ...BuildItemFragment\n            }\n            classItems {\n              __typename\n              ...BuildItemFragment\n            }\n            artifactItems {\n              __typename\n              ...BuildItemFragment\n            }\n            statsPriority {\n              __typename\n              ... on DestinyPrioritizedStat {\n                priority\n                stat {\n                  __typename\n                  ... on DestinyStat {\n                    iconUrl\n                    __typename\n                  }\n                }\n                __typename\n              }\n            }\n            weapons {\n              __typename\n              ... on DestinyDescribedItem {\n                item {\n                  __typename\n                  ...ItemFragment\n                  ... on DestinyItem {\n                    itemTypeAndTierDisplayName\n                    __typename\n                  }\n                }\n                description\n                __typename\n              }\n            }\n            armor {\n              __typename\n              ...ItemFragment\n              ... on DestinyItem {\n                itemTypeAndTierDisplayName\n                __typename\n              }\n            }\n            armorDescription\n            howItWorksDescription\n            gameplayLoopDescription\n            video\n            __typename\n          }\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment PageMetaFragment on DestinySeoMetaData {\n  title\n  ogImage\n  description\n  keywords\n  __typename\n}\n\nfragment BuildItemFragment on DestinyItem {\n  __typename\n  id\n  name\n  iconUrl\n}\n\nfragment ItemFragment on DestinyItem {\n  __typename\n  id\n  name\n  iconUrl\n  iconWatermarkUrl\n  rarity {\n    __typename\n    ... on DestinyRarity {\n      id\n      name\n      __typename\n    }\n  }\n}\n"
                    })
                })
                let res = await req.json()
                console.log(res.data.destiny.game.builds.builds)
                let dimBuild = mobaltyicsToDIMLoadout(res.data.destiny.game.builds.builds[0])
                msg.reply({
                    content: "",
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`[Open this loadout in DIM (BETA)](https://app.destinyitemmanager.com/4611686018512362465/d2/loadouts?loadout=${
                                encodeURIComponent(JSON.stringify(dimBuild))
                            })`)
                    ]
                }).then(msg => msg.removeAttachments())
            } catch (e) {
                console.error(e)
            }
        }
        if (msg.content === "test") {
            msg.reply(JSON.stringify(mobaltyicsToDIMLoadout()))
            return
        }
        if (!AUTO_RESPOND_CHANNELS.includes(msg.channelId)) return

        console.log(msg.content)
        if (msg.author.bot) return
        else if (msg.content.startsWith("I wonder what") && msg.content.endsWith("is selling")) {
            const name = msg.content.replace("I wonder what", "").replace("is selling", "")
            MANIFEST_SEARCH.vendors.byName(name, 20)
                .then(vendors => onlyVendorsThatSellStuff(surfaceFlatten(vendors)))
                .then(items => {
                    return buildVendorMessage(name, items[0], items)
                })
                .then(message => {
                    // @ts-ignore
                    msg.reply(message)
                })
        }
        else if (msg.content.toLowerCase().includes("shut up")) {
             msg.reply("Never")
        }

        // Check if the message references any items and/or vendors

        let embeds: EmbedBuilder[] = []
        const items = await asyncDatabaseQueryWithJSONParse<DestinyInventoryItemDefinition>(`SELECT *,
                                                                                                    json_extract(json, "$.displayProperties.name") AS 'name',
                                                                                                    json_extract(json, "$.itemType")               AS 'type'
                                                                                             FROM "DestinyInventoryItemDefinition"
                                                                                             WHERE ? LIKE "%" || LOWER(name) || "%" AND name IS NOT ''
                                                               AND type NOT IN (${AUTO_MESSAGE_RESPONSE_EXCLUDE_TYPES.join(", ")})`,
            [msg.content.toLowerCase()]
        )
        // const vendors = await asyncDatabaseQueryWithJSONParse<VendorDefinition>(`SELECT *,
        //                                                               json_extract(json, "$.displayProperties.name") AS 'name'
        //                                                        FROM "DestinyVendorDefinition"
        //                                                        WHERE ? LIKE "%" || LOWER(name) || "%" AND name IS NOT ''`,
        //     [msg.content.toLowerCase()]
        // )
        const vendors: DestinyVendorDefinition[] = []

        for (let item of groupItemsWithMatchingNames(
            items,
            (i) => i.displayProperties.name || ""
        )) {
            if (!item[0]) continue
            embeds.push(buildTinyItemEmbed(item[0]))
        }

        for (let vendor of groupItemsWithMatchingNames(
            vendors,
            (i) => i.displayProperties.name || ""
        )) {
            if (!vendor[0]) continue
            embeds.push(buildTinyVendorEmbed(vendor[0]))
        }

        if (embeds.length !== 0) msg.reply({
            embeds
        })
    }

    @InteractionChatCommandResponse("destiny2")
    async onD2SlashCommand(interaction: ChatInputCommandInteraction) {
        let name = interaction.options.getString("name") || ""
        switch (interaction.options.getSubcommand()) {
            case "items":
                if (name.length < 3) {
                    interaction.reply({
                        content: "That search is a bit short. Please try something longer"
                    })
                    return
                }
                MANIFEST_SEARCH.items.byName(name)
                    .then(items => {
                        let flattened = surfaceFlatten(items)
                        return buildItemMessage(name, flattened[0], flattened)
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
                return
            case "vendors":
                if (name.length < 3) {
                    interaction.reply({
                        content: "That search is a bit short. Please try something longer"
                    })
                    return
                }
                interaction.deferReply()
                    .then(() => MANIFEST_SEARCH.vendors.byName(name))
                    .then(items => {
                        const flattened = surfaceFlatten(items)
                        return buildVendorMessage(name, flattened[0], flattened)
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
                return
            case "activities":
                if (name.length < 3) {
                    interaction.reply({
                        content: "That search is a bit short. Please try something longer"
                    })
                    return
                }
                MANIFEST_SEARCH.activities.byName(name)
                    .then(items => {
                        const flattened = surfaceFlatten(items)
                        return buildActivityMessage(name, flattened[0], flattened)
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
                return
            case "login":
                interaction.reply({
                    ephemeral: true,
                    content: "Use the button below to sign-in and link your Bungie.NET account!",
                    components: [
                        new ActionRowBuilder<MessageActionRowComponentBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setLabel("Login")
                                    .setStyle(ButtonStyle.Link)
                                    .setURL("https://crashbot.unholyandtwisted.com/destiny/login?discord_id=" + interaction.user.id)
                            )
                    ]
                })
                break
            case "schedule":
                interaction.reply(await this.generateScheduleMessage())
                    .then(msg => this._scheduleMessages.push(msg))
        }
    }

    async generateScheduleMessage(): Promise<BaseMessageOptions & { fetchReply: true }> {
        const raids: (DestinyActivityDefinition & { votes?: number })[] = await listRaids()
        const userVotes = await SafeQuery<{
            D2_ActivityVote: string,
            count: number
        }>(sql`SELECT D2_ActivityVote, COUNT(D2_ActivityVote) AS 'count'
               FROM dbo.Users
               WHERE D2_ActivityVote IS NOT NULL
               GROUP BY D2_ActivityVote
        `)
        const totalVotes = userVotes.recordset.reduce((count, dbResult) => count += dbResult.count, 0)
        for (let vote of userVotes.recordset) {
            let item = raids.find(raid => raid.hash.toString() === vote.D2_ActivityVote)
            if (!item) continue
            let index = raids.indexOf(item)
            raids[index].votes = vote.count
        }
        let sessions: {
            date: Date
            people: string[]
        }[] = []
        for (let item of getNextRaidSessions()) {
            console.log(item)
            let users = await SafeQuery<{
                discord_id: string
            }>("SELECT discord_id FROM dbo.userGameSessionsSchedule WHERE session_time = @date", [
                {name: "date", type: mssql.TYPES.DateTime2(), data: item}
            ])
            let usernames: string[] = []
            for (let user of users.recordset) {
                const discordUser = await this.client.users.fetch(user.discord_id)
                if (!discordUser) continue
                usernames.push(discordUser.username)
            }
            sessions.push({
                date: item,
                people: users.recordset.map(user => user.discord_id)
            })
        }


        return {
            embeds: [new EmbedBuilder()
                .setTitle("🗳️ Re-Flesh Raids Voting (BETA)")
                .setDescription("Use the buttons below to vote for the next raid")
                .addFields([
                    {
                        name: "Raid votes",
                        value: raids
                                .sort((a, b) => {
                                    return (a.votes || 0) > (b.votes || 0) ? -1 : 1
                                })
                                .slice(0, 3)
                                .map((raid, index) => {
                                    return (index + 1) + ". " + raid.originalDisplayProperties.name + " " + (raid.votes || 0) + "/" + totalVotes
                                })
                                .join("\n") +
                            "\n..."
                    }
                ]),
                new EmbedBuilder()
                    .setTitle("🛡️ Re-Flesh Raids Sessions (BETA)")
                    .setDescription("Below is a list of raiding sessions over the next 2 weeks. Use the buttons below to mark yourself as available for sessions of your choice.")
                    .addFields(sessions.map((session, index) => {
                        const atTime = session.date.getTime()
                        let displayText = ""
                        if (atTime - Date.now() < (12 * (60 * (60 * 1000)))) displayText = "<t:" + Math.floor(atTime / 1000) + ":R>"
                        else displayText = "<t:" + Math.floor(atTime / 1000) + ":F>"

                        return {
                            name: "Session " + (index + 1) + ":\n" + displayText,
                            value: session.people.length === 0 ? "*No current attendees*" : "<@" + session.people.join(">\n<@") + ">",
                            inline: true
                        }
                    }))
            ],
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setEmoji("🗳️")
                            .setLabel("Add/Change Vote")
                            .setCustomId("d2_raid_change_vote")
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setEmoji("🤝")
                            .setLabel("Make yourself available")
                            .setCustomId("d2_raid_make_available")
                            .setStyle(ButtonStyle.Secondary)
                    )
            ],
            fetchReply: true
        }
    }

    @InteractionButtonResponse("d2_raid_change_vote")
    async onD2RaidVoteChange(interaction: ButtonInteraction) {
        const raids = await listRaids()

        interaction.reply({
            ephemeral: true,
            content: "Please select a raid to vote for",
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId("d2_vote_select")
                            .addOptions(
                                raids
                                    .filter(raid => !!raid.originalDisplayProperties.name)
                                    .map(raid => {
                                        console.log({
                                            label: raid.originalDisplayProperties.name,
                                            value: raid.hash.toString()
                                        })
                                        return {label: raid.originalDisplayProperties.name, value: raid.hash.toString()}
                                    })
                            )
                    )
            ]
        })
    }

    @InteractionSelectMenuResponse("d2_vote_select")
    async onD2RaidVoteSelect(interaction: SelectMenuInteraction) {
        await SafeQuery(sql`UPDATE dbo.Users
                            SET D2_ActivityVote = ${interaction.values[0]}
                            WHERE discord_id = ${interaction.user.id}`)
        interaction.reply({content: "Thank you for voting!", ephemeral: true})
        await this.updateScheduleMessages()
    }

    @InteractionButtonResponse("d2_raid_make_available")
    async onMakeAvailableButtonClick(interaction: ButtonInteraction) {
        const signedUpSessions = (await SafeQuery<{
            session_time: Date,
            discord_id: string
        }>(sql`SELECT session_time, discord_id
               FROM dbo.UserGameSessionsSchedule`))
            .recordset
        const sessions = getNextRaidSessions()
            .map(session => {
                const existingSignups = signedUpSessions.filter(item => session.getTime() === item.session_time.getTime())
                const isSignedUp = !!signedUpSessions.find(item => session.getTime() === item.session_time.getTime() && interaction.user.id === item.discord_id)
                return {date: session, existingSignups, isSignedUp}
            })
            .map((session, index) => {
                const isFull = session.existingSignups.length >= this.maxFireteamSize && !session.isSignedUp
                return {
                    label: "Session " + (index + 1),
                    description: (isFull ? "FULL " : "") + session.date.toLocaleDateString() + " UTC",
                    value: session.date.getTime().toString(),
                    default: session.isSignedUp,
                }
            })

        if (sessions.length === 0) {
            interaction.reply({
                ephemeral: true,
                content: "Sorry but there are no sessions available at the moment. Please try again next week, or ask another player if you can take their space."
            })
            return
        }

        interaction.reply({
            ephemeral: true,
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setMaxValues(6)
                            .setMinValues(0)
                            .setCustomId("d2_raid_set_available")
                            .addOptions(
                                sessions
                            )
                    )
            ]
        })
    }

    @InteractionSelectMenuResponse("d2_raid_set_available")
    async onMakeAvailableSet(interaction: SelectMenuInteraction) {
        let dates = interaction.values.map(value => parseInt(value)).filter(value => !isNaN(value))
        await SafeQuery(sql`DELETE
                            FROM dbo.UserGameSessionsSchedule
                            WHERE discord_id = ${interaction.user.id}`)

        let fullSessions: Date[] = []
        let almostFullSessions: Date[] = []
        for (let date of dates) {
            // Check that the session is not already full
            const attendees = (await SafeQuery("SELECT discord_id FROM dbo.UserGameSessionsSchedule WHERE session_time = @date", [
                {name: "date", type: mssql.TYPES.DateTime2(), data: new Date(date)}
            ])).recordset
            if (attendees.length >= this.maxFireteamSize) {
                fullSessions.push(new Date(date))
                continue
            }
            else if (attendees.length === 4) {
                almostFullSessions.push(new Date(date))
            }

            await SafeQuery("INSERT INTO dbo.UserGameSessionsSchedule (session_time, game_id, discord_id) VALUES (@date, 0, @discordid)", [
                {name: "date", type: mssql.TYPES.DateTime2(), data: new Date(date)},
                {name: "discordid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
            ])
        }

        interaction.reply({
            content: "Awesome! We've recorded those dates",
            embeds: fullSessions.map(fullSession => new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription(`Couldn't add you to this session: <t:${Math.floor(fullSession.getTime() / 1000)}:F>. This session is full`)
            ),
            ephemeral: true
        })

        this.updateScheduleMessages()
    }

    @InteractionAutocompleteResponse("destiny2")
    async onAutocomplete(interaction: AutocompleteInteraction) {
        console.log("Attempting D2 autocomplete....")

        let name = interaction.options.getString("name") || ""
        let results: string[] = []

        switch (interaction.options.getSubcommand()) {
            case "items":
                let similarItems = await MANIFEST_SEARCH.items.byName(name, 20)
                results = Array.from(new Set(surfaceFlatten(similarItems).map(i => {
                    return i.displayProperties.name.substring(0, 100)
                }))).slice(0, 10)
                break
            case "vendors":
                let similarVendors = await (
                    name ? MANIFEST_SEARCH.vendors.byName(name, 20) : MANIFEST_SEARCH.vendors.all(20)
                )

                results = Array.from(new Set(surfaceFlatten(similarVendors).map(i => {
                    return i.displayProperties.name.substring(0, 100)
                }))).slice(0, 10)
                break
            case "activities":
                return
        }
        interaction.respond(results.map(i => ({name: i, value: i})))
    }

    @InteractionSelectMenuResponse("d2_item_search_adjust")
    onItemSearchAdjust(interaction: SelectMenuInteraction) {
        let value = JSON.parse(interaction.values[0])

        MANIFEST_SEARCH.items.byName(value[0])
            .then(items => {
                let selected_item = surfaceFlatten(items).find(i => i.hash === value[1])
                if (!selected_item) throw "Selected an invalid item"
                return buildItemMessage(value[0], selected_item, surfaceFlatten(items))
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

    @InteractionSelectMenuResponse("d2_activity_search_adjust")
    onActivitySelectAdjust(interaction: SelectMenuInteraction) {
        let value = JSON.parse(interaction.values[0])
        MANIFEST_SEARCH.activities.byName(value[0])
            .then(items => {
                console.log(value[1])
                const flattened = surfaceFlatten(items)
                let selected_item = flattened.find(i => i.hash === value[1])
                if (!selected_item) throw "Selected an invalid item"
                return buildActivityMessage(value[0], selected_item, flattened)
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

    @InteractionSelectMenuResponse("d2_vendor_search_adjust")
    onVendorSearchAdjust(interaction: SelectMenuInteraction) {
        let value = JSON.parse(interaction.values[0])
        interaction.deferUpdate()
            .then(() => {
                return MANIFEST_SEARCH.vendors.byName(value[0])
            })
            .then(items => {
                console.log(value[1])
                const flattened = surfaceFlatten(items)
                let selected_item = flattened.find(i => i.hash === value[1])
                if (!selected_item) throw "Selected an invalid item"
                return buildVendorMessage(value[0], selected_item, flattened)
            })
            .then(message => {
                // @ts-ignore
                interaction.editReply(message)
            })
            .catch(e => {
                console.error(e)
                interaction.editReply({
                    content: "oops! We couldn't find an item with that name."
                }).catch(e => {
                })
                interaction.reply({
                    content: "oops! We couldn't find an item with that name."
                }).catch(e => {
                })
            })
    }

    @InteractionSelectMenuResponse("d2_item_notification")
    onItemNotificationConfigure(interaction: SelectMenuInteraction) {
        let value = JSON.parse(interaction.values[0])
        interaction.deferReply({ephemeral: true})
            .then(() => {
                return itemAvailableAtVendor(interaction.user, value[1])
            })
            .then(() => {
                interaction.editReply({
                    content: "Awesome! We'll send you a DM when this item is next available!",
                })
            })
    }

    @InteractionSelectMenuResponse("d2_vendor_notification")
    onVendorNotificationConfigure(interaction: SelectMenuInteraction) {
        console.log(interaction.values)
        // let value = JSON.parse(interaction.values[0])
        interaction.deferReply({ephemeral: true})
            .then(() => {
                return atSpecificTime(interaction.user, new Date())
            })
            .then(() => {
                interaction.editReply({
                    content: "Awesome! We'll send you a DM when this vendor next resets!",
                })
            })
    }
}

function asyncDatabaseQuery<T = unknown>(sql: string, params: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
        destinyManifestDatabase.all<T>(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return
            }
            resolve(rows)
        })
    })
}

async function asyncDatabaseQueryWithJSONParse<T = unknown>(sql: string, params: any[]): Promise<T[]> {
    let results = await asyncDatabaseQuery<SqlLiteItem>(sql, params)
    return results.map(row => JSON.parse(row.json));
}

function getClient(access_token: string) {
    const client = new BasicBungieClient()
    client.setToken(access_token)
    return client
}

export async function syncD2Achievements(discord_id: string | null = null) {
    console.log("Syncing D2 achievements")
    const users = await SafeQuery<{
        id: number,
        discord_id: string,
        D2_AccessToken: string,
        D2_MembershipId: string,
        D2_MembershipType: BungieMembershipType
    }>(discord_id ?
        sql`SELECT id, discord_id, D2_AccessToken, D2_MembershipId, D2_MembershipType
            FROM dbo.Users
            WHERE D2_MembershipId IS NOT NULL
              AND discord_id = ${discord_id}` :
        sql`SELECT id, discord_id, D2_AccessToken, D2_MembershipId, D2_MembershipType
            FROM dbo.Users
            WHERE D2_MembershipId IS NOT NULL`
    )
    let operation = new PutOperation<Omit<AchievementProgress, "id">>("UserAchievements", ["discord_id", "game_id", "achievement_id"], "id")
    for (let user of users.recordset) {
        const client = getClient(user.D2_AccessToken)
        const currentUser = (await getMembershipDataForCurrentUser(client)).Response
        if (!currentUser.primaryMembershipId) continue
        const primaryMembership = currentUser.destinyMemberships.find(i => i.membershipId === currentUser.primaryMembershipId)
        if (!primaryMembership) continue
        let _data = {
            components: [DestinyComponentType.Records],
            destinyMembershipId: currentUser.primaryMembershipId,
            membershipType: primaryMembership.membershipType
        }
        console.log(_data)
        let profile = await getProfile(_data, client)
        if (profile.Response.profileRecords.data) {
            for (let recordHash of Object.keys(profile.Response.profileRecords.data.records)) {
                const recordHashNum = parseInt(recordHash)
                processD2RecordObject(recordHashNum, profile.Response.profileRecords.data.records[recordHashNum], user.discord_id, operation)
            }
        }
        if (profile.Response.characterRecords.data)
            for (let data of Object.values(profile.Response.characterRecords.data)) {
                for (let recordHash of Object.keys(data.records)) {
                    const recordHashNum = parseInt(recordHash)
                    processD2RecordObject(recordHashNum, data.records[recordHashNum], user.discord_id, operation)
                }
            }

        let query = await operation.buildQuery()
        if (query) await SafeQuery(query, [])
        operation.clear()
    }
    console.log("Finished syncing")
}

async function listRaids() {
    const raids = await asyncDatabaseQueryWithJSONParse<DestinyActivityDefinition>("SELECT * FROM DestinyActivityDefinition WHERE json_extract(json, '$.activityTypeHash') = 2043403989", [])
    const raidsGrouped = [...groupItemsWithMatchingNames(raids, (raid) => raid.originalDisplayProperties.name)]
    return raidsGrouped.map(group => group[0])
}

function processD2RecordObject(hash: number, record: DestinyRecordComponent, discord_id: string, operation: PutOperation<Omit<AchievementProgress, "id">>) {
    if (!record.objectives) {
        // console.log(`Skipping ${hash} (no objectives)`)
        // console.log(data.records[recordHashNum])
        return false
    }
    let progress = record.objectives.reduce((previousValue, currentValue) => {
        let progress = currentValue.progress
        if (!progress) progress = 0
        else if (progress > currentValue.completionValue) progress = currentValue.completionValue
        return previousValue + (progress / currentValue.completionValue)
    }, 0) / record.objectives.length
    operation.addRow({
        discord_id: discord_id,
        game_id: GAME_IDS.DESTINY2,
        progress: isNaN(progress) ? 0 : progress,
        achievement_id: hash.toString()
    })
}

D2_ROUTER.get("/login", async (req, res, next) => {
    try {
        const discord_id = req.query.discord_id as string
        const user = await SafeQuery(sql`SELECT discord_id
                                         FROM dbo.Users
                                         WHERE discord_id = ${discord_id}`)
        if (user.recordset.length === 0) throw new Error("User does not exist in DB")
        const redirect_params = new URLSearchParams()
        redirect_params.set("discord_id", discord_id)
        res.cookie("discord_id", discord_id)

        const params = new URLSearchParams()
        params.set("client_id", "44873")
        params.set("redirect_uri", "https://crashbot.unholyandtwisted.com/destiny/authorised?" + redirect_params.toString())
        params.set("response_type", "code")
        console.log(`https://www.bungie.net/en/OAuth/Authorize?${params.toString()}`)
        res.redirect(`https://www.bungie.net/en/OAuth/Authorize?${params.toString()}`)
    } catch (e) {
        next(e)
    }
})

D2_ROUTER.get("/authorised", cookieParser(), async (req, res, next) => {
    try {
        console.log(req.cookies)
        const discord_id = req.cookies["discord_id"]

        const token_url = "https://www.bungie.net/platform/app/oauth/token/"
        const code = req.query.code as string
        const params = new URLSearchParams()
        params.set("grant_type", "authorization_code")
        params.set("code", code)
        params.set("redirect_uri", `https://crashbot.unholyandtwisted.com${req.baseUrl}${req.url.split("?")[0]}`)
        // params.set("client_id", "44873")
        params.set("client_id", "44873")
        params.set("client_secret", process.env.BUNGIE_CLIENT_SECRET ?? "")
        console.log(token_url, `https://crashbot.unholyandtwisted.com${req.baseUrl}${req.url.split("?")[0]}`)
        const response = await fetch(token_url, {
            method: "post",
            headers: {
                // "Accept": "application/json",
                'Content-Type': 'application/x-www-form-urlencoded',
                // "Authorization": "Basic " + Buffer.from("44873:" + process.env.BUNGIE_CLIENT_SECRET).toString("base64")
            },
            body: params
        })
        const data = await response.text()
        if (!data) throw new Error("No data returned")
        console.log(data)
        let typedData: { access_token: string, refresh_token: string } = JSON.parse(data)
        if (!typedData.access_token || !typedData.refresh_token) throw new Error("Failed to validate")
        const access_token = typedData.access_token
        const refresh_token = typedData.refresh_token

        const client = getClient(typedData.access_token)
        const d2User = await getMembershipDataForCurrentUser(client)
        console.log(d2User)

        if (!d2User.Response.primaryMembershipId) throw new Error("Bungie account does not have a primary membership ID")
        await SafeQuery(sql`UPDATE dbo.Users
                            SET D2_AccessToken=${access_token},
                                D2_RefreshToken=${refresh_token},
                                D2_MembershipId=${d2User.Response.primaryMembershipId}
                            WHERE discord_id = ${discord_id}`)
        // Save access_token and refresh_token for future use
        console.log(access_token, refresh_token)
        res.send("Thank you for connecting your Bungie.NET account! You can now use Crash Bot to view better stats from Destiny 2. Stats may take a minute or two to fully appear while we sync your data.")

        syncD2Achievements(discord_id)
    } catch (e) {
        next(e)
    }
})


function getNextRaidSessions() {
    const defaultTime = [7, 0, 0, 0]
    const now = new Date()
    now.setHours(defaultTime[0])
    now.setMinutes(defaultTime[1])
    now.setSeconds(defaultTime[2])
    now.setMilliseconds(defaultTime[3])

    const next_week = new Date(now)
    next_week.setDate(next_week.getDate() + 7)

    return [
        getNextWeekday(now, Weekdays.FRIDAY),
        getNextWeekday(now, Weekdays.SATURDAY),
        getNextWeekday(now, Weekdays.SUNDAY),
        getNextWeekday(next_week, Weekdays.FRIDAY),
        getNextWeekday(next_week, Weekdays.SATURDAY),
        getNextWeekday(next_week, Weekdays.SUNDAY),
    ].sort((a, b) => {
        return a > b ? 1 : -1
    })
}
