import {BasicBungieClient} from "bungie-net-core/lib/client.js";
import {getDestinyManifest} from "bungie-net-core/lib/endpoints/Destiny2/index.js";
import Discord, {
    ActionRowBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageActionRowComponentBuilder,
    SelectMenuBuilder
} from "discord.js";
import {StatDefinition} from "../../misc/DestinyDefinitions/StatDefinitions.js";
import {ActivityDefinition} from "../../misc/DestinyDefinitions/ActivityDefinitions.js";
import {VendorDefinition} from "../../misc/DestinyDefinitions/VendorDefinitions.js";
import SafeQuery, {sql} from "../../services/SQL.js";
import mssql from "mssql";
import fetch from "node-fetch"
import {groupItemsWithMatchingNames} from "../../utilities/groupItemsWithMatchingNames.js";
import {normalize} from "normalize-word";
import {
    DestinyActivityDefinition,
    DestinyClass,
    DestinyInventoryItemDefinition,
    DestinyItemType,
    DestinyVendorDefinition
} from "bungie-net-core/lib/models/index.js";
import {API_KEY} from "../../apis/Bungie.NET.js";
import {destinyManifestDatabase, MANIFEST_SEARCH} from "./DestinyManifestDatabase.js";

const D2ClassEmojis = {
    [DestinyClass.Titan]: "1186537374247829505",
    [DestinyClass.Hunter]: "1186537371055947786",
    [DestinyClass.Warlock]: "1186537375912968272",
    [DestinyClass.Unknown]: null
}

// Function to calculate the Levenshtein distance
interface InventoryItem {
    id: number,
    json: string,
    distance?: number,
    name?: string,
    data?: DestinyInventoryItemDefinition
}

export async function getVendorItems(hash: number): Promise<number[] | undefined> {
    let result = await SafeQuery<{ ItemHashes: string }>(sql`SELECT ItemHashes
                                                             FROM dbo.DestinyVendors
                                                             WHERE VendorHash = ${hash}`)
    return result.recordset[0] ? JSON.parse(result.recordset[0].ItemHashes) : undefined
}

export async function onlyVendorsThatSellStuff(vendors: DestinyVendorDefinition[]) {
    let sellingVendors = (await SafeQuery<{ VendorHash: number }>(sql`SELECT VendorHash
                                                                      FROM CrashBot.dbo.DestinyVendors
                                                                      WHERE ItemHashes != '[]'
                                                                        AND VendorHash IN ${vendors.map(v => v.hash)}`))
        .recordset.map(i => i.VendorHash)
    return vendors.filter(v => sellingVendors.includes(v.hash))
}

export function getItemTypeName(itemType: DestinyItemType) {
    switch (itemType) {
        case DestinyItemType.Aura:
            return "Aura"
        case DestinyItemType.Armor:
            return "Armour"
        case DestinyItemType.Bounty:
            return "Bounty"
        case DestinyItemType.ClanBanner:
            return "Clan Banner"
        case DestinyItemType.Consumable:
            return "Consumable"
        case DestinyItemType.Currency:
            return "Currency"
        case DestinyItemType.Dummy:
            return "Dummy"
        case DestinyItemType.Emblem:
            return "Emblem"
        case DestinyItemType.Emote:
            return "Emote"
        case DestinyItemType.Engram:
            return "Engram"
        case DestinyItemType.ExchangeMaterial:
            return "Exchange Material"
        case DestinyItemType.Mod:
            return "Mod"
        case DestinyItemType.Finisher:
            return "Finisher"
        case DestinyItemType.Ghost:
            return "Ghost"
        case DestinyItemType.Message:
            return "Message"
        case DestinyItemType.MissionReward:
            return "Mission Reward"
        case DestinyItemType.Package:
            return "Package"
        case DestinyItemType.Quest:
            return "Quest"
        case DestinyItemType.Pattern:
            return "Pattern"
        case DestinyItemType.QuestStep:
            return "Quest Step"
        case DestinyItemType.Ship:
            return "Ship"
        case DestinyItemType.QuestStepComplete:
            return "Quest Step (complete)"
        case DestinyItemType.SeasonalArtifact:
            return "Seasonal Artifact"
        case DestinyItemType.Vehicle:
            return "Vehicle"
        case DestinyItemType.Weapon:
            return "Weapon"
        case DestinyItemType.Wrapper:
            return "Wraper"
        case DestinyItemType.Subclass:
            return "Subclass"
        case DestinyItemType.None:
            return "None"
        default:
            return "unknown"
    }
}

