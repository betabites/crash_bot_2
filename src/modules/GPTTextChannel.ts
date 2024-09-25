import {AIConversation, generateAIImage} from "../services/ChatGPT.js";
import SafeQuery, {sql} from "../services/SQL.js";
import {ChatCompletionMessageParam} from "openai/resources/index";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    Colors,
    EmbedBuilder,
    Message,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import {Character} from "./Speech.js";
import {PointsModule} from "./Points.js";
import {type ImageGenerateParams} from "openai/src/resources/images.js";
import moment from "moment-timezone"
import {GameSessionData, GameSessionModule} from "./GameSessionModule.js";
import {EVENT_IDS} from "./GameAchievements.js";

const EVENT_ID_MAPPINGS = {
    "chill": EVENT_IDS.CHILL,
    "movie/tv show": EVENT_IDS.MOVIE_OR_TV,
    "(game) destiny 2": EVENT_IDS.DESTINY2,
    "(game) among us": EVENT_IDS.AMONG_US,
    "(game) space engineers": EVENT_IDS.SPACE_ENGINEERS,
    "(game) bopl battle": EVENT_IDS.BOPL_BATTLE,
    "(game) lethal company": EVENT_IDS.LETHAL_COMPANY,
    "(game) minecraft": EVENT_IDS.MINECRAFT,
    "(game) phasmophobia": EVENT_IDS.PHASMOPHOBIA,
    "(game) borderlands": EVENT_IDS.BORDERLANDS,
    "(game) escapists": EVENT_IDS.ESCAPISTS,
    "(game) garry's mod": EVENT_IDS.GMOD,
    "(game) northgard": EVENT_IDS.NORTHGARD,
    "(game) oh deer": EVENT_IDS.OH_DEER,
    "(game) project playtime": EVENT_IDS.PROJECT_PLAYTIME,
    "(game) terraria": EVENT_IDS.TERRARIA,
    "(game) warframe": EVENT_IDS.WARFRAME,
    "(game) who's your daddy": EVENT_IDS.WHOS_YOUR_DADDY,
    "other": EVENT_IDS.OTHER,
} as const

