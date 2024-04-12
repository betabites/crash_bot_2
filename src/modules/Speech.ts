import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {ChatInputCommandInteraction, GuildMember, Message, TextChannel} from "discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {getUserData, SPEECH_MODES} from "../utilities/getUserData.js";
import openai from "../services/ChatGPT.js";
import bad_baby_words from "../../badwords.json" assert {type: "json"};
import {sendImpersonateMessage} from "../services/Discord.js";
import {PointsModule} from "./Points.js";

const baby_alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0987654321)(*&^%$#@!?<>"
const SPEECH_ALT_CHARACTERS = {
    cheese: {
        name: "Cheese",
        avatar: "https://cdn2.bigcommerce.com/server5900/ohhf8/product_images/uploaded_images/gouda.jpg"
    },
    bread: {
        name: "Bread",
        avatar: "https://www.thespruceeats.com/thmb/ZJyWw36nZ1lLNi5FHOKRy9daQqs=/940x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/loaf-of-bread-182835505-58a7008c5f9b58a3c91c9a14.jpg"
    },
    butter: {
        name: "Butter",
        avatar: "https://cdn.golfmagic.com/styles/scale_1536/s3/field/image/butter.jpg"
    },
    jam: {
        name: "Jam",
        avatar: "https://media.istockphoto.com/photos/closeup-of-toast-with-homemade-strawberry-jam-on-table-picture-id469719908?k=20&m=469719908&s=612x612&w=0&h=X4Gzga0cWuFB5RfLh-o7s1OCTbbRNsZ8avyVSK9cgaY="
    },
    peanutbutter: {
        name: "Peanut Butter",
        avatar: "https://s3.pricemestatic.com/Images/RetailerProductImages/StRetailer2362/0046010017_ml.jpg"
    },
    shaggy: {
        name: "Shaggy",
        avatar: "https://yt3.ggpht.com/a/AATXAJwB8Yy8BB3RMOPC3FnAAR27H0m63Thq6eHOkw=s900-c-k-c0xffffffff-no-rj-mo"
    },
    keesh: {
        name: "Keesh",
        avatar: "https://images.squarespace-cdn.com/content/v1/60477f6253b7b439babec327/aaf9b622-9ecc-47dd-825b-3b3287f17488/Lakewood+Advocate+Keesh+photo.jpeg"
    }
}
const SPEECH_LEVEL_GATES: {
    [key in SPEECH_MODES]?: number
} = {
    [SPEECH_MODES.SWIFTIE]: 4,
    [SPEECH_MODES.DRUNK]: 4,
    [SPEECH_MODES.BREAD]: 5,
    [SPEECH_MODES.CHEESE]: 5,
    [SPEECH_MODES.PEANUT_BUTTER]: 6,
    [SPEECH_MODES.BUTTER]: 6,
    [SPEECH_MODES.SHAGGY]: 8,
    [SPEECH_MODES.JAM]: 8,
    [SPEECH_MODES.GERMAN_CHEESE]: 10,
    [SPEECH_MODES.WHITE_TRASH_BREAD]: 13,
    [SPEECH_MODES.PEANUT_NUTTER]: 16,
    [SPEECH_MODES.ALCOHOLIC_BUTTER]: 16
}

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
                                name: "KEESH",
                                value: SPEECH_MODES.KEESH,
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
                            },
                            {
                                name: "Swiftie (Requires level 4)",
                                value: SPEECH_MODES.SWIFTIE
                            },
                            {
                                name: "Drunk (Requires level 4)",
                                value: SPEECH_MODES.DRUNK
                            },
                            {
                                name: "Bread (Requires level 5)",
                                value: SPEECH_MODES.BREAD
                            },
                            {
                                name: "Cheese (Requires level 5)",
                                value: SPEECH_MODES.CHEESE
                            },
                            {
                                name: "Butter (Requires level 6)",
                                value: SPEECH_MODES.BUTTER
                            },
                            {
                                name: "Peanut Butter (Requires level 6)",
                                value: SPEECH_MODES.PEANUT_BUTTER
                            },
                            {
                                name: "Shaggy (Requires level 8)",
                                value: SPEECH_MODES.SHAGGY
                            },
                            {
                                name: "Jam (Requires level 8)",
                                value: SPEECH_MODES.JAM
                            },
                            {
                                name: "German Cheese (Requires level 10)",
                                value: SPEECH_MODES.GERMAN_CHEESE
                            },
                            {
                                name: "White Trash Bread (Requires level 13)",
                                value: SPEECH_MODES.WHITE_TRASH_BREAD
                            },
                            {
                                name: "Peanut Nutter (Requires level 16)",
                                value: SPEECH_MODES.PEANUT_NUTTER
                            },
                            {
                                name: "Alcoholic Butter (Requires level 16)",
                                value: SPEECH_MODES.ALCOHOLIC_BUTTER
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
        let character:
            null |
            {
                name: string,
                avatar: string
            }
            = null
        let alteredMessage = ""

        if (msg.reference) {
            alteredMessage += `> Replied to: https://discord.com/channels/${msg.reference.guildId}/${msg.reference.channelId}/${msg.reference.messageId}\n`
        }

        console.log(speechMode)
        switch (speechMode) {
            case SPEECH_MODES.NORMAL:
                return
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
                alteredMessage += (await openai.sendMessage(`Simplify this message so that it uses as few words as possible. Make it as simple and short as possible and avoid long words at all costs. Even if removing detail. Text speech and emojis may be used: ${msg.content}`)).text
                break
            case SPEECH_MODES.SMART_ASS:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound like a smart-arse: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.COLOURFUL:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound more colourful: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.LISP:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound like I have a lisp: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.FURRY:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound like a furry: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.KIWI:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message using Kiwi slang. Make sure to excessively use 'yeah nah': ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.LINUX_CHAD:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that everything I say overly communicates how much I love Linux, and hate everything else: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.SWIFTIE:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that i sound like a hardcore Taylor Swift fan (swifitie): ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.DRUNK:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound drunk. Make sure to slur my sentences: ${msg.content}`)
                ).text
                break
            case SPEECH_MODES.GERMAN_CHEESE:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound like I'm a talking block of cheese with a german accent: ${msg.content}`)
                ).text
                character = SPEECH_ALT_CHARACTERS.cheese
                break
            case SPEECH_MODES.WHITE_TRASH_BREAD:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Paraphrase this message so that I sound like white trash: ${msg.content}`)
                ).text
                character = SPEECH_ALT_CHARACTERS.bread
                break
            case SPEECH_MODES.PEANUT_NUTTER:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`paraphrase this so that I sound like a doped-up teenager with extreme hormones: ${msg.content}`)
                ).text
                character = SPEECH_ALT_CHARACTERS.bread
                break
            case SPEECH_MODES.BREAD:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += msg.content
                character = SPEECH_ALT_CHARACTERS.bread
                break
            case SPEECH_MODES.CHEESE:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += msg.content
                character = SPEECH_ALT_CHARACTERS.cheese
                break
            case SPEECH_MODES.PEANUT_BUTTER:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += msg.content
                character = SPEECH_ALT_CHARACTERS.peanutbutter
                break
            case SPEECH_MODES.BUTTER:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += msg.content
                character = SPEECH_ALT_CHARACTERS.butter
                break
            case SPEECH_MODES.SHAGGY:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`paraphrase this so that I sound like Shaggy: ${msg.content}`)
                ).text
                character = SPEECH_ALT_CHARACTERS.shaggy
                break
            case SPEECH_MODES.JAM:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += msg.content
                character = SPEECH_ALT_CHARACTERS.jam
                break
            case SPEECH_MODES.ALCOHOLIC_BUTTER:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`paraphrase this so that I sound like a talking stick of butter who is incredibly drunk and sluring their words: ${msg.content}`)
                ).text
                character = SPEECH_ALT_CHARACTERS.bread
                break
            case SPEECH_MODES.KEESH:
                if (msg.content.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += "keesh"
                    .split("")
                    .map(char => {
                        let random = Math.random()
                        return random > .5 ? char.toUpperCase() : char
                    })
                    .join("")
                character = SPEECH_ALT_CHARACTERS.keesh
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
        if (character) {
            const webhooks = await channel.fetchWebhooks()
            let hook = webhooks.find(item => item.name === character?.name) ||
                await channel.createWebhook({
                    name: character.name,
                    avatar: character.avatar
                })

            await hook.send({
                content: alteredMessage,
                allowedMentions: {
                    parse: [],
                    users: [],
                    roles: [],
                    repliedUser: false
                },
                files: msg.attachments.map(i => i.url)
            })
        }
        else {
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
        }
        void msg.delete()
        void PointsModule.grantPointsWithInChannelResponse({
            userDiscordId: msg.member.id,
            points: 1,
            responseChannel: msg.channel,
            discordClient: this.client
        })
    }

    @InteractionChatCommandResponse("speech")
    async onSpeechCommand(interaction: ChatInputCommandInteraction) {
        const mode = interaction.options.getInteger("mode", true) as SPEECH_MODES;
        let level_gate = SPEECH_LEVEL_GATES[mode] || 0

        if (level_gate !== 0) {
            let currentLevel = await PointsModule.getPoints(interaction.user.id)
            if (currentLevel.level < level_gate) {
                void interaction.reply({
                    content: `You don't have the required level to use this speech mode!\nYour level: ${currentLevel.level} - Required level: ${level_gate}`,
                    ephemeral: true
                });
                return;
            }
        }

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