export function getTierTypeEmoji(tier: number) {
    switch (tier) {
        case 1:
            return "💵"
        case 2:
            return "⚪"
        case 3:
            return "⚪"
        case 4:
            return "🟢"
        case 5:
            return "🟣"
        case 6:
            return "🟡"
        default:
            return "⚪"
    }
}

export async function buildItemMessage(searchQuery: string, item: DestinyInventoryItemDefinition, similarItems: DestinyInventoryItemDefinition[]): Promise<Discord.InteractionReplyOptions & {
    fetchReply: true
}> {
    // Detect the item type
    let embeds: EmbedBuilder[] = []
    console.log("ITEM:", item)
    let vendors = await getItemVendors(item.hash)

    embeds.push(await buildItemEmbed(
        item,
        `Your search yielded ${similarItems.length} results.` +
        (similarItems.length > 25 ? " Only the first 25 could be shown. Refine your search to show more" : "")
        , true
    ))

    // Fetch any vendors that are selling this item
    try {
        let vendor_ids: {
            VendorHash: string
        }[] = (await SafeQuery("SELECT VendorHash FROM CrashBot.dbo.DestinyVendors WHERE ItemHashes LIKE CONCAT('%', @itemHash, '%')", [
            {name: "itemHash", type: mssql.NVarChar(), data: item.hash.toString()}
        ])).recordset

        let vendors = await MANIFEST_SEARCH.vendors.byHash(vendor_ids.map(i => parseInt(i.VendorHash)))

        for (let vendor of vendors) embeds.push(buildVendorEmbed(vendor, "This vendor is currently selling this item"))
    } catch (e) {
        console.error(e)
    }
    console.log(embeds.length)

    let similar_action_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(
            new SelectMenuBuilder()
                .setCustomId("d2_item_search_adjust")
                .setPlaceholder("Similar items")
                .addOptions(
                    similarItems.slice(0, 25).map((i, index) => {
                        console.log({
                            label: i.displayProperties.name.substring(0, 20),
                            description: (i.itemTypeAndTierDisplayName || getItemTypeName(i.itemType)).substring(0, 20),
                            value: JSON.stringify([searchQuery, i.hash]),
                            default: i.hash === item.hash
                        })
                        return {
                            label: i.displayProperties.name.substring(0, 20),
                            description: (i.itemTypeAndTierDisplayName || getItemTypeName(i.itemType)).substring(0, 20),
                            value: JSON.stringify([searchQuery, i.hash]),
                            default: i.hash === item.hash
                        }
                    })
                )
        )

    let notification_action_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(
            new SelectMenuBuilder()
                .setCustomId("d2_item_notification")
                .setPlaceholder("Configure Notifications...")
                .addOptions([
                    {label: `When this is available at a vendor`, value: JSON.stringify([0, item.hash])},
                ])
        )

    return {
        embeds: embeds,
        components: vendors.length > 0 ? [similar_action_row, notification_action_row] : [similar_action_row],
        fetchReply: true
    }
}

export function getItemVendors(itemHash: number): Promise<VendorDefinition[]> {
    return new Promise((resolve, reject) => {
        destinyManifestDatabase.all<InventoryItem>(
            `SELECT *
             FROM "DestinyVendorDefinition"
             WHERE json LIKE '%' || ? || '%'`,
            [itemHash],
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                resolve(rows.map(i => {
                    let data: VendorDefinition = JSON.parse(i.json)
                    return data
                }))
            }
        )
    })
}

