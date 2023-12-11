import {
    BaseModule,
    OnClientEvent,
    InteractionCommandResponse,
    InteractionSelectMenuResponse,
    InteractionAutocompleteResponse
} from "./BaseModule.js";
import {
    AutocompleteInteraction,
    Client,
    CommandInteraction,
    Interaction,
    Message, MessageEmbed,
    SelectMenuInteraction
} from "discord.js";
import {ApplicationCommandOptionTypes} from "discord.js/typings/enums.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandStringOption} from "@discordjs/builders";
import {
    activityNameSearch, buildActivityMessage, buildItemEmbed,
    buildItemMessage, buildTinyItemEmbed,
    buildVendorMessage, destinyManifestDatabase,
    itemNameSearch, SetupNotifications,
    vendorNameSearch
} from "../misc/Bungie.NET.js";
import {Item, ItemType} from "../misc/DestinyDefinitions/DestinyDefinitions.js";
import {flatten} from "../utilities/flatten.js";
import {groupItemsWithMatchingNames} from "../utilities/groupItemsWithMatchingNames.js";

interface InventoryItem {
    id: number,
    json: string,
    distance?: number,
    name?: string,
    data?: Item
}

const AUTO_MESSAGE_RESPONSE_EXCLUDE_TYPES = [
    ItemType.None,
    ItemType.Currency,
    ItemType.Dummy,
    ItemType.Package,
    ItemType.Emote,
    ItemType.Mod
]

export class D2Module extends BaseModule {
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
    ]

    constructor(client: Client) {super(client);}

    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        if (msg.author.bot) return
        else if (msg.content.startsWith("I wonder what") && msg.content.endsWith("is selling")) {
            const name = msg.content.replace("I wonder what", "").replace("is selling", "")
            vendorNameSearch(name, 20, true)
                .then(items => {
                    return buildVendorMessage(name, items[0], items)
                })
                .then(message => {
                    // @ts-ignore
                    msg.reply(message)
                })
        }

        let sql = 'SELECT *, json_extract(json, "$.displayProperties.name") AS \'name\', json_extract(json, "$.itemType") AS \'type\' FROM "DestinyInventoryItemDefinition" ' +
            'WHERE ? LIKE "%" || LOWER(name) || "%" AND name IS NOT \'\' ' +
            'AND type NOT IN (' + AUTO_MESSAGE_RESPONSE_EXCLUDE_TYPES.join(", ") + ')'
        console.log(sql)
        destinyManifestDatabase.all<InventoryItem>(
            sql,
            [msg.content.toLowerCase()],
            async (err, rows) => {
                if (err) throw err
                if (rows.length === 0) {
                    console.log("User did not talk about a D2 item :(")
                    return
                }
                let embeds: MessageEmbed[] = []

                for (let item of groupItemsWithMatchingNames(
                    rows
                        .map(i => {
                            i.data = JSON.parse(i.json)
                            return i
                        })
                        .filter(row => row.data)
                    ,
                    (i) => i.data?.displayProperties.name || ""
                )) {
                    if (!item[0].data) continue
                    console.log(item[0].data.itemType)
                    embeds.push(buildTinyItemEmbed(item[0].data))
                }
                msg.reply({content: " ", embeds})
            }
        )
    }

    @InteractionCommandResponse("destiny2")
    onD2SlashCommand(interaction: CommandInteraction) {
        let name = interaction.options.getString("name") || ""
        switch (interaction.options.getSubcommand()) {
            case "items":
                if (name.length < 3) {
                    interaction.reply({
                        content: "That search is a bit short. Please try something longer"
                    })
                    return
                }
                itemNameSearch(name)
                    .then(items => {
                        return buildItemMessage(name, flatten(items)[0], flatten(items))
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
                return
            case "activities":
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
                return
        }
    }

    @InteractionAutocompleteResponse("destiny2")
    async onAutocomplete(interaction: AutocompleteInteraction) {
        console.log("Attempting D2 autocomplete....")

        let name = interaction.options.getString("name") || ""
        let results: string[] = []

        switch (interaction.options.getSubcommand()) {
            case "items":
                let similarItems = await itemNameSearch(name, 20)
                results = Array.from(new Set(flatten(similarItems).map(i => {
                    return i.displayProperties.name.substring(0, 100)
                }))).slice(0, 10)
                break
            case "vendors":
                let similarVendors = await vendorNameSearch(name, 20)

                results = Array.from(new Set(similarVendors.map(i => {
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

        itemNameSearch(value[0])
            .then(items => {
                let selected_item = flatten(items).find(i => i.hash === value[1])
                if (!selected_item) throw "Selected an invalid item"
                return buildItemMessage(value[0], selected_item, flatten(items))
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

    @InteractionSelectMenuResponse("d2_vendor_search_adjust")
    onVendorSearchAdjust(interaction: SelectMenuInteraction) {
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

    @InteractionSelectMenuResponse("d2_item_notification")
    onItemNotificationConfigure(interaction: SelectMenuInteraction) {
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