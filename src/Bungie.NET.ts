import {BasicBungieClient} from "bungie-net-core/lib/client.js";
import {getDestinyManifest} from "bungie-net-core/lib/endpoints/Destiny2/index.js";
import sqlite3 from "sqlite3"
import {Item, ItemType} from "./DestinyDefinitions/DestinyDefinitions.js"
import Discord from "discord.js";
import {StatDefinition} from "./DestinyDefinitions/StatDefinitions.js";
import {ActivityDefinition} from "./DestinyDefinitions/ActivityDefinitions.js";
import {VendorDefinition} from "./DestinyDefinitions/VendorDefinitions.js";
import SafeQuery from "./SQL.js";
import mssql from "mssql";
import fetch from "node-fetch"

// Function to calculate the Levenshtein distance
function levenshteinDistance(s1: string, s2: string) {
    const m = s1.length;
    const n = s2.length;

    // Create a matrix to store the distances
    const dp = Array.from(Array(m + 1), () => Array(n + 1).fill(0));

    // Initialize the first row and column
    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }

    // Compute the distances
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,    // Deletion
                    dp[i][j - 1] + 1,    // Insertion
                    dp[i - 1][j - 1] + 1 // Substitution
                );
            }
        }
    }

    // Return the Levenshtein distance
    return dp[m][n];
}

const database = new sqlite3.Database("./assets/destiny/manifest.db", (err) => {
    if (err) {
        console.error(err)
    }
    else {
        console.log("Connected to my database!")
    }
})
const client = new BasicBungieClient();

export function getManifest() {
    return getDestinyManifest(client)
}

interface InventoryItem {
    id: number,
    json: string,
    distance?: number,
    name?: string,
    data?: Item
}

export function itemNameSearch(name: string): Promise<Item[]> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
            'SELECT * FROM "DestinyInventoryItemDefinition" WHERE json_extract(json, "$.displayProperties.name") LIKE "%" || ? || "%"',
            [name],
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                if (rows.length === 0) {
                    reject(new Error("Could not fid item"))
                    return;
                }

                for (let row of rows) {
                    row.data = JSON.parse(row.json)
                    // @ts-ignore
                    row.name = row.data?.displayProperties.name
                    row.distance = levenshteinDistance(row.name || "", name)
                }

                rows.sort((a, b) => {
                    // @ts-ignore
                    if (a.distance > b.distance) {
                        return 1
                    }
                    // @ts-ignore
                    else if (a.distance < b.distance) {
                        return -1
                    }
                    else return 0
                })

                // @ts-ignore
                resolve(rows.map(i => i.data))
            }
        )
    })
}

export function activityNameSearch(name: string): Promise<ActivityDefinition[]> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
            'SELECT * FROM "DestinyActivityDefinition" WHERE json_extract(json, "$.displayProperties.name") LIKE "%" || ? || "%"',
            [name],
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                if (rows.length === 0) {
                    reject(new Error("Could not fid item"))
                    return;
                }

                for (let row of rows) {
                    row.data = JSON.parse(row.json)
                    // @ts-ignore
                    row.name = row.data?.displayProperties.name
                    row.distance = levenshteinDistance(row.name || "", name)
                }

                rows.sort((a, b) => {
                    // @ts-ignore
                    if (a.distance > b.distance) {
                        return 1
                    }
                    // @ts-ignore
                    else if (a.distance < b.distance) {
                        return -1
                    }
                    else return 0
                })

                // @ts-ignore
                resolve(rows.map(i => i.data))
            }
        )
    })
}

export function vendorNameSearch(name: string): Promise<VendorDefinition[]> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
            'SELECT * FROM "DestinyVendorDefinition" WHERE json_extract(json, "$.displayProperties.name") IS NOT \'\'',
            // 'SELECT * FROM "DestinyVendorDefinition" WHERE TRUE',
            // [name],
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                if (rows.length === 0) {
                    reject(new Error("Could not fid item"))
                    return;
                }

                for (let row of rows) {
                    row.data = JSON.parse(row.json)
                    // @ts-ignore
                    row.name = row.data?.displayProperties.name
                    row.distance = levenshteinDistance(row.name || "", name)
                }

                rows
                    .sort((a, b) => {
                        // @ts-ignore
                        if (a.distance > b.distance) {
                            return 1
                        }
                        // @ts-ignore
                        else if (a.distance < b.distance) {
                            return -1
                        }
                        else return 0
                    })

                // @ts-ignore
                resolve(rows.map(i => i.data))
            }
        )
    })
}

