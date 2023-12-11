import {BaseModule, OnClientEvent, InteractionCommandResponse} from "./BaseModule.js";
import Discord, {Client, CommandInteraction, GuildMember, Message, User} from "discord.js";
import {SlashCommandBuilder, SlashCommandStringOption, SlashCommandNumberOption, SlashCommandUserOption} from "@discordjs/builders";
import {askGPTQuestion} from "../utilities/askGPTQuestion.js";
import ChatGPT from "../misc/ChatGPT.js";
import {removeAllMentions} from "../utilities/removeAllMentions.js";
import SafeQuery from "../misc/SQL.js";
import mssql from "mssql";
import {ShuffleArray} from "../misc/Common.js";
import {getUserData} from "../utilities/getUserData.js";
import {toTitleCase} from "../utilities/toTitleCase.js";

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
            .setName("ask-gpt")
            .setDescription("Ask ChatGPT a question")
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("message")
                    .setDescription("What would you like to ask ChatGPT?")
                    .setRequired(true)
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

    constructor(client: Client) {
        super(client);
        console.log("Bound client")
    }

    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        console.log("New message!")
    }

    @InteractionCommandResponse("ask-gpt")
    onAskGPT(interaction: CommandInteraction) {
        if (!interaction.channel) {
            interaction.reply("Oops! Plase try again in a different channel")
            return
        }
        askGPTQuestion(interaction.user.username + " said: " + (interaction.options.getString("message") || ""), interaction.channel, interaction)
    }

    @InteractionCommandResponse("tldr")
    async onTLDR(interaction: CommandInteraction) {
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
        let gpt_response = await ChatGPT.sendMessage("Please write an overview of this conversation:\n" + JSON.stringify(tldr))
        // @ts-ignore
        interaction.editReply(removeAllMentions(gpt_response.text, interaction.channel))
    }

    @InteractionCommandResponse("catchphrase")
    async onCatchphrase(interaction: CommandInteraction) {
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
                ChatGPT.sendMessage(
                    prompt + "\n\n" +
                    top.map(i => `${i.word} (${i.count}, uniqueness: ${i.percentage * 100})`).join(", ")
                )
                    .then(AIres => {
                        let embed = new Discord.MessageEmbed()
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
                            content: " ", embeds: [embed, new Discord.MessageEmbed()
                                .setDescription("Sampled words: " + top.sort((a, b) => {
                                    return a.percentage < b.percentage ? 1 : -1
                                }).map(i => `${i.word} \`${Math.round(i.percentage * 100)}%\``).join(", "))
                            ]
                        })
                    })
                    .catch(e => {
                        console.log(e)
                        let embed = new Discord.MessageEmbed()
                        embed.setTitle("Service unavailable")
                        embed.setDescription("This service is currently unavailable. Please try again later")
                        embed.setColor("RED")
                        embed.setFooter({text: "Crash Bot words experiment"})
                        interaction.editReply({content: " ", embeds: [embed]})
                    })
            })
    }
}