export async function buildVendorMessage(searchQuery: string, item: DestinyVendorDefinition, similarItems: DestinyVendorDefinition[]): Promise<Discord.InteractionReplyOptions & {
    fetchReply: true
}> {
    const getCategoryIndex = (a: DestinyInventoryItemDefinition) => {
        return item.itemList.find(i => i.itemHash === a.hash)?.categoryIndex || -1
    }

    // Detect the item type
    let embeds: EmbedBuilder[] = []
    let embed = buildVendorEmbed(item)


    // Fetch all items that the vendor is selling
    try {
        let itemHashes: number[] =
            JSON.parse(
                (await SafeQuery("SELECT ItemHashes FROM CrashBot.dbo.DestinyVendors WHERE VendorHash = @hash", [
                    {name: "hash", type: mssql.BigInt(), data: item.hash}
                ])).recordset[0].ItemHashes
            )

        console.log(itemHashes, item.hash)

        let items = await MANIFEST_SEARCH.items.byHash(itemHashes)
        let categories: { [key: string]: DestinyInventoryItemDefinition[] } = {}

        for (let _item of items) {
            let category_index = getCategoryIndex(_item)
            if (!categories[category_index]) categories[category_index] = [_item]
            else categories[category_index].push(_item)
        }

        embed.addFields(
            Object.keys(categories)
                // @ts-ignore
                .filter(category => !!item.displayCategories[category])
                .map((category) => {
                    console.log(category)
                    // @ts-ignore
                    return {
                        // @ts-ignore
                        name: item.displayCategories[category]?.displayProperties.name || "Unknown Category",
                        value: categories[category]
                            .filter(i => !!i.inventory)
                            .map(i => {
                                if (!i.inventory) return ""

                                let text = `${getTierTypeEmoji(i.inventory.tierType)} [${i.displayProperties.name}](https://www.light.gg/db/items/${i.hash}) ${getItemTypeName(i.itemType)}`
                                switch (i.classType) {
                                    case DestinyClass.Hunter:
                                        text += ` [<:emoji:${D2ClassEmojis[DestinyClass.Hunter]}> Hunter]`
                                        break
                                    case DestinyClass.Titan:
                                        text += ` [<:emoji:${D2ClassEmojis[DestinyClass.Titan]}> Titan]`
                                        break
                                    case DestinyClass.Warlock:
                                        text += ` [<:emoji:${D2ClassEmojis[DestinyClass.Warlock]}> Warlock]`
                                        break
                                }

                                return text
                            })
                            .join("\n") || ""
                    }
                })
        )
    } catch (e) {
        console.error(e)
    }

    embeds.push(embed)

    let similar_action_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(
            new SelectMenuBuilder()
                .setCustomId("d2_vendor_search_adjust")
                .setPlaceholder("Similar items")
                .addOptions(
                    similarItems.slice(0, 25).map((i, index) => {
                        return {
                            label: i.displayProperties.name,
                            description: (i.displayProperties.subtitle || i.displayProperties.description).substring(0, 100) || "No description",
                            value: JSON.stringify([searchQuery, i.hash]),
                            default: i.hash === item.hash
                        }
                    })
                )
        )

    let notification_action_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(
            new SelectMenuBuilder()
                .setCustomId("d2_vendor_notification")
                .setPlaceholder("Configure Notifications...")
                .addOptions([
                    {
                        label: "When this vendor's inventory next resets...",
                        value: JSON.stringify(["at_next_reset", item.hash])
                    },
                ])
        )

    return {
        content: " ",
        embeds: embeds,
        components: [similar_action_row, notification_action_row],
        fetchReply: true
    }
}

export async function buildItemEmbed(item: DestinyInventoryItemDefinition, footer: string = "", include_stats: boolean = false) {
    let text: string[] = []
    let type = item.itemTypeAndTierDisplayName

    if (item.displayProperties.description) {
        text.push(item.displayProperties.description)
    }
    if (item.flavorText) {
        text.push(item.flavorText)
    }

    if (include_stats) {
        let vendors = await getItemVendors(item.hash)
        text.push(`[View on light.gg](https://www.light.gg/db/items/${item.hash})`)
    }

    let embed = new EmbedBuilder()
        .setTitle(item.displayProperties.name + " - " + type)
        .setThumbnail("https://bungie.net" + item.displayProperties.icon)
        .setDescription(text.join("\n\n").substring(0, 500))
        .setFooter({
            text: footer
        })
        .setURL(`https://www.light.gg/db/items/${item.hash}`)


    if (include_stats && item.stats) {
        if (item.itemType === DestinyItemType.Weapon) {
            // Process item stats
            let stats = await MANIFEST_SEARCH.stats.byHash(
                Object.keys(item.stats.stats).map(Number)
            )
            for (let stat_definition of stats) {
                if (!stat_definition.displayProperties.name) continue
                embed.addFields({
                    name: stat_definition.displayProperties.name,
                    value: item.stats.stats[stat_definition.hash]?.value + "/" + item.stats.stats[stat_definition.hash].displayMaximum,
                    inline: true
                })
            }
        }
    }

    return embed
}

