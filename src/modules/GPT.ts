import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import Discord, {
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    Colors,
    EmbedBuilder,
    GuildMember,
    Message,
    User
} from "discord.js";
import {
    SlashCommandBuilder,
    SlashCommandNumberOption,
    SlashCommandStringOption,
    SlashCommandUserOption
} from "@discordjs/builders";
import {askGPTQuestion} from "../utilities/askGPTQuestion.js";
import openai, {AIConversation} from "../services/ChatGPT.js";
import {removeAllMentions} from "../utilities/removeAllMentions.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {ShuffleArray} from "../misc/Common.js";
import {getUserData} from "../utilities/getUserData.js";
import {toTitleCase} from "../utilities/toTitleCase.js";
import {TWAGGER_POST_CHANNEL} from "../misc/sendTwaggerPost.js";
import OpenAI from "openai";
import {PointsModule} from "./Points.js";
import {ChatCompletionMessageParam} from "openai/resources/index";
import {RunnableToolFunction} from "openai/lib/RunnableFunction";

export class GPTModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("catchphrase")
            .setDescription("Let us take a guess at what your catchphrase is")
            .addUserOption(
                new SlashCommandUserOption()
                    .setName("user")
                    .setDescription("The user who's catchphrase you want to get")
                    .setRequired(false)
            )
            .addNumberOption(
                new SlashCommandNumberOption()
                    .setName("sample_size")
                    .setDescription("The sample size you want to use. Default is 50")
                    .setRequired(false)
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("theme")
                    .setDescription("Create a custom theme for your catchphrase")
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName("tldr")
            .setDescription("Too long, didn't read")
            .addNumberOption(
                new SlashCommandNumberOption()
                    .setName("hours")
                    .setDescription("Number of hours you'd like to look back and summarise (default; 24 hrs)")
                    .setRequired(false)
            )
    ]
    activeConversations = new Map<string, AIConversation>()

    constructor(client: Client) {
        super(client);
    }

    private generateChatGPTFunctions(msg: Message): RunnableToolFunction<any>[] {
        return [
            {
                type: "function",
                function: {
                    name: "get_points",
                    description: "Get the level and points of the current user/player",
                    parse: JSON.parse,
                    function: async ({}) => {
                        let points = await PointsModule.getPoints(msg.author.id);
                        return `Level: ${points.level}, Points: ${points.points}/${PointsModule.calculateLevelGate(points.level + 1)}`
                    },
                    parameters: {
                        type: "object",
                        properties: {}
                    }
                }
            }
        ]
    }

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (msg.author.bot || !this.client.user) return
        else if (msg.channel.type === ChannelType.DM) {
            let conversation = await AIConversation.fromSaved(msg.channelId, this.generateChatGPTFunctions(msg))
            await conversation.saveMessage({
                role: "user",
                content: msg.content,
                name: msg.author.displayName
            })
            let res = await conversation.sendToAI()
            if (res.content) msg.channel.send(res.content as string)
        }
        else if (msg.channel.type === ChannelType.PublicThread && msg.channel.parent?.id === TWAGGER_POST_CHANNEL) {
            askGPTQuestion(msg.author.username + " replied to your post saying: " + msg.content + "\nPlease reply using a short twitter-response like message", msg.channel)
        }
        else if (msg.mentions.users.has(this.client.user.id) || this.activeConversations.has(msg.channelId)) {
            let conversation = this.activeConversations.get(msg.channelId)
            if (!conversation) {
                let level = await PointsModule.getPoints(msg.author.id)
                if (level.level < 7) {
                    msg.reply(`Sorry, starting AI conversations is unlocked at level 7. You are currently level ${level.level}`)
                    return
                }

                conversation = AIConversation.new([])
                this.activeConversations.set(msg.channelId, conversation)
                conversation.on("onAIResponse", (message: ChatCompletionMessageParam) => {
                    let ai_res = message.content?.toString()
                    if (!ai_res) return
                    msg.channel.send({
                        content: ai_res,
                        allowedMentions: {
                            parse: [],
                            users: [],
                            roles: [],
                            repliedUser: false
                        },
                    })
                })
                await conversation.saveMessage({
                    role: "system",
                    content: "You are a bot by the name of `Crash Bot`. You act Gangsta and help people out within a Discord server."
                })

                setTimeout(async () => {
                    if (!conversation) return
                    await conversation.saveMessage({
                        role: "system",
                        content: "Your conversation has expired. Please say goodbye"
                    })
                    try {
                        await conversation.sendToAI()
                    } catch(e) {console.error(e)}
                    this.activeConversations.delete(msg.channelId)
                    conversation.reset()
                }, 300000)
            }

            await conversation.saveMessage({
                role: "user",
                name: msg.author.displayName,
                content: msg.content
            })
            conversation.delayedSendToAI()
        }
    }

    @InteractionChatCommandResponse("tldr")
    async onTLDR(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({fetchReply: true, ephemeral: true})
        let lookback_hours = interaction.options.getInteger("hours") || 24
        if (lookback_hours < 1) {
            interaction.editReply(`Oops. We couldn't fufill that request.`)
            return
        }

        let lookback_until = Date.now() - (lookback_hours * 60 * 60 * 1000)

        let messages: Discord.Collection<string, Discord.Message<boolean>> = new Discord.Collection([])
        let last_message: Discord.Message<boolean> | undefined
        while (messages.size < 150 || (messages.last()?.createdTimestamp || 0) >= lookback_until) {
            let new_messages = await interaction.channel?.messages.fetch({
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
        if (!messages) throw "Error while generating tldr"

        let tldr: string[] = []
        for (let message of messages) {
            tldr.push(message[1].content)
        }
        tldr = tldr.reverse().slice(0, 180)
        let gpt_response = await openai.sendMessage("Please write an overview of this conversation:\n" + JSON.stringify(tldr))
        // @ts-ignore
        interaction.editReply(removeAllMentions(gpt_response.text, interaction.channel))
    }

    @InteractionChatCommandResponse("catchphrase")
    async onCatchphrase(interaction: ChatInputCommandInteraction) {
        getUserData(interaction.member as GuildMember)
            .then(async memberData => {
                if (memberData.experimentWords === false) {
                    interaction.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                    return
                }

                let member = (interaction.options.getMember("user") || interaction.user) as User
                let sample_size = parseInt(interaction.options.getNumber("sample_size") as unknown as string) || 50
                console.log(sample_size)

                if (sample_size < 1 || sample_size > 1000) sample_size = 50
                await interaction.deferReply()
                let res = await SafeQuery(`
                        WITH WordMaxSpeaker AS (SELECT word,
                                                       discord_id,
                                                       count,
                                                       ROW_NUMBER() OVER (PARTITION BY word ORDER BY count DESC) AS RowNum
                                                FROM CrashBot.dbo.WordsExperiment),

                             WordTotalCount AS (SELECT word,
                                                       SUM(count) AS TotalCount
                                                FROM CrashBot.dbo.WordsExperiment
                                                GROUP BY word)

                        SELECT TOP ${(Math.floor(sample_size * 1.5))} WMS.word                                                     AS 'word',
                                                                      WMS.count                                                    AS 'count',
                                                                      WTC.TotalCount                                               AS 'totalCount',
                                                                      CAST(WMS.count AS DECIMAL(5, 2)) / NULLIF(WTC.TotalCount, 0) AS percentage
                        FROM WordMaxSpeaker AS WMS
                                 JOIN WordTotalCount AS WTC ON WMS.word = WTC.word
                        WHERE RowNum = 1
                          AND discord_id = @discordid
                          AND WTC.TotalCount >= @totalcountcap
                        ORDER BY Percentage DESC`, [
                    {name: "discordid", type: mssql.TYPES.VarChar(100), data: (member.id || "")},
                    {name: "totalcountcap", type: mssql.TYPES.Int(), data: 20}
                ])
                const max = sample_size < 50 ? sample_size : 50
                for (let i = 0; i < 4; i++) {
                    console.log(i, res.recordset.length)
                    if (res.recordset.length >= max) break
                    res = await SafeQuery(`
                            WITH WordMaxSpeaker AS (SELECT word,
                                                           discord_id,
                                                           count,
                                                           ROW_NUMBER() OVER (PARTITION BY word ORDER BY count DESC) AS RowNum
                                                    FROM CrashBot.dbo.WordsExperiment),

                                 WordTotalCount AS (SELECT word,
                                                           SUM(count) AS TotalCount
                                                    FROM CrashBot.dbo.WordsExperiment
                                                    GROUP BY word)

                            SELECT TOP ${(Math.floor(sample_size * 1.5))} WMS.word                                                     AS 'word',
                                                                          WMS.count                                                    AS 'count',
                                                                          WTC.TotalCount                                               AS 'totalCount',
                                                                          CAST(WMS.count AS DECIMAL(5, 2)) / NULLIF(WTC.TotalCount, 0) AS percentage
                            FROM WordMaxSpeaker AS WMS
                                     JOIN WordTotalCount AS WTC ON WMS.word = WTC.word
                            WHERE RowNum = 1
                              AND discord_id = @discordid
                              AND WTC.TotalCount >= @totalcountcap
                            ORDER BY Percentage DESC`, [
                        {name: "discordid", type: mssql.TYPES.VarChar(100), data: (member.id || "")},
                        {name: "totalcountcap", type: mssql.TYPES.Int(), data: (3 - i) * 5}
                    ])
                }
                console.log(res.recordset.length)

                //     return SafeQuery("SELECT TOP " + (sample_size * 1.5) + " word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                //         // @ts-ignore
                //     ])
                // })
                // if (res?.recordset.length < 20) {
                //     interaction.editReply("We don't quite have enough data yet. Keep talking and we'll be able to tell you.")
                //     return
                // }
                let top: {
                    word: string,
                    count: number,
                    totalCount: number,
                    percentage: number
                }[] = ShuffleArray(res.recordset).slice(0, sample_size).map((i: any) => {
                    return {
                        word: toTitleCase(i.word),
                        count: i.sum,
                        totalCount: i.totalCount,
                        percentage: i.percentage
                    }
                })
                let prompt = "Using some of these words, create a catchphrase. Extra words can be added. I've also included a counter for each word, to indicate how often the word has been used before and how unique it is compared to all uses from all people."
                if (interaction.options.getString("theme")) prompt += "\nThe catchphrase must be based around this theme:" + interaction.options.getString("theme")
                openai.sendMessage(
                    prompt + "\n\n" +
                    top.map(i => `${i.word} (${i.count}, uniqueness: ${i.percentage * 100})`).join(", ")
                )
                    .then(AIres => {
                        let embed = new EmbedBuilder()
                        // console.log("Using some of these words, create a catchphrase. Extra words can be added. I've also included a counter for each word, to indicate how often the word has been used before.\n\n" +

                        //     top.map(i => `${i.word} (${i.count})`).join(", "))

                        embed.setTitle("Is this your catchphrase?")
                        embed.setDescription("<@" + member + "> - " + AIres.text)
                        embed.setFooter({text: "Crashbot words experiment"})
                        if (interaction.options.getString("theme")) embed.addFields([{
                            name: "Theme",
                            value: interaction.options.getString("theme") || "no theme provided"
                        }])
                        interaction.editReply({
                            content: " ", embeds: [embed, new EmbedBuilder()
                                .setDescription("Sampled words: " + top.sort((a, b) => {
                                    return a.percentage < b.percentage ? 1 : -1
                                }).map(i => `${i.word} \`${Math.round(i.percentage * 100)}%\``).join(", "))
                            ]
                        })
                    })
                    .catch(e => {
                        console.log(e)
                        let embed = new EmbedBuilder()
                        embed.setTitle("Service unavailable")
                        embed.setDescription("This service is currently unavailable. Please try again later")
                        embed.setColor(Colors.Red)
                        embed.setFooter({text: "Crash Bot words experiment"})
                        interaction.editReply({content: " ", embeds: [embed]})
                    })
            })
    }
}