import {Collection, EmbedBuilder, Message, TextChannel} from "discord.js";
import openai from "../services/ChatGPT/ChatGPT.js";
import {client} from "../services/Discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";

const TWAGGER_SOURCE_CHANNELS = [
    "909751055783440419", // SPAM
    "892518159167393823", // MEMES
    "897398044411199578", // SHITPOSTS,
    "892518159167393823", // GENERAL,
    "931297441448345660", // ART & CREATIONS,
    "935472869129990154", // DUNGEON
]
export const TWAGGER_POST_CHANNEL = "1155107674967527527"

export async function sendTwaggerPost() {
    let lookback_hours = 48
    let lookback_until = Date.now() - (lookback_hours * 60 * 60 * 1000)

    let messages: Collection<string, Message<boolean>> = new Collection([])
    let last_message: Message<boolean> | undefined
    while (messages.size < 150 || (messages.last()?.createdTimestamp || 0) >= lookback_until) {
        let channel = await client.channels.fetch(TWAGGER_SOURCE_CHANNELS[Math.floor(Math.random() * TWAGGER_SOURCE_CHANNELS.length)]) as TextChannel
        if (!channel) throw new Error("Could not find channel")
        let new_messages = await channel.messages.fetch({
            limit: 100,
            before: last_message?.id
        })
        if (!new_messages) break
        last_message = new_messages.last()
        messages = messages.concat(new_messages.filter(i => i.content !== "" && i.createdTimestamp >= lookback_until))
        if (new_messages.find(i => i.createdTimestamp >= lookback_until)) break
        console.log(messages.size)
        console.log(messages.last()?.createdTimestamp, lookback_until)
        if (new_messages.size < 100) break
    }
    if (!messages || messages.size === 0) throw "Error while generating tldr"

    let tldr: string[] = []
    for (let message of messages) {
        tldr.push(message[1].content)
    }
    tldr = tldr.reverse().slice(0, 180)
    // let gpt_response = await ChatGPT.sendMessage("Please write an overview of this conversation:\n" + JSON.stringify(tldr))
    let gpt_response = await openai.sendMessage("Create a twitter post based around this conversation that is either heart warming, controversial, spiteful, or anything else that would make it feel more like a twitter post:\n" + JSON.stringify(tldr));
    // @ts-ignore
    // interaction.editReply(removeAllMentions(gpt_response.text, interaction.channel))
    const out_channel = (await client.channels.fetch(TWAGGER_POST_CHANNEL) as TextChannel)
    if (!out_channel) throw new Error("Could not find social post channel")
    let message = await out_channel.send({
        content: " ",
        embeds: [
            new EmbedBuilder()
                .setAuthor({iconURL: client.user?.avatarURL() || "", name: "CrashBot4Ever"})
                .setDescription(gpt_response.text)
                .setFooter({text: "Posted on Twagger"})
        ]
    });
    let thread = await message.startThread({
        name: gpt_response.text.slice(0, 10) + "...",
        autoArchiveDuration: 4320,
        reason: "Reply to this twitter post!"
    })
    await SafeQuery("UPDATE dbo.GPTChannels SET lastmessageid=@messageid WHERE channelid = @channelid", [
        {name: "channelid", type: mssql.TYPES.VarChar(100), data: thread.id},
        {name: "messageid", type: mssql.TYPES.VarChar(100), data: gpt_response.parentMessageId || ""}
    ])
}
