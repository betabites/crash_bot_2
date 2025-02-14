import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {
    AttachmentBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    Collection,
    Colors,
    EmbedBuilder,
    GuildMember,
    Message,
    TextBasedChannel,
    User
} from "discord.js";
import {
    SlashCommandBuilder,
    SlashCommandNumberOption,
    SlashCommandStringOption,
    SlashCommandSubcommandBuilder,
    SlashCommandUserOption
} from "@discordjs/builders";
import {askGPTQuestion} from "../utilities/askGPTQuestion.js";
import openai, {AIConversation, generateAIImage, UnsavedAIConversation} from "../services/ChatGPT.js";
import SafeQuery, {sql, UNSAFE_SQL_PARAM} from "../services/SQL.js";
import mssql from "mssql";
import {ShuffleArray} from "../misc/Common.js";
import {getUserData} from "../utilities/getUserData.js";
import {toTitleCase} from "../utilities/toTitleCase.js";
import {TWAGGER_POST_CHANNEL} from "../misc/sendTwaggerPost.js";
import {PointsModule} from "./Points.js";
import {RunnableToolFunction} from "openai/lib/RunnableFunction";
import {Character, OnSpeechModeAdjustmentComplete} from "./Speech.js";
import {GPTTextChannel} from "./GPTTextChannel.js";

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
            .setName("catchphrase2")
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
            .addBooleanOption((o) => o
                .setName("descriptions")
                .setRequired(false)
                .setDescription("Include topic descriptions")
            )
            .addBooleanOption((o) => o
                .setName("timestamps")
                .setRequired(false)
                .setDescription("Include the time ranges of each topic")
            )
            .addBooleanOption((o) => o
                .setName("participants")
                .setRequired(false)
                .setDescription("Include the participants of each topic")
            )
            .addNumberOption((o) => o
                .setName("hours")
                .setMaxValue(1)
                .setMinValue(100)
                .setRequired(false)
                .setDescription("The number of hours to look back for topics")
            ),
        new SlashCommandBuilder()
            .setName("become_a_111_operator")
            .setDescription("Simulate a bullshit 111 call, with you as the operator"),
        new SlashCommandBuilder()
            .setName('combine')
            .setDescription('Combine two users into one')
            .addUserOption(option => option
                .setName('user1')
                .setDescription('First user')
                .setRequired(true)
            )
            .addUserOption(option => option
                .setName('user2')
                .setDescription('Second user')
                .setRequired(true)
            ),
        new SlashCommandSubcommandBuilder()
            .setName("topgear")
            .setDescription("Introduce Re-Flesh, as if we're all presenters in TopGear")
    ]
    activeConversations = new Map<string, GPTTextChannel>()

    constructor(client: Client) {
        super(client);
    }

    private generateChatGPTFunctions(msg: Message, mutateResultMessage: (type: "attachment", data: string) => void) {
        let funcs: RunnableToolFunction<any>[] = [
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
            },
            {
                type: "function",
                function: {
                    name: "attach_meme",
                    description: "Attach a meme/post from Reddit to your next message. Only used when explicitly asked for",
                    parse: JSON.parse,
                    function: async ({subreddit, allowNSFW, count}: {subreddit?: string, allowNSFW: boolean, count?: number}) => {
                        if (!count) count = 1

                        let endpoint = subreddit
                            ? `http://meme-api.com/gimme/${subreddit.replace("r/", "")}/${count}`
                            : `http://meme-api.com/gimme/${count}`
                        let refleshGuild = this.client.guilds.cache.get("892518158727008297")
                        let allowNSFWForThisUser = false

                        let req = await fetch(endpoint)
                        let res: Partial<{
                            memes: {
                                postLink: string,
                                subreddit: string,
                                title: string,
                                url: string,
                                nsfw: boolean,
                                spoiler: boolean,
                                author: string,
                                ups: number,
                                preview: string[]
                            }[]
                        }> = await req.json()

                        let results: { title: string, url: string }[] = []
                        for (let meme of res.memes ?? []) {
                            if (meme.nsfw && !allowNSFW) {
                                console.log("NSFW meme disallowed: GPT did not ask for nsfw")
                                return "Fetched meme was NSFW"
                            }
                            if (meme.nsfw && !allowNSFWForThisUser) {
                                // Check that the user has the relevant nsfw role
                                try {
                                    let member = await refleshGuild?.members.fetch(msg.author.id)
                                    allowNSFWForThisUser = !!member?.roles.cache.has("957575439214313572")
                                }
                                catch(e) {
                                    console.error(e)
                                }

                                if (!allowNSFWForThisUser) {
                                    console.log("NSFW meme disallowed: User does not have required discord role")
                                    return "This user is not permitted to access NSFW content"
                                }
                            }
                            if (meme.nsfw && msg.channel.type !== ChannelType.DM && (msg.channel.type !== ChannelType.GuildText || !msg.channel.nsfw)) {
                                console.log("NSFW meme disallowed: Cannot send in a non-nsfw guild channel")
                                return "Cannot send NSFW content in this channel"
                            }
                            results.push({title: meme.title, url: meme.url})
                        }

                        for (let item of results) mutateResultMessage("attachment", item.url)
                        return "Fetched memes with the following names. Will automatically attach these memes to your next message; " + JSON.stringify(results.map(i => i.title))
                    },
                    parameters: {
                        type: "object",
                        properties: {
                            subreddit: {
                                type: "string"
                            },
                            allowNSFW: {
                                type: "boolean"
                            },
                            count: {
                                type: "number",
                                minimum: 1,
                                maximum: 10
                            }
                        },
                        required: ["allowNSFW"]
                    }
                }
            }
        ]
        if (msg.channel.type === ChannelType.DM) {
            funcs.push({
                type: "function",
                function: {
                    name: "clear",
                    description: "Delete all saved messages",
                    parse: JSON.parse,
                    function: async () => {
                        let channel = msg.channel
                        if (channel.type !== ChannelType.DM) return "failed"
                        let messages = await channel.messages.fetch({limit: 100})
                        while (true) {
                            for (let message of messages) {
                                if (message[1].deletable) await message[1].delete()
                            }
                            if (messages.size >= 100) await channel.messages.fetch({limit: 100})
                        }
                        return "done"
                    },
                    parameters: {
                        type: "object",
                        properties: {}
                    }
                }
            })
        }
        return funcs
    }

    @OnSpeechModeAdjustmentComplete()
    async onMessage([msg]: [Message], messageContent: string, character: Character | null) {
        if ((msg.author.bot && !msg.webhookId) || !this.client.user) return
        else if (msg.channel.type === ChannelType.PublicThread && msg.channel.parent?.id === TWAGGER_POST_CHANNEL) {
            askGPTQuestion(msg.author.username + " replied to your post saying: " + msg.content + "\nPlease reply using a short twitter-response like message", msg.channel)
        }
        else if (msg.mentions.users.has(this.client.user.id) || this.activeConversations.has(msg.channelId) || msg.channel.type === ChannelType.DM) {
            console.log("HERE!")
            let conversation = this.activeConversations.get(msg.channelId) as GPTTextChannel
            if (msg.content === "reset") {
                await conversation.reset()
                void msg.reply("Crash Bot's memory has been reset")
                this.activeConversations.delete(msg.channelId)
                return
            }

            if (!conversation) {
                let level = await PointsModule.getPoints(msg.author.id)
                if (level.level < 7 && msg.author.id !== "404507305510699019") {
                    msg.reply(`Sorry, starting AI conversations is unlocked at level 7. You are currently level ${level.level}`)
                    return
                }

                conversation = await this.#getConversationForChannel(msg.channel)
            }

            void conversation.processMessage([msg], messageContent, character)
        }
    }

    async #getConversationForChannel(channel: TextBasedChannel) {
        let conversation = this.activeConversations.get(channel.id)
        if (conversation) return conversation

        conversation = await GPTTextChannel.load(channel, this.client)
        this.activeConversations.set(channel.id, conversation)
        return conversation
    }

    @InteractionChatCommandResponse("tldr")
    async onTLDR(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({fetchReply: true, ephemeral: true})
        let lookback_hours = interaction.options.getNumber("hours") ?? 24
        let includeDescriptions = interaction.options.getBoolean("descriptions") ?? false
        let includeTimestamps = interaction.options.getBoolean("timestamps") ?? true
        let includeParticipants = interaction.options.getBoolean("participants") ?? false
        if (lookback_hours < 1) {
            interaction.editReply(`Oops. We couldn't fufill that request.`)
            return
        }

        let lookback_until = Date.now() - (lookback_hours * 60 * 60 * 1000)

        let messages: Collection<string, Message<boolean>> = new Collection([])
        let last_message: Message<boolean> | undefined
        while (messages.size < 150 || (messages.last()?.createdTimestamp || 0) >= lookback_until) {
            let new_messages = await interaction.channel?.messages.fetch({
                limit: 100,
                before: last_message?.id
            })
            if (!new_messages) break
            console.log("messages", new_messages.size, last_message?.createdTimestamp, lookback_until)
            last_message = new_messages.last()
            // last_message?.toJSON(
            // messages = messages.concat(new_messages.filter(i => i.content !== "" && i.createdTimestamp >= lookback_until))
            messages = messages.concat(new_messages)
            if (new_messages.find(i => i.createdTimestamp >= lookback_until)) break
            console.log(messages.size)
            console.log(messages.last()?.createdTimestamp, lookback_until)
            if (new_messages.size < 100) break
        }
        console.log(messages.size)
        if (!messages) throw "Error while generating tldr"
        if (messages.size === 0) {
            void interaction.editReply(`There's nothing to summarise here. Try increasing the timeframe.`)
            return
        }

        // let tldr: {content: string, unixTime: number, userId: string | null, username: string | null}[] = []
        // for (let message of messages) {
        //     tldr.push({
        //         content: message[1].content,
        //         userId: message[1].member?.id || null,
        //         username: message[1].member?.displayName || null,
        //         unixTime: Math.round(message[1].createdTimestamp / 1000)
        //     })
        // }

        // tldr = tldr.reverse().slice(0, 180)
        // console.log(JSON.stringify(messages.reverse().map(m => m.toJSON())))
        await interaction.editReply({content: "Using AI to summarise..."})
        let conversation = new UnsavedAIConversation([
            {role: "system", content: `You are a helpful assistant. You are to split this conversation as such <T><Title>Topic here</Title><Category>See 'category cheatsheet' section</Category><Start>UNIX number for when it started</Start><End>UNIX number for when it ended</End><Description></Description><UserId>Repeat this element once for each participant in this topic. DO NOT INCLUDE IF PARTICIPANT ID IS UNKNOWN</UserId><UserId>...</UserId><UserId>...</UserId></T>. You must provide the most accurate interpretation as possible. Regardless what the conversation is about.
Category cheatsheet:
Hostile/Emotional  
PSA
Informational/Educational  
Casual/Friendly Chat  
Inspirational/Motivational  
Warning/Emergency  
Celebratory/Happy  
Neutral/General  
Technology/Innovation  
Sad/Sympathy-Focused  
Humorous/Jokes
`},
            {role: "user", content: JSON.stringify(messages.reverse().map(m => ({
                    content: m.content,
                    author: m.author.id,
                    username: m.member?.displayName || m.author.displayName,
                    createdTimestamp: Math.round(m.createdTimestamp / 1000),
                    attachments: m.attachments
                })))},
        ])
        let res = await conversation.sendToAI()

        // let gpt_response = await openai.sendMessage("Please write an overview of this conversation:\n" + JSON.stringify(tldr))
        // @ts-ignore

        // Parse the response
        const regex = /<T>([\s\S]*?)<\/T>/g;
        const titleRegex = /<Title>([\s\S]*?)<\/Title>/; // Matches <Title>...</Title>
        const descRegex = /<Description>([\s\S]*?)<\/Description>/;
        const startRegex = /<Start>([\s\S]*?)<\/Start>/;
        const endRegex = /<End>([\s\S]*?)<\/End>/;
        const userIdRegex = /<UserId>([\s\S]*?)<\/UserId>/;
        const categoryRegex = /<Category>([\s\S]*?)<\/Category>/;

        const topics: EmbedBuilder[] = []
        const matches = (res.content?.toString() ?? "").matchAll(regex);
        for (let match of matches) {
            const titleMatch = titleRegex.exec(match[1]);
            const descMatch = descRegex.exec(match[1]);
            const startMatch = startRegex.exec(match[1]);
            const endMatch = endRegex.exec(match[1]);
            const categoryMatch = categoryRegex.exec(match[1]);
            let usersMatch = userIdRegex.exec(match[1]);
            if (!titleMatch || !descMatch || !startMatch || !endMatch || !categoryMatch) continue;

            let embed = new EmbedBuilder()
                .setTitle(titleMatch[1])
                .setFooter({text: categoryMatch[1].toString()})
            switch (categoryMatch?.[1]) {
                case "Hostile/Emotional":
                    embed.setColor("#FF0000")
                    break
                case "PSA":
                    embed.setColor("#007BFF")
                    break
                case "Informational/Educational":
                    embed.setColor("#28A745")
                    break
                case "Casual/Friendly Chat":
                    embed.setColor("#FFC107")
                    break
                case "Inspirational/Motivational":
                    embed.setColor("#FF8800")
                    break
                case "Warning/Emergency":
                    embed.setColor("#C82333")
                    break
                case "Celebratory/Happy":
                    embed.setColor("#FFD700")
                    break
                case "Neutral/General":
                    embed.setColor("#6C757D")
                    break
                case "Technology/Innovation":
                    embed.setColor("#20C997")
                    break
                case "Sad/Sympathy-Focused":
                    embed.setColor("#6F42C1")
                    break
                case "Humorous/Jokes":
                    embed.setColor("#FFEB3B")
                    break
            }
            let bodyParts: string[] = []
            if (includeDescriptions) bodyParts.push(descMatch[1])
            if (includeTimestamps) bodyParts.push(`<t:${startMatch[1]}:R> until <t:${endMatch[1]}:R>`)
            if (includeParticipants && usersMatch && Array.isArray(usersMatch) && usersMatch.length > 1) {
                let usersDeDuped = [...new Set(usersMatch.map(i => i.match(/\d+/g)?.[0] ?? "unknown"))]
                embed.addFields({
                    name: "Participants",
                    value: usersDeDuped.map(i => `<@${i.match(/\d+/g)?.[0]}>`).join(", ")
                })
            }
            if (bodyParts.length > 0) embed.setDescription(bodyParts.join("\n\n"))
            topics.push(embed)
        }

        if (topics.length > 10) {
            void interaction.editReply({
                content: "",
                embeds: [
                    new EmbedBuilder()
                        .setDescription("Too many topics to display, so we're only showing the most recent 9."),
                    ...topics.slice(topics.length - 9, topics.length)
                ]
            })
        } else {
            void interaction.editReply({
                content: "",
                embeds: topics
            })
        }
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
                                                   last_appeared,
                                                   ROW_NUMBER() OVER (PARTITION BY word ORDER BY count DESC) AS RowNum
                                            FROM CrashBot.dbo.WordsExperiment),

                         WordTotalCount AS (SELECT word,
                                                   SUM(count) AS TotalCount
                                            FROM CrashBot.dbo.WordsExperiment
                                            GROUP BY word)

                    SELECT TOP ${(Math.floor(sample_size * 1.5))} WMS.word                                                      AS 'word',
                                                                  WMS.count                                                     AS 'count',
                                                                  WTC.TotalCount                                                AS 'totalCount',
                                                                  CAST(WMS.count AS DECIMAL(10, 2)) / NULLIF(WTC.TotalCount, 0) AS percentage
                    FROM WordMaxSpeaker AS WMS
                             JOIN WordTotalCount AS WTC ON WMS.word = WTC.word
                    WHERE discord_id = @discordid
                      AND last_appeared >= DATEADD(MONTH, -3, GETDATE())
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

                        SELECT TOP ${(Math.floor(sample_size * 1.5))} WMS.word                                                      AS 'word',
                                                                      WMS.count                                                     AS 'count',
                                                                      WTC.TotalCount                                                AS 'totalCount',
                                                                      CAST(WMS.count AS DECIMAL(10, 2)) / NULLIF(WTC.TotalCount, 0) AS percentage
                        FROM WordMaxSpeaker AS WMS
                                 JOIN WordTotalCount AS WTC ON WMS.word = WTC.word
                        WHERE discord_id = @discordid
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

    async getTopWords(discordId: string, sampleSize: number = 50) {
        let res = await SafeQuery<{
            word: string,
            count: number,
            userUniqueness: number,
            daysSinceUsed: number
        }>(sql`
                    SELECT TOP ${UNSAFE_SQL_PARAM(Math.round(sampleSize * 1.5))} word                                              AS 'word',
                                                                                  count                                             AS 'count',
                                                                                  CAST(count as DECIMAL(10, 2)) /
                                                                                  (SELECT SUM(count)
                                                                                   FROM CrashBot.dbo.WordsExperiment
                                                                                   WHERE WMS.discord_id = ${discordId})             AS 'userUniqueness',
                                                                                  CAST(last_appeared - (GETDATE() - 90) AS TINYINT) AS 'daysSinceUsed'
                    FROM CrashBot.dbo.WordsExperiment AS WMS
                    WHERE discord_id = ${discordId}
                      AND WMS.word NOT IN (SELECT stopword FROM EnglishStopWords)
                      AND DATEADD(MONTH, -3, GETDATE()) < WMS.last_appeared
                    ORDER BY userUniqueness DESC
                `)

        let top: {
            word: string,
            percentage: number
        }[] = ShuffleArray(res.recordset).slice(0, sampleSize).map((i) => {
            return {word: i.word, percentage: i.userUniqueness}
        })
        return top
    }

    @InteractionChatCommandResponse("catchphrase2")
    async onCatchphrase2(interaction: ChatInputCommandInteraction) {
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

                let top = await this.getTopWords(member.id)
                let conversation = AIConversation.new()
                let theme = interaction.options.getString("theme")
                await conversation.saveMessage({
                    role: "system",
                    content: `These words have been programmatically determined as a given users most common words. Use these words to create a suitable catchphrase. Swears ARE OK!`
                })
                if (theme) {
                    await conversation.saveMessage({
                        role: "system",
                        content: `The catchphrase must match this theme: ${theme}`
                    })
                }
                await conversation.saveMessage({
                    role: 'system',
                    content: "words: " + top.map(i => i.word).join(", ")
                })
                let response = await conversation.sendToAI()
                let embed = new EmbedBuilder()
                // console.log("Using some of these words, create a catchphrase. Extra words can be added. I've also included a counter for each word, to indicate how often the word has been used before.\n\n" +

                //     top.map(i => `${i.word} (${i.count})`).join(", "))

                embed.setTitle("Is this your catchphrase?")
                embed.setDescription("<@" + member + "> - " + response.content)
                embed.setFooter({text: "Crashbot words experiment"})
                if (theme) embed.addFields([{
                    name: "Theme",
                    value: theme
                }])
                interaction.editReply({
                    content: " ", embeds: [embed, new EmbedBuilder()
                        .setDescription("Sampled words: " + top
                            .sort((a, b) => a.percentage < b.percentage ? 1 : -1)
                            .map(i => `${i.word} \`${
                                Math.round(i.percentage * 10000) / 100
                            }%\``)
                            .join(", "))
                    ]
                })
            })
    }

    @InteractionChatCommandResponse("become_a_111_operator")
    async becomeAnEmergencyOperator(interaction: ChatInputCommandInteraction) {
        if (!interaction.channel) return

        let conversation = await this.#getConversationForChannel(interaction.channel)
        await conversation.saveMessage({
            role: "system",
            content: "You are talking with a pretend 911 operator. YOU ARE THE CALLER, NOT THE OPERATOR. YOU ARE ONLY ACTING ON BEHALF OF THE CALLER. You must make up a fake story, similar to the 911 calls in Paradise PD. NSFW, swears, and vulgar scenes are acceptable as long as they are for the purposes of comedy.",
        })
        interaction.reply("Ready to start the call!")
    }

    @InteractionChatCommandResponse("topgear")
    async topgear(interaction: ChatInputCommandInteraction) {
        if (!interaction.channel) return

        let conversation = await this.#getConversationForChannel(interaction.channel)
        await conversation.saveMessage({
            role: "system",
            content: `Create a humorous Top Gear style intro for the following characters:

${ShuffleArray([`<633083986968576031>Tall skinny brunette furry. Often has trouble making decisions.</633083986968576031>`,
`<291063946008592388>Short stubby quiet music fan who loves good BBQs, geography, and local music. Loves New Zealand.</291063946008592388>`,
`<818419566874853386>South African man who loves Warframe and welding, and being too nice</818419566874853386>`,
`<780912275313000502>Student of biology, talks too much and loves D&D</780912275313000502>`,
`<404507305510699019>Tall man who loves IT, very quiet, but sometimes says mildly inappropriate things</404507305510699019>`,
`<115681738918854658>Tall skinny man who loves D&D. Often says things subtly racist and falls asleepArr</115681738918854658>`,
`<339252444632449025>Often just depressed. Could probably map out every restaurant in a 30km distance.</339252444632449025>`,
`<358045259726323716>Very heavy. Destiny 2 fanboy who is often not very smart. Proudly Australian.</358045259726323716>`,
`<388165624926306306>Outspoken and creative artist. Probably the smartest of the bunch.</388165624926306306>`,
`<684506859482382355>A potentially autistic Australian paramedic. Loves real-time strategy games.</684506859482382355>`,
`<1042366532526809098>Tall skinny furry currently in a relationship with Mason. Loves IT. Particularly VR</1042366532526809098>`,
`<393955339550064641>A skinny autistic man who loves his video games. Not much more than he loves his footy.</393955339550064641>`,
`<741149173595766824>Short well manored and buff man. Not the brightest in the bunch, but everyone enjoys him being there</741149173595766824>`]).slice(0,3).join("\n")}

Please note that these people will be reading this, so while humorous, also keep it sensible. The intro needs to roughly follow the format; [person] does [thing]. YOU DO NOT NEED TO RE-DESCRIBE THE CHARACTERISTICS OF THE PEOPLE. Your readers already know who they are.
You are not introducing the characters. You are introducing made-up things that 'happen' during the episode. Pretend that the name of the show is 'Re-Flesh' and not 'Top Gear'.
The numbers provided are Discord IDs. Whenever mentioning someone, you must use the format <@number>`,
        })
        await interaction.reply("> Get ready! We're going live in 5, 4, 3, 2, 1!")
        let result = await conversation.sendToAI()
        // interaction.channel.send({
        //     content: result.content?.toString(),
        //     allowedMentions: {
        //         parse: [],
        //         users: [],
        //         roles: [],
        //         repliedUser: false
        //     }
        // })
    }

    async combineUsers(user1: User, user2: User) {
        let aiConversation = AIConversation.new()
        await aiConversation.saveMessage({
            role: "system",
            content: "Create a fake person's online profile based on data from these profiles. KEEP IT SHORT, AND PRIORITISE COMEDY OVER REALISM. Age 18+ humour is more than acceptable.\n\n" +
                JSON.stringify(await Promise.all([user1, user2].map(async user => {
                    return {
                        name: user.username,
                        createdAt: user.createdAt,
                        discriminator: user.discriminator,
                        avatar: user.avatarURL(),
                        banner: user.bannerURL(),
                        favouriteWords: await this.getTopWords(user.id)
                    }
                })))
        })
        let bioResult = await aiConversation.sendToAI()
        await aiConversation.saveMessage({
            role: "system",
            content: "Write a prompt to generate a profile picture for the imaginary user."
        })
        let imagePromptResult = await aiConversation.sendToAI()
        if (!imagePromptResult.content) throw new Error("AI did not respond")

        let image = await generateAIImage({
            prompt: imagePromptResult.content?.toString(),
            model: "dall-e-3",
            response_format: "url",
            quality: "standard",
            size: "1024x1024"
        })
        let imageUrl = image.data[0].url
        if (!imageUrl) throw new Error("Image generation failed")
        console.log(imageUrl)

        await aiConversation.reset()


        return {message: bioResult.content?.toString() ?? "", imageUrl}
    }

    @InteractionChatCommandResponse("combine")
    async onCombine(interaction: ChatInputCommandInteraction) {
        const user1 = interaction.options.getUser('user1', true);
        const user2 = interaction.options.getUser('user2', true);

        await interaction.deferReply()
        let result = await this.combineUsers(user1, user2)
        await interaction.editReply({
            content: result.message,
            files: [new AttachmentBuilder(result.imageUrl).setName("image.webp")]
        })
    }

    @OnClientEvent("messageCreate")
    async onTest(msg: Message) {
        if (msg.author.bot|| !msg.guild) return
        if (msg.content.toLowerCase() === "combine") {
            let user1 = await msg.guild.members.fetch("892535864192827392")
            let result = await this.combineUsers(msg.author, user1.user)
            void msg.reply({content: result.message, files: [
                    new AttachmentBuilder(result.imageUrl)
                        .setName("image.webp")
                ]})
        }
        else if (msg.content.toLowerCase() === "combine harvester") {
            let image = await generateAIImage({
                prompt: Math.random() < .5
                    ? "Kids playing in the fields"
                    : "A combine harvester",
                model: "dall-e-3",
                response_format: "url",
                quality: "standard",
                size: "1024x1024"
            })
            void msg.reply({
                content: " ",
                files: [
                    new AttachmentBuilder(image.data[0].url ?? "")
                        .setName("image.webp")
                ]
            })
        }
    }
}