export class GPTTextChannel extends AIConversation {
    #channel: TextBasedChannel;
    #lastMessage: Message | undefined;
    #knownUserMappings = new Map<string, string>() // Maps usernames to discord user IDs. Contains the IDs of users in the conversation.
    _imageAttachmentQueue: string[] = []
    _embedQueue: EmbedBuilder[] = []
    _aiResponseHandler = (message: ChatCompletionMessageParam) => {
        let embeds: EmbedBuilder[] = [...this._embedQueue]
        let components = [...this._actionRowQueue]
        this._actionRowQueue = []

        this._embedQueue = []

        if (!this.#lastMessage) {
            embeds.push(new EmbedBuilder()
                .setColor(Colors.Green)
                .setDescription("Crash Bot can:\n- Read your current points\n- Fetch memes and other pictures from Reddit\n- Generate pictures (use responsibly)")
                .setFooter({text: "To end a conversation, say 'reset'"})
            )
        }

        for (let file of this._imageAttachmentQueue) {
            embeds.push(new EmbedBuilder().setImage(file))
        }
        this._imageAttachmentQueue = []

        this.#channel.send({
            content: message.content?.toString() ?? '',
            embeds,
            components,
            allowedMentions: {
                parse: [],
                users: [],
                roles: [],
                repliedUser: false
            }
        }).then(msg => this.#lastMessage = msg)
    }
    _currentDate: Date | null = null
    _actionRowQueue: ActionRowBuilder<ButtonBuilder>[] = [];
    private client: Client;

    static async load(channel: TextBasedChannel, client: Client) {
        let messages = await SafeQuery<{content: string}>(sql`SELECT content FROM AiConversationHistory WHERE conversation_id = ${"channel_" + channel.id}`);
        let messages_parsed: ChatCompletionMessageParam[] = messages.recordset.map(record => JSON.parse(record.content))
        return new GPTTextChannel(
            messages_parsed,
            channel,
            client
        )
    }

    static toAIDate(date: Date, includeTime?: boolean) {
        return new Intl.DateTimeFormat("en-US", {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: includeTime ? '2-digit' : undefined,
            minute: includeTime ?'2-digit' : undefined,
            second: includeTime ? '2-digit' : undefined,
            timeZone: 'UTC',
            timeZoneName: 'short'
        }).format(date)
    }

    constructor(
        messages: ChatCompletionMessageParam[],
        channel: TextBasedChannel,
        client: Client
    ) {
        super(messages, [
            {
                type: "function",
                function: {
                    name: "generate_image",
                    description: "Generate an image using DALL-E. Only use if explicitly asked for.",
                    parse: JSON.parse,
                    function: async (
                        props: {description: string, size?: ImageGenerateParams["size"], style?: ImageGenerateParams["style"], quality?: ImageGenerateParams["quality"]}
                    ) => {
                        let image = await generateAIImage({
                            prompt: props.description,
                            model: "dall-e-3",
                            response_format: "url",
                            quality: props.quality,
                            size: props.size
                        })
                        this._imageAttachmentQueue.push(image.data[0].url ?? '')
                        return "Image will be attached to your response"
                    },
                    parameters: {
                        type: "object",
                        properties: {
                            description: {
                                type: "string",
                                description: "Ensure you use detailed descriptions, include context and elements, adhere to OpenAI policies, avoid listing, and use clear language"
                            },
                            size: {
                                type: "string",
                                enum: ['1024x1024', '1792x1024', '1024x1792']
                            },
                            style: {
                                type: "string",
                                enum: ['vivid', 'natural']
                            },
                            quality: {
                                type: "string",
                                enum: ['standard', 'hd']
                            }
                        },
                        required: ["description"]
                    },
                }
            },
            {
                type: "function",
                function: {
                    name: "get_now",
                    description: "Get the current date and time",
                    parse: JSON.parse,
                    function: async () => {
                        return GPTTextChannel.toAIDate(new Date(), true)
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
                    name: "get_points",
                    description: "Get the level and points of the current user/player",
                    parse: JSON.parse,
                    function: async ({username}: {username: string}) => {
                        if (!username) return "You didn't specify a username"
                        let user_id = this.#knownUserMappings.get(username.toLowerCase())
                        if (!user_id) return "Unknown user. User may not exist, may not have joined the conversation, or may have another issue with their points."

                        let points = await PointsModule.getPoints(user_id);
                        return `Level: ${points.level}, Points: ${points.points}/${PointsModule.calculateLevelGate(points.level + 1)}`
                    },
                    parameters: {
                        type: "object",
                        properties: {
                            username: {
                                type: "string"
                            }
                        }
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
                            if (meme.nsfw
                                && this.#channel instanceof TextChannel
                                && !this.#channel.nsfw
                            ) {
                                console.log("NSFW meme disallowed: User does not have required discord role")
                                return "This user is not permitted to access NSFW content"
                            }
                            if (meme.nsfw && this.#channel.type !== ChannelType.DM && (this.#channel.type !== ChannelType.GuildText || !this.#channel.nsfw)) {
                                console.log("NSFW meme disallowed: Cannot send in a non-nsfw guild channel")
                                return "Cannot send NSFW content in this channel"
                            }
                            results.push({title: meme.title, url: meme.url})
                        }

                        for (let item of results) {
                            this._imageAttachmentQueue.push(item.url)
                        }
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
            },
            {
                type: "function",
                function: {
                    name: "create_event",
                    description: "Create a new event.",
                    parse: JSON.parse,
                    function: async (props: {
                        activity: keyof typeof EVENT_ID_MAPPINGS,
                        description: string,
                        timestamp: string,
                        // timeZoneOffset: number
                        timeZoneCode: string,
                        maximumPlayers?: number,
                        minimumPlayers?: number
                    }) => {
                        // convert the timestamp
                        let date = moment(props.timestamp)
                            .tz(props.timeZoneCode, true)
                            .utc()

                        if (date.toDate().getTime() < Date.now()) {
                            return "Events cannot be created for the past."
                        }

                        let activity = EVENT_ID_MAPPINGS[props.activity]
                        if (typeof activity === "undefined") {
                            throw new Error(`Unknown activity; ${props.activity}`)
                            // return `Unknown activity; ${props.activity}`
                        }
                        let sessionHandler = GameSessionModule.sessionBindings.get(activity)
                        if (!sessionHandler) {
                            console.error(new Error("INTERNAL ERROR; No session handler has been bound for that activity type: " + activity))
                            return "INTERNAL ERROR; No session handler has been bound for that activity type: " + activity
                        }

                        let message = await this.#channel.send("`creating an event...`")
                        let session = await sessionHandler.createNewGameSession(
                            date.toDate(),
                            props.description,
                            message.channel.id,
                            message.id
                        )
                        // this._embedQueue.push(
                        //     new EmbedBuilder()
                        //         .setTitle("New event created")
                        //         .setDescription(props.description)
                        //         .addFields([
                        //             {name: "timestamp", value: `<t:${date.toDate().getTime() / 1000}:R>`},
                        //             {name: "timestamp", value: props.timestamp},
                        //             {name: "timezone", value: props.timeZoneCode},
                        //             {name: "maximum players", value: props.maximumPlayers?.toString() ?? "N/A"},
                        //             {name: "minimum players", value: props.minimumPlayers?.toString() ?? "N/A"},
                        //         ])
                        // )

                        let gameData: GameSessionData = {
                            id: session,
                            start: date.toDate(),
                            game_id: activity,
                            hidden_discord_channel: null,
                            description: props.description
                        }
                        await message.edit({
                            content: "",
                            embeds: [sessionHandler.buildInviteEmbed(gameData)],
                            components: [sessionHandler.buildInviteComponents(gameData)]
                        })

                        return {
                            result: "Created new event",
                            // eventId: res.recordset[0].NewRecordID
                        }
                    },
                    parameters: {
                        type: "object",
                        properties: {
                            activity: {
                                type: "string",
                                enum: Object.keys(EVENT_ID_MAPPINGS)
                            },
                            description: {
                                type: "string"
                            },
                            timeZoneCode: {
                                type: "string",
                                description: "Standard IANA format Region/Country. If not specified, assume Auckland/Pacific"
                            },
                            // timeZoneOffset: {
                            //     type: "number",
                            //     description: "The timezone offset (minutes) for the timezone in which this event is occurring. Consider daylight savings when applicable. If not specified, assume New Zealand."
                            // },
                            timestamp: {
                                type: "string",
                                format: "date-time",
                                description: "Timestamp for when this event starts."
                            },
                            maximumPlayers: {
                                type: "number",
                                description: "The maximum amount of users allowed to join the event. Can be undefined"
                            },
                            minimumPlayers: {
                                type: "number",
                                description: "The minimum amount of users required to join the event for it to proceed."
                            }
                        },
                        required: ["activity", "description", "timestamp", "timeZoneCode"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_events",
                    description: "Get a list of all currently organised events.",
                    parse: JSON.parse,
                    function: async () => {
                        let events = await GameSessionModule.getAllGameSessions()
                        for (let event of events) {
                            let handler = GameSessionModule.sessionBindings.get(event.game_id);
                            if (!handler) continue

                            this._embedQueue.push(handler.buildInviteEmbed(event))
                        }

                        return events
                    },
                    parameters: {
                        type: "object",
                        properties: {}
                    }
                }
            }
        ], "channel_" + channel.id);
        this.#channel = channel
        this.client = client
        this.on("onAIResponse", this._aiResponseHandler)
    }

    unload() {
        this.removeListener("onAIResponse", this._aiResponseHandler)
    }

    async processMessage([msg]: [Message], messageContent: string, character: Character | null) {
        if (msg.author.id === this.client.user?.id) return
        this.#knownUserMappings.set((msg.author.displayName ?? msg.author.username).toLowerCase(), msg.author.id)
        await this.saveMessage({
            role: "user",
            name: character?.name || (msg.author.displayName ?? msg.author.username).replace(/[^A-z]/g, ""),
            content: messageContent
        })
        void this.delayedSendToAI()
        return
    }

    async saveMessage(
        message: ChatCompletionMessageParam,
        ignoreDateCheck?: boolean
    ): Promise<void> {
        this.controller?.abort("Received a new message")
        if (this._currentDate?.getDate() !== (new Date()).getDate()) {
            // Day has changed,
            await super.saveMessage({
                role: "system",
                content: `The current date is: ${GPTTextChannel.toAIDate(new Date())}`
            })
        }
        await super.saveMessage(message);
    }

    delayedSendToAI() {
        if (this.delayedSendTimer) clearTimeout(this.delayedSendTimer)
        this.delayedSendTimer = setTimeout(() => {
            this.sendToAI()
        }, 1500)
    }

    async sendToAI(): Promise<ChatCompletionMessageParam> {
        let interval = setInterval(() => {
            void this.#channel.sendTyping()
        }, 3000)
        return super.sendToAI()
            .finally(() => clearInterval(interval))
    }
}
