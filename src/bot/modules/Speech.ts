import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {ChatInputCommandInteraction, ClientEvents, Message, TextChannel} from "discord.js";
import SafeQuery from "../../services/SQL.js";
import mssql from "mssql";
import {getUserData, SPEECH_MODES} from "../utilities/getUserData.js";
import openai from "../../services/ChatGPT/ChatGPT.js";
import {
    deleteAllWebhooksForUser,
    JimpProfilePictureModification,
    sendImpersonateMessage
} from "../../services/Discord.js";
import {PointsModule} from "./points/Points.js";
import Jimp from "jimp";
import {grantPointsWithInChannelResponse} from "./points/grantPointsWithInChannelResponse.js";

const baby_alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0987654321)(*&^%$#@!?<>"
const SPEECH_ALT_CHARACTERS = {}

const SPEECH_LEVEL_GATES: {
    [key in SPEECH_MODES]?: number
} = {}

const WOOD_PALLET_MESSAGES = [
    "Wood pallets",
    "I fucking love wood pallets",
    "Wood pallets are my life",
    "If I got a wife, it'd be wood pallets",
    "Fuck you, I'm eating wood pallets",
    "I'm gonna make the next iPhone out of FUCKING wood pallets. Try to stop me.",
    ""
]

export type Character = {
    name?: string | undefined,
    avatar?: string | JimpProfilePictureModification | undefined,
}
type SpeechListener = (originalEvent: ClientEvents["messageCreate"], replacementMessage: string, character: Character | null) => any
const SpeechListeners = new Map<BaseModule, SpeechListener[]>()

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
                                name: "Shakespearean",
                                value: SPEECH_MODES.SHAKESPEAREAN,
                            },
                            {
                                name: "Pirate",
                                value: SPEECH_MODES.PIRATE,
                            },
                            {
                                name: "Emoji",
                                value: SPEECH_MODES.EMOJI
                            },
                            {
                                name: "Reverse",
                                value: SPEECH_MODES.REVERSE
                            },
                            {
                                name: "Baby",
                                value: SPEECH_MODES.BABY
                            },
                            {
                                name: "Edgy Teen",
                                value: SPEECH_MODES.EDGY_TEEN
                            },
                            {
                                name: "Drunk",
                                value: SPEECH_MODES.DRUNK
                            },
                            {
                                name: "Formal",
                                value: SPEECH_MODES.FORMAL
                            },
                            {
                                name: "Yoda",
                                value: SPEECH_MODES.YODA
                            },
                            {
                                name: "Valley Girl",
                                value: SPEECH_MODES.VALLEY_GIRL
                            },
                            {
                                name: "Superhero",
                                value: SPEECH_MODES.SUPERHERO
                            },
                            {
                                name: "Haiku",
                                value: SPEECH_MODES.HAIKU
                            },
                            {
                                name: "Conspiracy Theorist",
                                value: SPEECH_MODES.CONSPIRACY_THEORIST
                            },
                            {
                                name: "Cowboy",
                                value: SPEECH_MODES.COWBOY
                            },
                            {
                                name: "Kaomoji",
                                value: SPEECH_MODES.KAOMOJI
                            },
                            {
                                name: "Robot",
                                value: SPEECH_MODES.ROBOT
                            },
                            {
                                name: "Shouty",
                                value: SPEECH_MODES.SHOUTY
                            },
                            {
                                name: "Eldritch horror",
                                value: SPEECH_MODES.ELDRITCH_HORROR
                            },
                            {
                                name: "Textbook",
                                value: SPEECH_MODES.TEXTBOOK
                            },
                            {
                                name: "Fantasy Bard",
                                value: SPEECH_MODES.FANTASY_BARD
                            },
                            {
                                name: "Jolly",
                                value: SPEECH_MODES.JOLLY
                            }
                        )
                        return opt
                    })
            )
    ]

    @OnClientEvent("messageCreate")
    private async onMessage(msg: Message) {
        if (msg.author.bot) return
        if (!msg.member) {
            this.emitAlteredMessageEvent(msg, msg.content, null)
            return
        }
        let message = msg.content

        if (msg.reference) {
            message = `> Replied to: https://discord.com/channels/${msg.reference.guildId}/${msg.reference.channelId}/${msg.reference.messageId}\n` + message
        }
        const userData = await getUserData(msg.member)
        if (userData.speech_mode === SPEECH_MODES.NORMAL) {
            this.emitAlteredMessageEvent(msg, msg.content, null)
            return
        }
        try {
            let [alteredMessage, character] = await this.alterMessage(message, userData)

            if (!alteredMessage) {
                this.emitAlteredMessageEvent(msg, msg.content, character)
                return
            }

            let channel = msg.channel as TextChannel
            if (character) {
                await sendImpersonateMessage(
                    channel,
                    msg.member,
                    {
                        content: alteredMessage,
                        allowedMentions: {
                            parse: [],
                            users: [],
                            roles: [],
                            repliedUser: false
                        },
                        files: msg.attachments.map(i => i.url)
                    },
                    character.name,
                    character.avatar ?? undefined
                )
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
            void grantPointsWithInChannelResponse({
                user: new User(msg.member.id),
                points: 1,
                responseChannel: msg.channel,
                discordClient: this.client,
                reason: "Discord text message (speech enabled)"
            })
            this.emitAlteredMessageEvent(msg, alteredMessage, character)
        }
        catch(e) {
            console.error(e)
            await SafeQuery(`UPDATE CrashBot.dbo.Users
                         SET speech_mode = 0
                         WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: msg.member.id
            }])
            await msg.member.send("There was an error processing your speech mode. Because of this, we've reset your speech mode to normal. Please try again later.")
            throw e
        }
    }

    private async alterMessage(msg: string, userData: Awaited<ReturnType<typeof getUserData>>): Promise<[string, null | Character]> {
        if (msg.startsWith("b - ")) return ["", null]

        const speechMode = userData.speech_mode;
        let character: null | Character
            = null
        let alteredMessage = ""

        console.log(speechMode)
        switch (speechMode) {
            case SPEECH_MODES.NORMAL:
                return ["", null]
            case SPEECH_MODES.SHAKESPEAREAN:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (await openai.sendMessage(`Rewrite the following message as if it were written by William Shakespeare, using old-timey English and dramatic flair: ${msg}`)).text
                break
            case SPEECH_MODES.PIRATE:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (await openai.sendMessage(`Transform the following message into pirate lingo, adding nautical terms, pirate expressions, and a hearty seafaring vibe: ${msg}`)).text
                break
            case SPEECH_MODES.EMOJI:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Reimagine the following message with an excessive and humorous use of emojis that match the tone and content of the text: ${msg}`)
                ).text
                break
            case SPEECH_MODES.REVERSE:
                alteredMessage += msg.split("").reverse().join("")
                character = {
                    name: author.displayName.split("").reverse().join(""),
                    avatar: async (profilePicture: Jimp) => {
                        profilePicture.flip(true, false)
                        profilePicture.invert()
                        return profilePicture
                    }
                }
                break
            case SPEECH_MODES.FORMAL:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message in an overly polite, formal, or corporate-sounding manner: ${msg}`)
                ).text
                break
            case SPEECH_MODES.BABY:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Convert the following message into baby talk, using simple words, cute expressions, and toddler-like speech patterns: ${msg}`)
                ).text
                break
            case SPEECH_MODES.EDGY_TEEN:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message with the tone of an overly dramatic and sarcastic teenager: ${msg}`)
                ).text
                break
            case SPEECH_MODES.DRUNK:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Simulate a drunk person typing the following message by introducing random typos, slurred phrasing, and an inconsistent tone: ${msg}`)
                ).text
                character = {
                    avatar: async (profilePicture: Jimp) => {
                        let size = profilePicture.bitmap.width
                        let wavyImage = profilePicture.clone()
                        wavyImage.scan(0, 0, profilePicture.bitmap.width, profilePicture.bitmap.width, function (x, y, idx) {
                            // Calculate the offset using a sine wave
                            const offset = Math.round(10 * Math.sin(.1 * y));

                            // Calculate the new x-coordinate
                            const newX = x + offset;

                            // Ensure newX is within image bounds
                            if (newX >= 0 && newX < size) {
                                // Get the pixel color from the original position
                                const color = profilePicture.getPixelColor(newX, y);

                                // Set the pixel color to the new position
                                wavyImage.setPixelColor(color, x, y);
                            }
                        });
                        return wavyImage
                    }
                }
                break
            case SPEECH_MODES.YODA:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message in Yoda's distinctive speech pattern, where word order is often reversed or unconventional: ${msg}`)
                ).text
                character = {
                    async avatar(profilePicture: Jimp) {
                        profilePicture.scan(0, 0, profilePicture.bitmap.width, profilePicture.bitmap.height, function (x, y, idx) {
                            // idx is the start of this pixel's data in the bitmap (RGBA)
                            // const red = this.bitmap.data[idx];      // Red channel
                            const green = this.bitmap.data[idx + 1]; // Green channel
                            // const blue = this.bitmap.data[idx + 2];  // Blue channel

                            // Set red and blue channels to 0, keep green as-is
                            profilePicture.bitmap.data[idx] = 0;      // Red channel
                            profilePicture.bitmap.data[idx + 1] = green; // Green channel (unchanged)
                            profilePicture.bitmap.data[idx + 2] = 0;      // Blue channel
                        });
                        return profilePicture
                    }
                }
                break
            case SPEECH_MODES.VALLEY_GIRL:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Transform the following message into the stereotypical speech of a 'Valley Girl,' adding words like 'like,' 'totally,' and a dramatic tone: ${msg}`)
                ).text
                break
            case SPEECH_MODES.SUPERHERO:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message as if it were spoken by a superhero, adding dramatic flair and a sense of justice or adventure: ${msg}`)
                ).text
                break
            case SPEECH_MODES.HAIKU:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Reformat the following message into a haiku, adhering to the 5-7-5 syllable structure while keeping the essence of the text: ${msg}`)
                ).text
                break
            case SPEECH_MODES.CONSPIRACY_THEORIST:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message with the tone of a paranoid conspiracy theorist, adding suspicion and dramatic questioning: ${msg}`)
                ).text
                break
            case SPEECH_MODES.COWBOY:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Transform the following message into cowboy slang, using Old West expressions and a rugged tone: ${msg}`)
                ).text
                break
            case SPEECH_MODES.KAOMOJI:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Add adorable Japanese-style emoticons (kaomoji) to the following message to make it more expressive and cute: ${msg}`)
                ).text
                break
            case SPEECH_MODES.ROBOT:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message as if spoken by a robot, using mechanical tones, punctuation emphasis, and robotic phrasing: ${msg}`)
                ).text
                break
            case SPEECH_MODES.SHOUTY:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Transform the following message into shouty caps, adding excessive excitement and over-the-top punctuation: ${msg}`)
                ).text
                break
            case SPEECH_MODES.ELDRITCH_HORROR:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message in the tone of Lovecraftian horror, adding ominous and mysterious imagery: ${msg}`)
                ).text
                break
            case SPEECH_MODES.TEXTBOOK:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message in the style of an academic textbook, using formal language and complex phrasing: ${msg}`)
                ).text
                break
            case SPEECH_MODES.FANTASY_BARD:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Transform the following message into the tone of a medieval fantasy bard, using poetic language and storytelling flair: ${msg}`)
                ).text
                break
            case SPEECH_MODES.JOLLY:
                if (msg.length > 1500) {
                    // Message is too long
                    break
                }
                alteredMessage += (
                    await openai.sendMessage(`Rewrite the following message in a cheerful and jolly tone, replacing any harmful, negative, or aggressive language with positive, happy, and festive expressions. If the original message is already neutral or positive, leave its tone unchanged. Always make the rewritten message sound joyful and uplifting, like a holiday spirit meme. Here’s the message: ${msg}`)
                ).text
                character = {
                    async avatar(profilePicture: Jimp) {
                        let wreath = await Jimp.read("./assets/character_avatars/christmas_wreath.png")
                        wreath.resize(profilePicture.bitmap.width, profilePicture.bitmap.width)

                        // Create a canvas, and place both images on it.
                        profilePicture.composite(wreath, 0, 0, {
                            mode: Jimp.BLEND_SOURCE_OVER,
                            opacitySource: 1,
                            opacityDest: 1
                        })
                        return profilePicture
                    }
                }
                break
            default:
                return ["", null]
        }

        // if (msg.attachments.size !== 0) {
        //     alteredMessage += "\n\n" + msg.attachments.map((item) => {
        //         return item.url
        //     }).join("\n");
        // }

        return [alteredMessage, character]
    }

    private emitAlteredMessageEvent(msg: Message, newMsg: string, character: Character | null) {
        for (let item of SpeechListeners) {
            for (let listener of item[1]) {
                try {
                    listener.call(item[0], [msg], newMsg, character)
                } catch (e) {
                    console.error(e)
                }
            }
        }
    }

    @InteractionChatCommandResponse("speech")
    async onSpeechCommand(interaction: ChatInputCommandInteraction) {
        void deleteAllWebhooksForUser(interaction.user.id)

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

export function OnSpeechModeAdjustmentComplete(thisArg?: BaseModule) {
    function decorator(originalMethod: SpeechListener, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            let existingListeners = SpeechListeners.get(this)
            if (existingListeners) {
                SpeechListeners.set(this, [...existingListeners, originalMethod])
            }
            else {
                SpeechListeners.set(this, [originalMethod])
            }
        })

        return originalMethod
    }

    return decorator
}

