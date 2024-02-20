import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {BaseGuildTextChannel, Client, EmbedBuilder, Message, TextBasedChannel, TextChannel} from "discord.js";
import SafeQuery, {SafeTransaction, sql} from "../services/SQL.js";

export class PointsModule extends BaseModule {
    // This set is used to prevent users from being able to spam and get additional points.
    // Every time a user gains points from a message, their ID goes in here.
    // While their ID is in here, they cannot gain points again until it is removed.
    // The array is reset every 5mins
    userMessagesOnCooldown= new Set<string>()

    constructor(client: Client) {
        super(client);
        setInterval(() => {
            this.userMessagesOnCooldown.clear()
        }, 300000)
    }

    async grantPoints(userDiscordId: string, points: number, responseChannel: TextBasedChannel) {
        let res= await SafeQuery<{
            points: number,
            level: number
        }>
        (sql`UPDATE Users SET points=points + ${points} WHERE discord_id = ${userDiscordId};
SELECT points, level FROM Users WHERE discord_id = ${userDiscordId}`)
        console.log(res)

        let user = res.recordset[0]
        if (!user) return
        if (user.points >= (user.level + 1) * 10) {
            await SafeQuery(sql`UPDATE Users SET points=0, level=level+1 WHERE discord_id = ${userDiscordId}`)
            let discord_user =
                responseChannel instanceof BaseGuildTextChannel ?
                    await responseChannel.guild.members.fetch(userDiscordId) :
                    await this.client.users.fetch(userDiscordId)
            let embed = new EmbedBuilder()
            embed.setTitle(`🥳 Level up!`)
            embed.setDescription(`<@${userDiscordId}> just leveled up to level ${user.level + 1}!`)
            embed.setThumbnail(discord_user.displayAvatarURL())
            responseChannel.send({embeds: [embed]})
        }

    }

    @OnClientEvent("messageCreate", this)
    async onMessageCreate(msg: Message) {
        if (msg.author.bot) return
        else if (this.userMessagesOnCooldown.has(msg.author.id)) return
        this.userMessagesOnCooldown.add(msg.author.id)
        await this.grantPoints(msg.author.id, 1, msg.channel)
    }
}