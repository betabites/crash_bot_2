import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import Discord, {ChatInputCommandInteraction, GuildMember, Message, TextChannel} from "discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {getUserData, SPEECH_MODES} from "../utilities/getUserData.js";
import ChatGPT from "../services/ChatGPT.js";
import bad_baby_words from "../../badwords.json" assert {type: "json"};
import {sendImpersonateMessage} from "../services/Discord.js";

const baby_alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0987654321)(*&^%$#@!?<>"

export class SpeechModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("speech")
            .setDescription("Use AI to make your messages a little more *spicy*")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("set")
                    .setDescription("Change your speech mode")
                    .addIntegerOption((opt) => {
                        opt.setRequired(true)
                        opt.setName("mode")
                        opt.setDescription("Select a mode")
                        opt.addChoices(
                            {
                                name: "Normal",
                                value: SPEECH_MODES.NORMAL
                            },
                            {
                                name: "Baby speak",
                                value: SPEECH_MODES.BABY_SPEAK,
                            },
                            {
                                name: "Simpleton",
                                value: SPEECH_MODES.SIMPLETON
                            },
                            {
                                name: "Smart-Ass",
                                value: SPEECH_MODES.SMART_ASS
                            },
                            {
                                name: "Colourful",
                                value: SPEECH_MODES.COLOURFUL
                            },
                            {
                                name: "Lisp",
                                value: SPEECH_MODES.LISP
                            },
                            {
                                name: "Furry",
                                value: SPEECH_MODES.FURRY
                            },
                            {
                                name: "Flightless Bird (Kiwi)",
                                value: SPEECH_MODES.KIWI
                            },
                            {
                                name: "Linux Chad",
                                value: SPEECH_MODES.LINUX_CHAD
                            }
                        )
                        return opt
                    })
            )
    ]

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (!msg.member || msg.author.bot) return
        if (msg.content.startsWith("b - ")) return

        const userData = await getUserData(msg.member as GuildMember)
        const speechMode = userData.speech_mode;
        let alteredMessage = ""

        if (msg.reference) {
            alteredMessage += `> Replied to: https://discord.com/channels/${msg.reference.guildId}/${msg.reference.channelId}/${msg.reference.messageId}\n`
        }

        console.log(speechMode)
        switch (speechMode) {
            case SPEECH_MODES.BABY_SPEAK:
                // Talk like a 5-year-old

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
                alteredMessage += _words.join(' ')
                break
            case SPEECH_MODES.SIMPLETON:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (await ChatGPT.sendMessage(`Simplify this message so that it uses as few words as possible. Make it as simple and short as possible and avoid long words at all costs. Even if removing detail. Text speech and emojis may be used: ${msg.content}`)).text
                break
            case SPEECH_MODES.SMART_ASS:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await ChatGPT.sendMessage(`Paraphrase this message so that I sound like a smart-arse: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.COLOURFUL:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await ChatGPT.sendMessage(`Paraphrase this message so that I sound more colourful: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.LISP:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await ChatGPT.sendMessage(`Paraphrase this message so that I sound like I have a lisp: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.FURRY:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await ChatGPT.sendMessage(`Paraphrase this message so that I sound like a furry: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.KIWI:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await ChatGPT.sendMessage(`Paraphrase this message using Kiwi slang. Make sure to excessively use 'yeah nah': ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.LINUX_CHAD:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await ChatGPT.sendMessage(`Paraphrase this message so that everything I say overly communicates how much I love Linux, and hate everything else: ${msg.content}`)
                ).text
                break
            default:
                return
        }

        // if (msg.attachments.size !== 0) {
        //     alteredMessage += "\n\n" + msg.attachments.map((item) => {
        //         return item.url
        //     }).join("\n");
        // }

        if (!alteredMessage) return
        let channel = msg.channel as TextChannel
        await sendImpersonateMessage(channel, msg.member, {
            content: alteredMessage,
            allowedMentions: {
                parse: [],
                users: [],
                roles: [],
                repliedUser: false
            },
            files: msg.attachments.map(i => i.url)
        })
        void msg.delete()
    }

    @InteractionChatCommandResponse("speech")
    async onSpeechCommand(interaction: ChatInputCommandInteraction) {
        const mode = interaction.options.getInteger("mode", true);

        await SafeQuery(`UPDATE CrashBot.dbo.Users
                         SET speech_mode = ${mode}
                         WHERE discord_id = @discordid`, [{
            name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
        }])
        void interaction.reply({
            content: "Configured your speech mode!",
            ephemeral: true
        })
    }
}