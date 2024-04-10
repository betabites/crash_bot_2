import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBooleanOption, SlashCommandBuilder, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import Discord, {
    ChatInputCommandInteraction,
    Colors,
    EmbedBuilder,
    GuildMember,
    Message,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import {getUserData} from "../utilities/getUserData.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {toTitleCase} from "../utilities/toTitleCase.js";
import {ShuffleArray} from "../misc/Common.js";
import ChatGPT from "../services/ChatGPT.js";
import bad_baby_words from "../../badwords.json";
import randomWords from "random-words";
import {client} from "../services/Discord.js";

const baby_alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0987654321)(*&^%$#@!?<>"

export class ExperimentsModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("experiments")
            .setDescription("Opt in or out of Crash Bot experimental features")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("quoteresponseai")
                    .setDescription("Toggle the 'quote response ai' experiment")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("words")
                    .setDescription("Enable or disable the words experiment")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("babyspeak")
                    .setDescription("Enable or disable the baby speak experiment")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("simpleton")
                    .setDescription("Are you a simpleton?")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
    ]
    gucciLastTypingStop = new Date()

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (msg.author.bot) return
        if (msg.content.toLowerCase().includes("how many times have i said ")) {
            getUserData(msg.member as GuildMember)
                .then(async res => {
                    if (res.experimentWords === false) {
                        msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                        return
                    }

                    let words = msg.content.toLowerCase().split("how many times have i said ")[1].replace(/[^A-Za-z ]/g, "").split(" ")
                    let words_results = []
                    let embed = new EmbedBuilder()

                    for (let word of words) {
                        if (word === "") continue

                        let res = await SafeQuery("SELECT word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid AND word = @word GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                            {name: "discordid", type: mssql.TYPES.VarChar(100), data: msg.member?.id || ""},
                            {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                        ])
                        if (res.recordset.length === 0) {
                            words_results.push("You haven't said `" + toTitleCase(word) + "` yet.")
                        }
                        else {
                            words_results.push("`" + toTitleCase(word) + "` " + res.recordset[0].sum + " times")
                        }
                    }

                    embed.setTitle("You've said...")
                    embed.setDescription(words_results.join("\n"))
                    embed.setFooter({text: "Crash Bot words experiment"})
                    msg.reply({content: " ", embeds: [embed]})
                })
        }
        else if (msg.content.toLowerCase().includes("how many times have we said ")) {
            getUserData(msg.member as GuildMember)
                .then(async res => {
                    if (res.experimentWords === false) {
                        msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                        return
                    }

                    let words = msg.content.toLowerCase().split("how many times have we said ")[1].replace(/[^A-Za-z ]/g, "").split(" ")
                    let words_results = []
                    let embed = new EmbedBuilder()

                    let likelihood = -1

                    for (let word of words) {
                        if (word === "") continue

                        let res = await SafeQuery("SELECT word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE word = @word AND guild_id = @guildid GROUP BY word ORDER BY sum DESC", [
                            {name: "word", type: mssql.TYPES.VarChar(100), data: word},
                            {name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || ""},
                        ])
                        if (res.recordset.length === 0) {
                            words_results.push("We haven't said `" + toTitleCase(word) + "` yet.")
                            likelihood = 0
                        }
                        else {
                            words_results.push("We've said `" + toTitleCase(word) + "` " + res.recordset[0].sum + " times")
                            if (likelihood === -1) likelihood = res.recordset[0].sum
                            else if (likelihood === 0) {
                            }
                            else likelihood = likelihood / res.recordset[0].sum
                        }
                    }

                    embed.setTitle("Of all the people on this server who have the experiment enabled...")
                    embed.setDescription(words_results.join("\n"))
                    embed.setFooter({text: `The overall phrase (statistically) has been said ${Math.floor(likelihood)} times. Crash Bot words experiment`})
                    msg.reply({content: " ", embeds: [embed]})
                })
        }
        else if (msg.content.toLowerCase().includes("what are some barely spoken words")) {
            if (msg.channel.type === Discord.ChannelType.DM) {
                msg.reply("Oops. You can't use this phrase in this channel")
                return
            }
            let results = await SafeQuery("SELECT TOP 10 word, SUM(count + pseudo_addition) as 'count', discord_id FROM CrashBot.dbo.WordsExperiment WHERE guild_id=@guildid AND \"count\" = 1 GROUP BY word, discord_id ORDER BY \"count\", NEWID()", [
                {name: "guildid", type: mssql.TYPES.VarChar(), data: msg.channel.guild.id}
            ])
            msg.reply({
                content: " ",
                embeds: [
                    new EmbedBuilder()
                        .setDescription("These words have only ever been spoken once in this server:\n" +
                            results.recordset.map(i => {
                                return `- \`${i.word}\` by <@${i.discord_id}>`
                            }).join("\n")
                        )
                        .setFooter({text: "Crash Bot only counts words as of 2023-08-01, and only from users who have the words experiment enabled."})
                ]
            })
        }
        else if (msg.content.toLowerCase() === "what are my most popular words?") {
            getUserData(msg.member as GuildMember)
                .then(res => {
                    if (res.experimentWords === false) {
                        msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                        return
                    }

                    SafeQuery("SELECT word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE discord_id = @discordid GROUP BY discord_id, word ORDER BY discord_id DESC, sum DESC", [
                        {name: "discordid", type: mssql.TYPES.VarChar(100), data: msg.member?.id || ""}
                    ])
                        .then(res => {
                            if (res.recordset.length < 20) {
                                msg.reply("We don't quite have enough data yet. Keep talking and we'll be able to tell you.")
                            }
                            else {
                                let embed = new EmbedBuilder()
                                let top = res.recordset.slice(0, 20).map((i: any) => {
                                    return "`" + toTitleCase(i.word) + "` " + i.sum + " times"
                                })
                                embed.setTitle("You've said...")
                                embed.setDescription(top.join("\n"))
                                embed.setFooter({text: "Crash Bot words experiment"})
                                msg.reply({content: " ", embeds: [embed]})
                            }
                        })
                })
        }
        else if (msg.content.toLowerCase().replace(/[^a-z]/g, '') === "whatisourserverscatchphrase") {
            getUserData(msg.member as GuildMember)
                .then(res => {
                    if (res.experimentWords === false) {
                        msg.reply("You haven't enabled the words experiment. You need to do this first.\n/experiments words true")
                        return
                    }

                    SafeQuery("SELECT TOP 40 word, SUM(count + pseudo_addition) as 'sum' FROM WordsExperiment WHERE guild_id = @guildid GROUP BY word ORDER BY sum DESC",
                        [{name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || ""},
                        ]
                    )
                        .then(async res => {
                            if (res.recordset.length < 20) {
                                msg.reply("We don't quite have enough data yet. Keep talking and we'll be able to tell you.")
                            }
                            else {
                                let top = ShuffleArray(res.recordset).slice(0, 20).map((i: any) => {
                                    return {
                                        word: i.word,
                                        sum: i.sum
                                    }
                                })
                                ChatGPT.sendMessage(
                                    "Using some of these words, create a catchphrase. Extra words can be added.\n\n" +
                                    top.map(i => i.word).join(", ")
                                )
                                    .then(AIres => {
                                        let embed = new EmbedBuilder()

                                        embed.setTitle("Would this be a suitable catchphrase?")
                                        embed.setDescription(AIres.text)
                                        embed.setFooter({text: "Crash Bot words experiment"})
                                        embed.setFields([{name: "Sampled words", value: top.map(i => i.word).join(", ")}])
                                        msg.reply({content: " ", embeds: [embed]})
                                    })
                                    .catch(e => {
                                        console.log(e)
                                        let embed = new Discord.EmbedBuilder()
                                        embed.setTitle("Service unavailable")
                                        embed.setDescription("This service is currently unavailable. Please try again later")
                                        embed.setColor(Colors.Red)
                                        embed.setFooter({text: "Crash Bot words experiment"})
                                        msg.reply({content: " ", embeds: [embed]})
                                    })
                            }
                        })
                })
        }
        else {
            // Do word count
            if (!msg.member) return
            getUserData(msg.member as GuildMember)
                .then(async res => {
                    if (res.experimentBabyWords && msg.mentions.members?.size === 0 && msg.mentions.roles.size === 0) {
                        // Talk like a 5-year-old
                        if (msg.content.startsWith("b - ")) return

                        let _words = msg.content.split(" ")

                        for (let i in _words) {
                            if (_words[i].startsWith("http") || _words[i].startsWith("<") || _words[i].startsWith(">") || _words[i].startsWith("`")) continue
                            if (_words[i] in bad_baby_words.words) _words[i] = "dumb"
                            // @ts-ignore
                            if (Math.random() < .1) _words[i] = randomWords(1)[0]

                            let letters = _words[i].split("")
                            for (let r in letters) {
                                if (Math.random() < .1) letters[r] = baby_alphabet[Math.floor(Math.random() * baby_alphabet.length)]
                            }
                            _words[i] = letters.join("")
                            console.log(_words[i])

                        }

                        if (Math.random() < .1) {
                            _words = ([] as string[]).concat(_words.map(word => word.toUpperCase()), ["\n", "sorry.", "I", "left", "caps", "lock", "on"])
                        }

                        if (!(msg.channel instanceof TextChannel)) {
                            return
                        }
                        let channel = msg.channel as TextChannel
                        channel
                            .fetchWebhooks()
                            .then((hooks): Promise<Discord.Webhook> => {
                                let webhook = hooks.find(hook => {
                                    return hook.name === (msg.member?.nickname || msg.member?.user.username || "Unknown member")
                                })
                                if (webhook) {
                                    return new Promise((resolve) => {
                                        // @ts-ignore
                                        resolve(webhook)
                                    })
                                }
                                else {
                                    return channel.createWebhook({
                                        name: msg.member?.nickname || msg.member?.user.username || "Unknown user",
                                        avatar: msg.member?.avatarURL() || msg.member?.user.avatarURL(),
                                        reason: "Needed new cheese"
                                    })
                                }
                            })
                            .then(webhook => {
                                console.log(webhook)
                                webhook.send(_words.join(' ')).then(() => {
                                    msg.delete()
                                    webhook.delete()
                                })
                            }).catch(e => {
                            console.error(e)
                        })
                    }
                    if (res.experimentWords) {
                        let words = msg.content.replace(/[^A-Za-z ]/g, "").toLowerCase().split(" ")
                        let spam = false
                        for (let word of words) {
                            let appears = words.filter(i => i === word)
                            if ((appears.length / words.length) > 0.40 && words.length > 5) {
                                spam = true
                                continue
                            }

                            if (word.length > 100) continue
                            if (word === "") continue
                            let data = await SafeQuery("SELECT * FROM dbo.WordsExperiment WHERE discord_id = @discordid AND word = @word AND guild_id = @guildid", [
                                {
                                    name: "discordid",
                                    type: mssql.TYPES.VarChar(20),
                                    data: msg.member?.id || "Unknown member"
                                },
                                {name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || "Unknown guild"},
                                {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                            ])
                            if (data.recordset.length === 0) {
                                await SafeQuery("INSERT INTO dbo.WordsExperiment (word, discord_id, guild_id) VALUES (@word, @discordid, @guildid);", [
                                    {
                                        name: "discordid",
                                        type: mssql.TYPES.VarChar(20),
                                        data: msg.member?.id || "Unknown member"
                                    },
                                    {
                                        name: "guildid",
                                        type: mssql.TYPES.VarChar(20),
                                        data: msg.guild?.id || "Unknown guild"
                                    },
                                    {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                                ])
                            }
                            else {
                                await SafeQuery("UPDATE dbo.WordsExperiment SET count=count + 1, last_appeared=SYSDATETIME() WHERE id = @id", [
                                    {name: "id", type: mssql.TYPES.BigInt(), data: data.recordset[0].id}
                                ])
                                let res = await SafeQuery("SELECT SUM(count + pseudo_addition) AS 'sum' FROM dbo.WordsExperiment WHERE word = @word AND guild_id = @guildid", [
                                    {name: "guildid", type: mssql.TYPES.VarChar(20), data: msg.guild?.id || ""},
                                    {name: "word", type: mssql.TYPES.VarChar(100), data: word}
                                ])
                                if (!res.recordset[0].sum) return
                                if ((res.recordset[0].sum % 500) === 0) {
                                    client.channels.fetch("950939869776052255")
                                        .then((channel) => {
                                            let title: string = `<@${msg.author.username}> just said ${word} for the ${res.recordset[0].sum}th time!`
                                            let message = `Of all users with this experiment enabled, <@${msg.author.id}> just said \`${word}\`for the ${res.recordset[0].sum}th time!`;

                                            (channel as TextBasedChannel).send({
                                                content: ' ', embeds: [
                                                    new EmbedBuilder()
                                                        .setTitle(title)
                                                        .setDescription(message)
                                                ]
                                            })
                                            // msg.reply(`Of everyone with the words experiment enabled, you just said \`${word}\` for the ${res.recordset[0].sum}th time!`)
                                        })
                                }
                            }
                        }
                        if (spam) msg.react("😟")
                    }
                    if (res.simpleton_experiment) {
                        if (msg.content.length > 1500) {
                            msg.reply("This message is too long to simplify")
                            return
                        }
                        let message = await ChatGPT.sendMessage(`Simplify this message so that it uses as few words as possible. Make it as simple and short as possible and avoid long words at all costs. Even if removing detail. Text speech and emojis may be used: ${msg.content}`)
                        let channel = msg.channel as TextChannel
                        channel
                            .fetchWebhooks()
                            .then((hooks): Promise<Discord.Webhook> => {
                                let webhook = hooks.find(hook => {
                                    return hook.name === (msg.member?.nickname || msg.member?.user.username || "Unknown member")
                                })
                                if (webhook) {
                                    return new Promise((resolve) => {
                                        // @ts-ignore
                                        resolve(webhook)
                                    })
                                }
                                else {
                                    return channel.createWebhook({
                                        name: msg.member?.nickname || msg.member?.user.username || "Unknown user",
                                        avatar: msg.member?.avatarURL() || msg.member?.user.avatarURL(),
                                        reason: "Needed new cheese"
                                    })
                                }
                            })
                            .then(webhook => {
                                console.log(webhook)
                                msg.delete()
                                webhook.send({
                                    content: message.text,
                                    allowedMentions: {
                                        parse: [],
                                        users: [],
                                        roles: [],
                                        repliedUser: false
                                    }
                                })
                            }).catch(e => {
                            console.error(e)
                        })
                    }
                })
        }

        if (msg.author.id === '677389499516583946') {
            const random_replies = ['stfu']
            setTimeout(() => {
                msg.reply(random_replies[Math.floor(random_replies.length * Math.random())])
            }, 50000 + (Math.floor(Math.random() * 10000)))
        }
        else if (msg.author.id === '684506859482382355') {
            msg.reply("kill yourself").then(msg => {
                setTimeout(() => msg.edit("luv u ❤️"), 1000)
            })
        }

    }

    @InteractionChatCommandResponse("experiments")
    async onExperimentsCommand(interaction: ChatInputCommandInteraction) {
        // Used to manage experimental features
        let com = interaction.options.getSubcommand()
        if (com === "quoteresponseai") {
            let bool = interaction.options.getBoolean("setting")
            // Ensure that the user is in the database
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentAIQuoteResponse = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `quoteresponseai` to: `" + (bool ? "true" : "false") + "`",
                ephemeral: true
            })
        }
        else if (com === "words") {
            let bool = interaction.options.getBoolean("setting")
            // Get the user's key
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentWords = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `experimentWords` to: `" + (bool ? "true" : "false") + "`. Individual words that you say, will now be saved. Words are saved independently of each other for security (not as full sentences).",
                ephemeral: true
            })
        }
        else if (com === "babyspeak") {
            let bool = interaction.options.getBoolean("setting")
            // Get the user's key
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentBabyWords = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `experimentBabyWords` to: `" + (bool ? "true" : "false") + "`.",
                ephemeral: true
            })
        }
        else if (com === "simpleton") {
            let bool = interaction.options.getBoolean("setting")
            // Get the user's key
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET simpleton_experiment = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `simpleton` to: `" + (bool ? "true" : "false") + "`.",
                ephemeral: true
            })
        }
    }
}