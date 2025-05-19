import {
    InteractionAutocompleteResponse,
    InteractionButtonResponse,
    InteractionChatCommandResponse,
    InteractionSelectMenuResponse,
    OnClientEvent
} from "./BaseModule.js";
import {
    ActionRowBuilder,
    AutocompleteInteraction,
    BaseMessageOptions,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    EmbedBuilder,
    Message,
    MessageActionRowComponentBuilder,
    SelectMenuInteraction,
    StringSelectMenuBuilder,
    TextChannel,
} from "discord.js";
import {SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {
    buildActivityMessage,
    buildItemMessage,
    buildTinyItemEmbed,
    buildTinyVendorEmbed,
    buildVendorMessage,
    getNextWeekday,
    getWeeklyMilestonesMessage,
    onlyVendorsThatSellStuff
} from "./D2/Bungie.NET.js";
import {surfaceFlatten} from "../utilities/surfaceFlatten.js";
import {groupItemsWithMatchingNames} from "../utilities/groupItemsWithMatchingNames.js";
import {
    type BungieMembershipType,
    type DestinyActivityDefinition,
    type DestinyInventoryItemDefinition,
    type DestinyRecordComponent,
    type DestinyVendorDefinition,
} from "bungie-net-core/models";
import {atSpecificTime, itemAvailableAtVendor} from "./D2/SetupNotifications.js";
import express from "express";
import * as console from "console";
import SafeQuery, {PutOperation, sql} from "../services/SQL.js";
import cookieParser from "cookie-parser"
import {getMembershipDataForCurrentUser} from "bungie-net-core/endpoints/User";
import fetch from "node-fetch";
import {AchievementProgress, EVENT_IDS} from "./GameAchievements.js";
import {destinyManifestDatabase, MANIFEST_SEARCH} from "./D2/DestinyManifestDatabase.js";
import {DESTINY_BUILD_SCHEMA, mobaltyicsToDIMLoadout} from "./D2/mobaltyicsToDIMLoadout.js";
import {WeekdayNames, Weekdays} from "./D2/Weekdays.js";
import {GameSessionData} from "./GameSessionModule.js";
import {BungieClient} from "./D2/BungieNETConnectionProfile.js";
import {getProfile} from "bungie-net-core/endpoints/Destiny2";
import {BasicEventSessionHandler} from "./events/BasicEventSessionHandler.js";
import {refreshAuthorization} from "bungie-net-core/auth";
import {client} from "../services/Discord.js";

const AUTO_RESPOND_CHANNELS = [
    "892518396166569994", // #bot-testing
    "935472869129990154", // #dungeon-main
    "1049104983586517092" // #raids-and-dungeon-chat
]
const SESSION_THREAD_PARENT_ID = "1273524114614911067"

interface SqlLiteItem {
    id: number,
    json: string,
}

const AUTO_MESSAGE_RESPONSE_EXCLUDE_TYPES = [
    0,
    1,
    20,
    25,
    23,
    19
]
const MOBALYTICS_REGEX = /https:\/\/mobalytics\.gg\/destiny-2\/builds\/([^\/]+)\/[^\/]+\/([^\/]+)/g

export const D2_ROUTER = express.Router()

/**
 * Represents a module for handling Destiny 2 related commands and functionality.
 */
export class D2Module extends BasicEventSessionHandler {
    readonly liveScheduleChannelID = "1049104983586517092"
    readonly liveScheduleID = "1188381813048094732"
    readonly maxFireteamSize = 6
    primaryScheduleMessage: Message | null = null
    private _scheduleMessages: Message[] = []

    embedConfig = {
        title: "Destiny 2 Event",
        thumbnail: "https://i1.wp.com/i2-prod.dailystar.co.uk/incoming/article21380006.ece/ALTERNATES/s1200c/0_Destiny-2.jpg"
    }

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
                            .setRequired(false)
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
        super(client, 0);
        setTimeout(async () => {
            await this.updateScheduleMessages()
            void syncD2Achievements()
        }, 10000)
        setInterval(async () => {
            await this.updateScheduleMessages()
            await refreshAccessTokens()
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
        void refreshAccessTokens()
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
                let build = DESTINY_BUILD_SCHEMA.parse(res.data.destiny.game.builds.builds[0])
                let dimBuild = await mobaltyicsToDIMLoadout(build)
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
        // if (msg.content === "test") {
        //     msg.reply(JSON.stringify(mobaltyicsToDIMLoadout()))
        //     return
        // }
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
                if (!name) {
                    interaction.reply({
                        content: '',
                        embeds: [await getWeeklyMilestonesMessage()]
                    })
                    return
                }

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
                interaction.reply({
                    ...await this.generateScheduleMessage(),
                    ephemeral: true
                })
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
        for (let item of getNextRaidSessionTimes()) {
            let session = await this.getGameSession(item)
            let users = session ? await this.getUsersSubscribedToSession(session.id) : []
            let usernames: string[] = []
            for (let user of users) {
                const discordUser = await this.client.users.fetch(user)
                if (!discordUser) continue
                usernames.push(discordUser.username)
            }
            sessions.push({
                date: item,
                people: users
            })
        }


        return {
            embeds: [
                new EmbedBuilder()
                    .setTitle("🛡️ Re-Flesh Raids Sessions")
                    .setDescription("Raids typically start at about 7PM NZ time")
                    // .setDescription("Below is a list of raiding sessions over the next 2 weeks. Use the buttons below to mark yourself as available for sessions of your choice.")
                    .addFields(sessions.map((session, index) => {
                        const atTime = session.date.getTime()
                        let displayText = ""
                        displayText =
                            "<t:" + Math.floor(atTime / 1000) + ":d>"

                        return {
                            name: WeekdayNames[session.date.getDay()],
                            value: `${displayText} (${session.people.length}/6)`,
                            inline: true
                        }
                    }))
                    .setFooter({text: `Weekly raid: Deep Stone Crypt`})
            ],
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                    .addComponents(
                        // new ButtonBuilder()
                        //     .setEmoji("🗳️")
                        //     .setLabel("Add/Change Vote")
                        //     .setCustomId("d2_raid_change_vote")
                        //     .setStyle(ButtonStyle.Secondary),
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
        const sessions = await this.getAllGameSessions();
        let sessionsMapped: { users: string[], isSignedUp: boolean, session: GameSessionData }[] = []
        for (let session of sessions) {
            console.log(session)
            let users = await this.getUsersSubscribedToSession(session.id)
            const isSignedUp = !!users.find(user => user === interaction.user.id)
            sessionsMapped.push({users, isSignedUp, session})
        }

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
                                sessionsMapped.map((session, index) => {
                                    const isFull = session.users.length >= this.maxFireteamSize && !session.isSignedUp
                                    return {
                                        label: "Session " + (index + 1),
                                        description: (isFull ? "FULL " : "") + session.session.start.toLocaleDateString() + " UTC",
                                        value: session.session.id,
                                        default: session.isSignedUp,
                                    }
                                })
                            )
                    )
            ]
        })
    }

    @InteractionSelectMenuResponse("d2_raid_set_available")
    async onMakeAvailableSet(interaction: SelectMenuInteraction) {
        let selected_session_ids = interaction.values
        // NOTE. At the end of this function. The set below will contain ONLY sessions which the user needs to be unsubcribed from
        let currently_subscribed_session_ids = new Set(await this.getUserSessionSubscriptions(interaction.user.id))

        for (let session_id of selected_session_ids) {
            if (currently_subscribed_session_ids.has(session_id)) {
                // User is already subscribed to this session, so ignore
                currently_subscribed_session_ids.delete(session_id)
                continue
            }

            // Check that the session is not already full
            const attendees = await this.getUsersSubscribedToSession(session_id)
            if (attendees.length >= this.maxFireteamSize) {
                continue
            }
            await this.subscribeUserToSession(interaction.user.id, session_id)
        }

        for (let session of currently_subscribed_session_ids) await this.unsubscribeUserFromSession(interaction.user.id, session)

        void interaction.reply({
            content: "Awesome! We've recorded those dates",
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

export function getClient(access_token: string) {
    return new BungieClient(access_token)
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
            components: [900],
            destinyMembershipId: currentUser.primaryMembershipId,
            membershipType: primaryMembership.membershipType
        }
        console.log(_data)
        let profile = await getProfile(client, _data)
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
        game_id: EVENT_IDS.DESTINY2,
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


        let membershipId: string = d2User.Response.primaryMembershipId || d2User.Response.destinyMemberships[0].membershipId
        let primaryMembership = d2User.Response.destinyMemberships.find(i => i.membershipId === membershipId)
        if (!membershipId || !primaryMembership) throw new Error("Bungie account does not have a primary membership ID")
        await SafeQuery(sql`UPDATE dbo.Users
                            SET D2_AccessToken=${access_token},
                                D2_RefreshToken=${refresh_token},
                                D2_MembershipId=${membershipId},
                                D2_MembershipType=${primaryMembership.membershipType}
                            WHERE discord_id = ${discord_id}`)
        // Save access_token and refresh_token for future use
        console.log(access_token, refresh_token)
        res.send("Thank you for connecting your Bungie.NET account! You can now use Crash Bot to view better stats from Destiny 2. Stats may take a minute or two to fully appear while we sync your data.")

        syncD2Achievements(discord_id)
    } catch (e) {
        next(e)
    }
})


