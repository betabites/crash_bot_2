import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Client, Message} from "discord.js";
import SafeQuery, {SafeTransaction, sql} from "../services/SQL.js";

export class PointsModule extends BaseModule {
    constructor(client: Client) {
        super(client);
    }

    async grantPoints(userDiscordId: string, points: number) {
        await SafeQuery(sql`UPDATE Users SET points=points + ${points} WHERE discord_id = ${userDiscordId}`)
    }

    @OnClientEvent("messageCreate", this)
    async onMessageCreate(msg: Message) {
        await this.grantPoints(msg.author.id, 1)
    }
}