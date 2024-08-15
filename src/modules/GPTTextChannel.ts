import {AIConversation, generateAIImage} from "../services/ChatGPT.js";
import SafeQuery, {sql} from "../services/SQL.js";
import {ChatCompletionMessageParam} from "openai/resources/index";
import {ChannelType, Client, Colors, EmbedBuilder, Message, TextBasedChannel, TextChannel} from "discord.js";
import {Character} from "./Speech.js";
import {PointsModule} from "./Points.js";
import {type ImageGenerateParams} from "openai/src/resources/images.js";

export class GPTTextChannel extends AIConversation {
    #channel: TextBasedChannel;
    #lastMessage: Message | undefined;
    #knownUserMappings = new Map<string, string>() // Maps usernames to discord user IDs. Contains the IDs of users in the conversation.
    _imageAttachmentQueue: string[] = []
    _aiResponseHandler = (message: ChatCompletionMessageParam) => {
        let embeds: EmbedBuilder[] = []

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
            allowedMentions: {
                parse: [],
                users: [],
                roles: [],
                repliedUser: false
            }
        }).then(msg => this.#lastMessage = msg)
    }
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
                    description: "Generate an image using DALL-E",
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
                    name: "get_points",
                    description: "Get the level and points of the current user/player",
                    parse: JSON.parse,
                    function: async ({username}: {username: string}) => {
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

    async saveMessage(message: ChatCompletionMessageParam): Promise<void> {
        this.controller?.abort("Received a new message")
        super.saveMessage(message);
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