function getNextRaidSessionTimes() {
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

async function refreshAccessTokens() {
    console.log("Refreshing D2 access tokens")
    let tokens = (await SafeQuery<{ discord_id: string, D2_RefreshToken: string }>(sql`
        SELECT discord_id, D2_RefreshToken
        FROM dbo.Users
        WHERE D2_RefreshToken IS NOT NULL
          AND D2_AccessTokenExpiry < SYSDATETIME()
    `)).recordset
    for (let token of tokens) {
        try {
            console.log("Refreshing tokens", token.D2_RefreshToken, {
                client_id: process.env.BUNGIE_CLIENT_ID ?? "",
                client_secret: process.env.BUNGIE_CLIENT_SECRET ?? ""
            })
            let res = await refreshAuthorization(token.D2_RefreshToken, {
                client_id: process.env.BUNGIE_CLIENT_ID ?? "",
                client_secret: process.env.BUNGIE_CLIENT_SECRET ?? ""
            }, new BungieClient())
            await SafeQuery(sql`UPDATE dbo.Users
                                SET D2_AccessToken=${res.access_token},
                                    D2_RefreshToken=${res.refresh_token},
                                    D2_AccessTokenExpiry=${new Date(Date.now() + (res.expires_in * 1000))}
                                    WHERE discord_id=${token.discord_id}
                                    `);
        } catch (e) {
            console.error(`An error occured while refreshing D2 token for discord ID: ${token.discord_id}`, e)

            // Disconnect the Bungie account
            await SafeQuery(sql`UPDATE dbo.Users SET
                     D2_AccessToken=NULL,
                     D2_RefreshToken=NULL,
                     D2_MembershipId=NULL,
                     D2_AccessTokenExpiry=NULL
                     WHERE discord_id=${token.discord_id}`);
            (await client.users.fetch(token.discord_id)).send("We failed to refresh access to your Bungie account. To reconnect your Bungie account to Crash Bot, please run /destiny2 login.")
        }
    }
}