export function buildTinyItemEmbed(item: DestinyInventoryItemDefinition) {
    let text: string[] = []
    let type = item.itemTypeAndTierDisplayName

    if (item.displayProperties.description) {
        text.push(item.displayProperties.description)
    }
    if (item.flavorText) {
        text.push(item.flavorText)
    }

    let embed = new EmbedBuilder()
        .setAuthor({
            iconURL: "https://bungie.net" + item.displayProperties.icon,
            name: item.displayProperties.name + " - " + type,
            url: `https://www.light.gg/db/items/${item.hash}`
        })

    return embed
}


export function buildVendorEmbed(vendor: DestinyVendorDefinition, footer?: string) {
    const nextReset = getTimeOfNextReset(vendor.resetIntervalMinutes * 60000, vendor.resetOffsetMinutes * 60000)
    console.log("NEXT RESET:", nextReset)
    let embed = new EmbedBuilder()
        .setTitle(vendor.displayProperties.name)
        .setDescription(`Next reset: <t:${Math.floor(nextReset.getTime() / 1000)}:R>\n\n${vendor.displayProperties.description}`)
        .setImage(`https://bungie.net` + vendor.displayProperties.largeIcon)
    if (footer) embed.setFooter({text: footer})
    return embed
}

export function buildTinyVendorEmbed(vendor: VendorDefinition) {
    let embed = new EmbedBuilder()
        .setAuthor({
            iconURL: `https://bungie.net` + vendor.displayProperties.largeIcon,
            name: vendor.displayProperties.name,
            url: `https://www.light.gg/db/vendors/${vendor.hash}`
        })
    return embed
}

export async function buildActivityMessage(searchQuery: string, activity: DestinyActivityDefinition, similarActivities: DestinyActivityDefinition[]): Promise<Discord.InteractionReplyOptions & {
    fetchReply: true
}> {
    // Detect the item type
    let text: string[] = []
    if (activity.displayProperties.description) {
        text.push(activity.displayProperties.description)
    }

    // text.push(`[View on light.gg](https://www.light.gg/db/items/${activity.hash})`)
    let embed = new EmbedBuilder()
        .setTitle(activity.displayProperties.name)
        .setThumbnail("https://bungie.net" + activity.displayProperties.icon)
        .setDescription(text.join("\n\n"))
        .setFooter({
            text: `Your search yielded ${similarActivities.length} results.` +
                (similarActivities.length > 25 ? " Only the first 25 could be shown. Refine your search to show more" : "")
        })
        .setImage("https://bungie.net" + activity.pgcrImage)

    let similar_action_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(
            new SelectMenuBuilder()
                .setCustomId("d2_activity_search_adjust")
                .setPlaceholder("Similar items")
                .addOptions(
                    similarActivities.slice(0, 25).map((i, index) => {
                        return {
                            label: i.displayProperties.name,
                            value: JSON.stringify([searchQuery, i.hash]),
                            default: i.hash === activity.hash
                        }
                    })
                )
        )

    let notification_action_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(
            new SelectMenuBuilder()
                .setCustomId("d2_item_notification")
                .setPlaceholder("Configure Notifications...")
                .addOptions([
                    {label: "Notifications are not yet supported for activities", value: "notification_vendor"},
                ])
        )

    return {
        content: " ",
        embeds: [embed],
        components: [similar_action_row, notification_action_row],
        fetchReply: true
    }
}

