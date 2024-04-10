import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageActionRowComponentBuilder,
    TextBasedChannel,
    User
} from "discord.js";
import SafeQuery, {sql} from "../../services/SQL.js";
import mssql from "mssql";
import {buildItemEmbed, buildVendorEmbed} from "./Bungie.NET.js";
import {client} from "../../services/Discord.js";
import {MANIFEST_SEARCH} from "./DestinyManifestDatabase.js";
import {DestinyVendorDefinition} from "bungie-net-core/lib/models/index.js";

export enum NotificationTypes {
    ITEM_FOR_SALE,
    AT_SPECIFIC_TIME
}

export async function itemAvailableAtVendor(user: User, item_hash: number) {
    let item = (await MANIFEST_SEARCH.items.byHash([item_hash]))[0]

    let msg = await user.send({
        content: " ",
        embeds: [
            new EmbedBuilder()
                .setDescription("You've asked us to notify you when this item is next available at a vendor."),
            await buildItemEmbed(item, "", false)
        ],
        components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel("Cancel this notification")
                        .setCustomId("cancel_d2_notification")
                        .setStyle(ButtonStyle.Secondary)
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

export async function atSpecificTime(user: User, date: Date) {
    let msg = await user.send({
        content: " ",
        embeds: [
            new EmbedBuilder()
                .setDescription(`You've asked us to notify you at a specific time.\n<t:${Math.floor(date.getTime() / 1000)}:R>`),
        ],
        components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel("Cancel this notification")
                        .setCustomId("cancel_d2_notification")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("🗑️")
                )
        ]
    })


    await SafeQuery(sql`INSERT INTO CrashBot.dbo.D2_Notifications (type, user_discord_id, msg_id, msg_channel, not_before)
                        VALUES (1, ${user.id}, ${msg.id}, ${msg.channelId}, ${date});`)
}

export async function sendNotifications() {
    const notifications = await SafeQuery<{
        id: number,
        type: NotificationTypes,
        vendor_hash: string,
        item_hash: string,
        activity_hash: string,
        user_discord_id: string,
        msg_id: string,
        msg_channel: string,
        not_before: Date
    }>(sql`SELECT * FROM CrashBot.dbo.D2_Notifications WHERE not_before <= GETDATE();`);
    for (const notification of notifications.recordset) {
        const channel = await client.channels.fetch(notification.msg_channel) as TextBasedChannel;
        if (!channel) continue

        const embeds = [new EmbedBuilder()]
        switch (notification.type) {
            case NotificationTypes.AT_SPECIFIC_TIME:
                embeds[0]
                    .setDescription("It's time for your scheduled notification!")
                    .addFields([{name: "Time", value: `<t:${notification.not_before.getTime()}>`}]); // Replace "Scheduled Time" with the actual scheduled time
                break
            case NotificationTypes.ITEM_FOR_SALE:
                const vendors = await SafeQuery<{VendorHash: string}>(sql`SELECT VendorHash FROM dbo.DestinyVendors CROSS APPLY OPENJSON(ItemHashes) WHERE value = ${notification.item_hash}`)
                if (vendors.recordset.length === 0) continue

                console.log(typeof notification.item_hash)
                const item = (await MANIFEST_SEARCH.items.byHash([parseInt(notification.item_hash)]))[0];
                let vendorObjects: DestinyVendorDefinition[] = []
                for (let vendor of vendors.recordset) {
                    vendorObjects.push((await MANIFEST_SEARCH.vendors.byHash([parseInt(vendor.VendorHash)]))[0])
                }

                embeds[0]
                    .setTitle("NOW AVAILABLE ALERT!")
                    .setDescription(`${item.displayProperties.name} is now available at the following vendors!`)

                for (let vendor of vendorObjects) embeds.push(buildVendorEmbed(vendor, "This vendor is currently selling this item"))
        }
        console.log("HERE!", channel)
        await channel.send({ embeds });

        await SafeQuery(sql`DELETE FROM CrashBot.dbo.D2_Notifications WHERE id = ${notification.id}`);
    }
}