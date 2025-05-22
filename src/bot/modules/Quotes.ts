import {BaseModule, ContextMenuCommandInteractionResponse, OnClientEvent} from "./BaseModule.js";
import {
    ApplicationCommandType,
    Client,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    EmbedBuilder,
    Message
} from "discord.js";
import SafeQuery, {sql} from "../../services/SQL.js";
import mssql from "mssql";
import {getUserData} from "../utilities/getUserData.js";
import {AIConversation} from "../../services/ChatGPT/ChatGPT.js";

const QUOTE_CHANNELS = ["910649212264386583", "892518396166569994"]

export class QuotesModule extends BaseModule {
    constructor(client: Client) {
        super(client);
    }

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (!QUOTE_CHANNELS.includes(msg.channelId)) return
        if (msg.content.replace(/[^"“”‘’]/g, "").length < 2) return
    }

    async respondToQuote(msg: Message) {
        await SafeQuery(sql`INSERT INTO dbo.Quotes (msg_id, quote)
                            VALUES (${msg.id}, ${msg.content})`)
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
            let conversation = AIConversation.new()
            conversation.appendMessage({
                role: "system",
                content: "respond to this quote in a funny way. 18+ humour is ok, if appropriate:\n\n" +
                    msg.content
            })
            let AIres = await conversation.sendToAIAndWait()
            let embed = new EmbedBuilder()
            embed.setDescription(AIres.content?.toString() ?? "No response from AI.")
            void msg.reply({content: "", embeds: [embed]})
        }
        return ai
    }

    @ContextMenuCommandInteractionResponse("AI quote response", new ContextMenuCommandBuilder()
        .setName("AI quote response")
        .setType(ApplicationCommandType.Message)
    )
    async selectMenuInteraction(interaction: ContextMenuCommandInteraction) {
        let msg = await interaction.channel?.messages.fetch(interaction.targetId)
        if (!msg) {
            await interaction.reply({content: "An error occured while fetching that message", ephemeral: true})
            return false
        }
        let didRespond = await this.respondToQuote(msg)
        if (didRespond) void interaction.reply({content: "Successfully generated a quote.", ephemeral: true})
        else void interaction.reply({
            ephemeral: true,
            content: "Failed to generate a quote. One or more of the users mentioned in this quote may have ai quote responses disabled."
        })
    }
}