export function updateMSVendors(): Promise<void> {
    return new Promise((resolve, reject) => {
        destinyManifestDatabase.all<InventoryItem>(
            'SELECT * FROM "DestinyVendorDefinition" WHERE 1',
            async (err, rows) => {
                let vendors: VendorDefinition[] = rows.map(i => JSON.parse(i.json))
                await SafeQuery("DELETE FROM CrashBot.dbo.DestinyVendors WHERE 1=1", [])

                console.log(`Updating ${vendors.length} D2 vendors...`)
                for (let vendor of vendors) {
                    try {
                        await SafeQuery("INSERT INTO CrashBot.dbo.DestinyVendors (VendorHash, LastRefresh, ItemHashes) VALUES (@hash, DEFAULT, DEFAULT);", [
                            {name: "hash", type: mssql.TYPES.BigInt(), data: vendor.hash}
                        ])
                    } catch (e) {
                    }
                }
                console.log("Finished updating vendors via manifest")

                console.log("Updating rotating vendors...")

                // Fetch main D2 profile to use for refreshes
                let user = (await SafeQuery("SELECT * FROM dbo.Users WHERE id = 2", [])).recordset[0]

                let req = await fetch(`https://bungie.net/Platform/Destiny2/1/Profile/4611686018512362465/Character/2305843009761454376/Vendors/?components=402`, {
                    method: "GET",
                    headers: {
                        Authorization: "Bearer " + user["D2_AccessToken"],
                        "X-API-Key": API_KEY
                    }
                })
                let data = await req.json()
                console.log(data)

                console.log(`Updating ${data.Response.sales.data.length} rotating vendors...`)
                for (let vendorHash of Object.keys(data.Response.sales.data)) {
                    let selling_items = Object.keys(data.Response.sales.data[vendorHash].saleItems).map(i => {
                        return data.Response.sales.data[vendorHash].saleItems[i].itemHash as number
                    })
                    try {
                        await SafeQuery("UPDATE dbo.DestinyVendors SET ItemHashes = @json WHERE VendorHash = @hash", [
                            {name: "json", type: mssql.TYPES.VarChar(2000), data: JSON.stringify(selling_items)},
                            {name: "hash", type: mssql.TYPES.BigInt(), data: parseInt(vendorHash)}
                        ])
                    } catch (e) {
                    }
                }
                resolve()
            }
        )
    })
}

export async function setupBungieAPI() {
    console.log("STEP 1")
    await refreshTokens()
    setInterval(() => {
        refreshTokens()
            .then(() => {
                updateMSVendors()
            })
        // Tokens reset every hour. This will refresh just beforehand
    }, 3240000)
}

async function refreshTokens() {
    let users: {
        id: number,
        refresh_token: string
    }[] = (await SafeQuery("SELECT id, D2_RefreshToken AS 'refresh_token' FROM CrashBot.dbo.Users WHERE D2_AccessToken IS NOT NULL", [])).recordset

    // Refresh all user tokens
    for (let user of users) {
        let req = await fetch("https://www.bungie.net/platform/app/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: "44873",
                client_secret: "eCKqnELTntly5XB9lhCQkb0BhN.6ydblw6R76nSdF.Y",
                grant_type: "refresh_token",
                refresh_token: user.refresh_token
            })
        })
        console.log("STEP 2")

        let body: {
            error?: string,
            access_token: string,
            token_type: string,
            expires_in: number,
            refresh_token: string,
            refresh_expires_in: number,
            membership_id: string
        } = await req.json()

        if (body.error) {
            console.log("Failed to update OAuth token for user " + user.id)
            console.error(body.error)
            continue
        }

        console.log("Saving updated tokens.")

        // Update the SQL database
        await SafeQuery("UPDATE CrashBot.dbo.Users SET D2_AccessToken = @accesstoken, D2_RefreshToken = @refreshtoken, D2_AccessTokenExpiry = @accessexpiry, D2_MembershipId = @membershipid WHERE id = @id", [
            {name: "accesstoken", type: mssql.TYPES.VarChar(), data: body.access_token},
            {name: "refreshtoken", type: mssql.TYPES.VarChar(), data: body.refresh_token},
            {
                name: "accessexpiry", type: mssql.TYPES.DateTime2(), data: new Date(
                    Date.now() + ((body.expires_in * 60) * 1000)
                )
            },
            {name: "membershipid", type: mssql.TYPES.BigInt(), data: body.membership_id.toString()},
            {name: "id", type: mssql.TYPES.Int(), data: user.id},
        ])
    }
}

function getTimeOfNextReset(interval: number, offset = 0) {
    console.log("INTERVAL", interval, "OFFSET", offset)
    const nextReset = new Date();
    let nextResetTime = nextReset.getTime()
    nextReset.setTime((nextResetTime - (nextResetTime % interval)) + interval)
    offset = offset + 2 * (60 * 60 * 1000)
    nextReset.setTime(nextReset.getTime() + offset)

    while (nextReset.getTime() < Date.now()) nextReset.setTime(nextReset.getTime() + interval)

    return nextReset;
}

export enum Weekdays {
    SUNDAY,
    MONDAY,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY
}

export function getNextWeekday(date: Date, weekday: Weekdays) {
    date = new Date(date)
    const currentWeekday = date.getDay()
    if (currentWeekday < weekday) {
        date.setDate(date.getDate() + (weekday - currentWeekday))
    }
    else if (currentWeekday > weekday) {
        date.setDate(date.getDate() + (7 - currentWeekday) + weekday)
    }
    return date
}