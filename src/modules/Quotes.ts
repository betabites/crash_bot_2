import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Client, EmbedBuilder, Message} from "discord.js";
import SafeQuery, {sql} from "../services/SQL.js";
import mssql from "mssql";
import {getUserData} from "../utilities/getUserData.js";
import openai from "../services/ChatGPT.js";

const QUOTE_CHANNELS = ["910649212264386583", "892518396166569994"]
export class QuotesModule extends BaseModule {
    constructor(client: Client) {
        super(client);
    }

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (!QUOTE_CHANNELS.includes(msg.channelId)) return
        if (msg.content.replace(/[^"“”‘’]/g, "").length < 2) return

        await SafeQuery(sql`INSERT INTO dbo.Quotes (msg_id, quote) VALUES (${msg.id},${msg.content})`)
        msg.react("🫃")

        // Check to see if all users have 'quoteresponseai' enabled
        let users: string[] = ([] as string[]).concat(Array.from(msg.mentions.users.values()).map(u => u.id), msg.member?.id || "")
        let ai = true
        for (let id of users) {
            console.log(id)
            let req = await SafeQuery(`SELECT experimentAIQuoteResponse
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
                name: "discordid",
                type: mssql.TYPES.VarChar(20),
                data: id
            }])
            let user = await getUserData(id)

            if (user["experimentAIQuoteResponse"] === false) {
                console.log(req.recordset[0])
                ai = false
                break
            }
        }

        if (ai) {
            console.log("AI responding...")
            let AIres = await openai.sendMessage(
                "respond to this quote in a funny way:\n\n" +
                msg.content
            )
            let embed = new EmbedBuilder()
            embed.setDescription(AIres.text)
            msg.reply({embeds: [embed]})
        }
    }
}