export function getItemsByHash(hash: number[]): Promise<Item[]> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
            `SELECT *
             FROM "DestinyInventoryItemDefinition"
             WHERE json_extract(json, "$.hash") IN (${hash.map(i => "?").join(",")})`,
            hash,
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                if (rows.length === 0) {
                    reject(new Error("Could not find item"))
                    return;
                }

                // @ts-ignore
                resolve(rows.map(i => {
                    let data: Item = JSON.parse(i.json)
                    return data
                }))
            }
        )
    })
}

export function getVendorByHash(hash: number): Promise<VendorDefinition> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
            'SELECT * FROM "DestinyVendorDefinition" WHERE json_extract(json, "$.hash") = ?',
            [hash],
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                if (rows.length === 0) {
                    reject(new Error("Could not find item"))
                    return;
                }

                // @ts-ignore
                let data: VendorDefinition = JSON.parse(rows[0].json)
                resolve(data)
            }
        )
    })
}

export function getStatDefinitionByHash(id: string): Promise<StatDefinition> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
            'SELECT * FROM "DestinyStatDefinition" WHERE json_extract(json, "$.hash") = ? OR id = ?',
            [parseInt(id), id],
            (err, rows) => {
                if (err) {
                    reject(err)
                    return
                }

                if (rows.length === 0) {
                    reject(new Error("Could not find item: " + id))
                    return;
                }

                // @ts-ignore
                let data: StatDefinition = JSON.parse(rows[0].json)
                resolve(data)
            }
        )
    })
}

export function getItemTypeName(itemType: ItemType) {
    switch (itemType) {
        case ItemType.Aura:
            return "Aura"
        case ItemType.Armor:
            return "Armour"
        case ItemType.Bounty:
            return "Bounty"
        case ItemType.ClanBanner:
            return "Clan Banner"
        case ItemType.Consumable:
            return "Consumable"
        case ItemType.Currency:
            return "Currency"
        case ItemType.Dummy:
            return "Dummy"
        case ItemType.Emblem:
            return "Emblem"
        case ItemType.Emote:
            return "Emote"
        case ItemType.Engram:
            return "Engram"
        case ItemType.ExchangeMaterial:
            return "Exchange Material"
        case ItemType.Mod:
            return "Mod"
        case ItemType.Finisher:
            return "Finisher"
        case ItemType.Ghost:
            return "Ghost"
        case ItemType.Message:
            return "Message"
        case ItemType.MissionReward:
            return "Mission Reward"
        case ItemType.Package:
            return "Package"
        case ItemType.Quest:
            return "Quest"
        case ItemType.Pattern:
            return "Pattern"
        case ItemType.QuestStep:
            return "Quest Step"
        case ItemType.Ship:
            return "Ship"
        case ItemType.QuestStepComplete:
            return "Quest Step (complete)"
        case ItemType.SeasonalArtifact:
            return "Seasonal Artifact"
        case ItemType.Vehicle:
            return "Vehicle"
        case ItemType.Weapon:
            return "Weapon"
        case ItemType.Wrapper:
            return "Wraper"
        case ItemType.Subclass:
            return "Subclass"
        case ItemType.None:
            return "None"
        default:
            return "unknown"
    }
}

export async function buildItemMessage(searchQuery: string, item: Item, similarItems: Item[]): Promise<Discord.InteractionReplyOptions & {
    fetchReply: true
}>
{
    // Detect the item typ
    let embeds: Discord.MessageEmbed[] = []
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

        let vendors = await Promise.all(vendor_ids.map(i => {
            return getVendorByHash(parseInt(i.VendorHash))
        }))

        for (let vendor of vendors) embeds.push(buildVendorEmbed(vendor, "This vendor is currently selling this item"))
    } catch (e) {
        console.error(e)
    }

    let similar_action_row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageSelectMenu()
                .setCustomId("d2_item_search_adjust")
                .setPlaceholder("Similar items")
                .addOptions(
                    similarItems.slice(0, 25).map((i, index) => {
                        return {
                            label: i.displayProperties.name,
                            description: i.itemTypeAndTierDisplayName || getItemTypeName(i.itemType),
                            value: JSON.stringify([searchQuery, i.hash]),
                            default: i.hash === item.hash
                        }
                    })
                )
        )

    let notification_action_row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageSelectMenu()
                .setCustomId("d2_item_notification")
                .setPlaceholder("Configure Notifications...")
                .addOptions([
                    {label: `When this is available at a vendor (${vendors.map(i => i.displayProperties.name).join(", ")})`, value: JSON.stringify([0, item.hash])},
                ])
        )

    return {
        content: " ",
        embeds: embeds,
        components: vendors.length > 0 ? [similar_action_row, notification_action_row] : [similar_action_row],
        fetchReply: true
    }
}

