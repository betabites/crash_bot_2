import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import Discord, {ChatInputCommandInteraction, GuildMember, Message, TextChannel} from "discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {getUserData, SPEECH_MODES} from "../utilities/getUserData.js";
import ChatGPT from "../services/ChatGPT.js";
import bad_baby_words from "../../badwords.json" assert {type: "json"};

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
                        opt.addChoices(
                            {
                                name: "Normal",
                                value: SPEECH_MODES.NORMAL
                            },
                            {
                                name: "Baby speak",
                                value: SPEECH_MODES.BABYSPEAK,
                            },
                            {
                                name: "Simpleton",
                                value: SPEECH_MODES.SIMPLETON
                            }
                        )
                        return opt
                    })
            )
    ]

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        const userData = await getUserData(msg.member as GuildMember)
        const speechMode = userData.speech_mode;
        let alteredMessage = ""

        switch (speechMode) {
            case SPEECH_MODES.BABYSPEAK:
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
                alteredMessage = _words.join(' ')
            case SPEECH_MODES.SIMPLETON:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                let message = await ChatGPT.sendMessage(`Simplify this message so that it uses as few words as possible. Make it as simple and short as possible and avoid long words at all costs. Even if removing detail. Text speech and emojis may be used: ${msg.content}`)
                alteredMessage = message.text
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
                msg.delete()
                webhook.send({
                    content: alteredMessage,
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