import {ChatInputCommandInteraction, EmbedBuilder, TextBasedChannel} from "discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {removeAllMentions} from "./removeAllMentions.js";
import openai from "../services/ChatGPT.js";
import {splitMessage} from "./splitMessage.js";

export async function askGPTQuestion(message: string, channel: TextBasedChannel, interaction?: ChatInputCommandInteraction) {
    console.log(message)

    let gpt_channel_search = await SafeQuery("SELECT * FROM dbo.GPTCHannels WHERE channelid = @channelid", [
        {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id}
    ])
    if (interaction) await interaction.deferReply()
    else await channel.sendTyping();
    message = removeAllMentions(message, channel)

    let result_message
    if (message.toLowerCase().endsWith("reset conversation") && gpt_channel_search.recordset.length === 0) {
        result_message = "There is no conversation to reset"
    }
    else if (gpt_channel_search.recordset.length === 0) {
        let gpt_message = await openai.sendMessage(message)
        console.log(gpt_message)
        await SafeQuery("INSERT INTO CrashBot.dbo.GPTChannels (channelid, conversationid, lastmessageid) VALUES (@channelid, @conversationid, @messageid);", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
            {name: "conversationid", type: mssql.TYPES.VarChar(100), data: gpt_message.conversationId || ""},
            {name: "messageid", type: mssql.TYPES.VarChar(100), data: gpt_message.parentMessageId || ""}
        ])
        result_message = gpt_message.text
    }
    else if (message.toLowerCase().endsWith("reset conversation")) {
        await SafeQuery("DELETE FROM dbo.GPTChannels WHERE channelid = @channelid", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
        ])
        result_message = "This conversation has been reset"
    }
    else {
        let gpt_message = await openai.sendMessage(message, {
            parentMessageId: gpt_channel_search.recordset[0].lastmessageid
        })
        await SafeQuery("UPDATE dbo.GPTChannels SET lastmessageid=@messageid WHERE channelid = @channelid", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
            {name: "messageid", type: mssql.TYPES.VarChar(100), data: gpt_message.parentMessageId || ""}
        ])

        result_message = gpt_message.text
    }

    let interaction_replied = false
    for (let text of splitMessage(result_message)) {
        if (interaction && !interaction_replied) {
            await interaction.editReply({
                content: " ",
                embeds: [new EmbedBuilder()
                    .setDescription(message)
                ]
            })
            interaction_replied = true
        }
    }
}