export function getItemVendors(itemHash: number): Promise<VendorDefinition[]> {
    return new Promise((resolve, reject) => {
        database.all<InventoryItem>(
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

export class SetupNotifications {
    static async itemAvailableAtVendor(user: Discord.User, item_hash: number) {
        let item = (await getItemsByHash([item_hash]))[0]

        let msg = await user.send({
            content: " ",
            embeds: [
                new Discord.MessageEmbed()
                    .setFooter({text: "You've asked us to notify you when this item is next available at a vendor."}),
                await buildItemEmbed(item, "", false)
            ],
            components: [
                new Discord.MessageActionRow()
                    .addComponents(
                        new Discord.MessageButton()
                            .setLabel("Cancel this notification")
                            .setCustomId("cancel_d2_notification")
                            .setStyle("SECONDARY")
                            .setEmoji("🗑️")
                    )
            ]
        })

        await SafeQuery("INSERT INTO CrashBot.dbo.D2_Notifications (type, item_hash, user_discord_id, msg_id, msg_channel) VALUES (0, @itemhash, @discordid, @msgid, @channelid);", [
            {name: "itemhash", type: mssql.TYPES.BigInt(), data: item.hash},
            {name: "discordid", type: mssql.TYPES.VarChar(), data: user.id},
            {name: "msgid", type: mssql.TYPES.VarChar(), data: msg.id},
            {name: "channelid", type: mssql.TYPES.VarChar(), data: msg.channelId},
        ])
    }
}

export async function buildVendorMessage(searchQuery: string, item: VendorDefinition, similarItems: VendorDefinition[]): Promise<Discord.InteractionReplyOptions & {
    fetchReply: true
}> {
    // Detect the item type
    let embeds: Discord.MessageEmbed[] = []

    let embed = await buildVendorEmbed(
        item,
        `Your search yielded ${similarItems.length} results.` +
        (similarItems.length > 25 ? " Only the first 25 could be shown. Refine your search to show more" : "")
    )

    // Fetch all items that the vendor is selling
    try {
        let itemHashes: number[] =
            JSON.parse(
                (await SafeQuery("SELECT ItemHashes FROM CrashBot.dbo.DestinyVendors WHERE VendorHash = @hash", [
                    {name: "hash", type: mssql.BigInt(), data: item.hash}
                ])).recordset[0].ItemHashes
            )

        console.log(itemHashes, item.hash)

        let categories: {
            [key: string]: string[]
        } = {}
        let items = await getItemsByHash(itemHashes)
        items.sort((a, b) => {
            if (a.itemTypeAndTierDisplayName > b.itemTypeAndTierDisplayName) {
                return -1
            }
            else if (a.itemTypeAndTierDisplayName > b.itemTypeAndTierDisplayName) {
                return 1
            }
            else if (a.displayProperties.name > b.displayProperties.name) {
                return -1
            }
            else {
                return 1
            }
        })
        for (let _item of items) {
            try {
                switch (_item.itemType) {
                    case ItemType.None:
                        continue
                    case ItemType.Message:
                        continue
                    case ItemType.MissionReward:
                        continue
                    case ItemType.Dummy:
                        continue
                    default:
                        if (!categories[_item.itemType]) categories[_item.itemType] = [
                            `[${_item.displayProperties.name}](https://www.light.gg/db/items/${_item.hash}/) [${_item.itemTypeAndTierDisplayName}]`
                        ]
                        else categories[_item.itemType].push(`[${_item.displayProperties.name}](https://www.light.gg/db/items/${_item.hash}/) [${_item.itemTypeAndTierDisplayName}]`)
                }
            } catch (e) {
                console.log(e)
            }
        }

        embed.addFields(
            Object.keys(categories)
                .map(category => {
                    return {name: getItemTypeName(parseInt(category)), value: categories[category].join("\n") || ""}
                })
        )
        embed.setFooter({text: item.hash.toString()})
    } catch (e) {
        console.error(e)
    }

    embeds.push(embed)

    let similar_action_row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageSelectMenu()
                .setCustomId("d2_vendor_search_adjust")
                .setPlaceholder("Similar items")
                .addOptions(
                    similarItems.slice(0, 25).map((i, index) => {
                        return {
                            label: i.displayProperties.name,
                            description: i.displayProperties.subtitle,
                            value: JSON.stringify([searchQuery, i.hash]),
                            default: i.hash === item.hash
                        }
                    })
                )
        )

    let notification_action_row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageSelectMenu()
                .setCustomId("d2_item_notification")
                .setPlaceholder("Configure Notifications...")
                .addOptions([
                    {label: "Notifications are not yet supported for vendors", value: "notification_vendor"},
                ])
        )

    return {
        content: " ",
        embeds: embeds,
        components: [similar_action_row, notification_action_row],
        fetchReply: true
    }
}

export async function buildItemEmbed(item: Item, footer: string = "", include_stats: boolean = false) {
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


        text.push(`[View on light.gg](https://www.light.gg/db/items/${item.hash})\n*This item is in the inventory rotation for ${vendors.length} vendors*`)
    }

    let embed = new Discord.MessageEmbed()
        .setTitle(item.displayProperties.name + " - " + type)
        .setThumbnail("https://bungie.net" + item.displayProperties.icon)
        .setDescription(text.join("\n\n"))
        .setFooter({
            text: footer
        })
        .setURL(`https://www.light.gg/db/items/${item.hash}`)


    if (include_stats) {
        if (item.itemType === ItemType.Weapon) {
            // Process item stats
            for (let key of Object.keys(item.stats.stats)) {
                let stat_definition = await getStatDefinitionByHash(key)
                if (!stat_definition.displayProperties.name) continue
                embed.addFields({
                    name: stat_definition.displayProperties.name,
                    value: item.stats.stats[key]?.value + "/" + item.stats.stats[key].displayMaximum,
                    inline: true
                })
            }
        }
    }

    return embed
}

export function buildVendorEmbed(vendor: VendorDefinition, footer: string = "") {
    let embed = new Discord.MessageEmbed()
        .setTitle(vendor.displayProperties.name)
        .setDescription(vendor.displayProperties.description)
        .setImage(`https://bungie.net` + vendor.displayProperties.largeIcon)
        .setFooter({text: footer})
    return embed
}

export async function buildActivityMessage(searchQuery: string, activity: ActivityDefinition, similarActivities: ActivityDefinition[]): Promise<Discord.InteractionReplyOptions & {
    fetchReply: true
}> {
    // Detect the item type
    let text: string[] = []
    if (activity.displayProperties.description) {
        text.push(activity.displayProperties.description)
    }

    // text.push(`[View on light.gg](https://www.light.gg/db/items/${activity.hash})`)
    let embed = new Discord.MessageEmbed()
        .setTitle(activity.displayProperties.name)
        .setThumbnail("https://bungie.net" + activity.displayProperties.icon)
        .setDescription(text.join("\n\n"))
        .setFooter({
            text: `Your search yielded ${similarActivities.length} results.` +
                (similarActivities.length > 25 ? " Only the first 25 could be shown. Refine your search to show more" : "")
        })
        .setImage("https://bungie.net" + activity.pgcrImage)

    let similar_action_row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageSelectMenu()
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

    let notification_action_row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageSelectMenu()
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
        database.all<InventoryItem>(
            'SELECT * FROM "DestinyVendorDefinition" WHERE 1',
            async (err, rows) => {
                let vendors: VendorDefinition[] = rows.map(i => JSON.parse(i.json))
                await SafeQuery("DELETE FROM CrashBot.dbo.DestinyVendors WHERE 1=1")

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
                let user = (await SafeQuery("SELECT * FROM dbo.Users WHERE id = 2")).recordset[0]

                let req = await fetch(`https://bungie.net/Platform/Destiny2/1/Profile/4611686018512362465/Character/2305843009761454376/Vendors/?components=402`, {
                    method: "GET",
                    headers: {
                        Authorization: "Bearer " + user["D2_AccessToken"],
                        "X-API-Key": "5101a63d5c944c16bf19c34e21e0d61e"
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
    }, 3.6e+6)
}

async function refreshTokens() {
    let users: {
        id: number,
        refresh_token: string
    }[] = (await SafeQuery("SELECT id, D2_RefreshToken AS 'refresh_token' FROM CrashBot.dbo.Users WHERE D2_AccessToken IS NOT NULL")).recordset

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