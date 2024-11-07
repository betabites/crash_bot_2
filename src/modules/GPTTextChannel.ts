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
    Role,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import {Character} from "./Speech.js";
import {PointsModule} from "./Points.js";
import {type ImageGenerateParams} from "openai/src/resources/images.js";
import moment from "moment-timezone"
import {GameSessionData, GameSessionModule} from "./GameSessionModule.js";
import {EVENT_IDS} from "./GameAchievements.js";
import {getCharacter, getProfile} from "bungie-net-core/endpoints/Destiny2";
import {getClient} from "./D2.js";
import {DestinyClass, DestinyComponentType, DestinyItemType} from "bungie-net-core/enums";
import {
    DestinyCharacterComponent,
    DestinyInventoryItemDefinition,
    type DestinyItemComponent,
    DestinyItemSocketState
} from "bungie-net-core/models";
import {DestinyRace} from "bungie.net";
import {MANIFEST_SEARCH} from "./D2/DestinyManifestDatabase.js";
import {getD2AccessToken} from "./D2/getD2AccessToken.js";

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

type SerialisedDestinyItemData = {
    itemName: string,
    itemType: string,
    mods: string[],
    champions: {
        overload: boolean,
        barrier: boolean,
        unstoppable: boolean
    }
}

type DestinyCharacterSerialised = {
    characterId: string,
    dateLastPlayed: Date,
    minutesPlayedThisSeason: number,
    minutesPlayedTotal: number,
    light: number,
    class: "titan" | "hunter" | "warlock" | "unknown",
    race: "human" | "awoken" | "exo" | "unknown",
    items: SerialisedDestinyItemData[]
}

export class GPTTextChannel extends AIConversation {
    #channel: TextBasedChannel;
    #lastMessage: Message | undefined;
    #knownUserMappings = new Map<string, string>() // Maps usernames to discord user IDs. Contains the IDs of users in the conversation.
    _imageAttachmentQueue: string[] = []
    _embedQueue: EmbedBuilder[] = []
    _aiResponseHandler = async (message: ChatCompletionMessageParam) => {
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

        let content = message.content?.toString() ?? ""
        while (content.length > 2000) {
            let part = content.slice(0, 2000)
            await this.#channel.send(part)
        }

        this.#channel.send({
            content: content,
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
        let messages = await SafeQuery<{ content: string }>(sql`SELECT content
                                                                FROM AiConversationHistory
                                                                WHERE conversation_id = ${"channel_" + channel.id}`);
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
            minute: includeTime ? '2-digit' : undefined,
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
                            props: {
                                description: string,
                                size?: ImageGenerateParams["size"],
                                style?: ImageGenerateParams["style"],
                                quality?: ImageGenerateParams["quality"]
                            }
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
                        function: async ({username}: { username: string }) => {
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
                        function: async ({subreddit, allowNSFW, count}: {
                            subreddit?: string,
                            allowNSFW: boolean,
                            count?: number
                        }) => {
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
                },
                {
                    type: "function",
                    function: {
                        name: "get_roles",
                        description: "Get a list of all roles in this Discord server",
                        parse: JSON.parse,
                        function: async () => {
                            if (channel.type === ChannelType.DM) {
                                return "This function is not available for Discord DM-based communications";
                            }
                            let roles = await channel.guild.roles.fetch();
                            return roles.map((value) => serialiseRole(value))
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
                        name: "d2_get_characters",
                        description: "Get basic information about the given user's D2 characters.",
                        parse: JSON.parse,
                        function: async (props: { discordId: string[] }) => {
                            let result: {[key: string]: DestinyCharacterSerialised[] | string} = {}
                            for (let discordId of props.discordId) {
                                let resultData = await getD2Characters(discordId)
                                if (resultData) result[discordId] = resultData
                            }
                            return result
                        },
                        parameters: {
                            type: "object",
                            properties: {
                                discordId: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    }
                                }
                            },
                            required: ["discordId"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "d2_get_character_inventory",
                        description: "Get a list of items that the given user has equipped in Destiny 2. Includes subclass and mod info.",
                        parse: JSON.parse,
                        function: async (props: { discordId: string, characterId: string }) => {
                            let destinyOAuthDetails = await getD2AccessToken(props.discordId)
                            if (!destinyOAuthDetails) return "Either this user does not exist, or they have not linked their D2 account"

                            let client = getClient(destinyOAuthDetails.accessToken)
                            let profile = await getCharacter(client, {
                                characterId: props.characterId,
                                components: [
                                    DestinyComponentType.Characters,
                                    DestinyComponentType.CharacterEquipment,
                                    DestinyComponentType.ItemSockets
                                ],
                                destinyMembershipId: destinyOAuthDetails.membershipId,
                                membershipType: destinyOAuthDetails.membershipType
                            })

                            let output: DestinyCharacterSerialised[] = []
                            let equipment = profile.Response.equipment.data
                            if (!equipment) return "No equipment data was returned by the Bungie.NET API"
                            if (!profile.Response.itemComponents.sockets.data) return "No item socket data returned by the Bungie.NET API"
                            let itemSocketComponents = profile.Response.itemComponents.sockets.data
                            if (!profile.Response.plugSets.data?.plugs) return "No plug data returned by the Bungie.NET API"
                            // let plugs = profile.Response.plugSets.data?.plugs

                            let character = profile.Response.character.data;
                            if (!character) return "No character data returned by the Bungie.NET API"
                            let characterData: DestinyCharacterSerialised = serialiseDestinyCharacter(character)

                            // Process equipped items
                            let preFetchedItems = await MANIFEST_SEARCH.items.byHash(equipment.items.map(i => i.itemHash))

                            // Pre-fetch plugs
                            let plugIds = equipment.items
                                .map(
                                    item => item.itemInstanceId ? itemSocketComponents[item.itemInstanceId]?.sockets.map(socket => socket.plugHash) : []
                                )
                                .flat(1)
                                .filter(i => !!i) as number[]
                            let plugs = await MANIFEST_SEARCH.items.byHash(plugIds)

                            for (let item of equipment.items) {
                                characterData.items.push(await serialiseDestinyEquippedItem(
                                    item,
                                    preFetchedItems,
                                    item.itemInstanceId ? itemSocketComponents[item.itemInstanceId]?.sockets : undefined,
                                    plugs
                                ))
                            }
                            output.push(characterData)

                            console.log(JSON.stringify(output))
                            return output
                        },
                        parameters: {
                            type: "object",
                            properties: {
                                discordId: {
                                    type: "string"
                                },
                                characterId: {
                                    type: "string",
                                    description: "The user's Destiny 2 character ID"
                                }
                            },
                            required: ["discordId", "characterId"]
                        }
                    }
                }

            ],
            "channel_" + channel.id
        );
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
            content: JSON.stringify({discordId: msg.author.id, message: messageContent})
        })
        void this.delayedSendToAI()
        return
    }

    async saveMessage(message: ChatCompletionMessageParam, ignoreDateCheck ?: boolean):
        Promise<void> {
        this.controller?.abort("Received a new message")
        if (this._currentDate?.getDate() !== (new Date()).getDate()
        ) {
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

    async sendToAI()
        :
        Promise<ChatCompletionMessageParam> {
        let interval = setInterval(() => {
            void this.#channel.sendTyping()
        }, 3000)
        return super.sendToAI()
            .finally(() => clearInterval(interval))
    }
}

function serialiseRole(role: Role) {
    return {
        id: role.id,
        name: role.name,
        members: role.members.map(m => ({
            id: m.id,
            name: m.displayName,
        })),
    }
}

async function serialiseDestinyEquippedItem(
    item: DestinyItemComponent,
    prefetchedInventoryData: DestinyInventoryItemDefinition[],
    socketStates: DestinyItemSocketState[] | undefined,
    prefetchedPlugs: DestinyInventoryItemDefinition[],
): Promise<SerialisedDestinyItemData> {
    let manifestItem = prefetchedInventoryData.find(i => i.hash === item.itemHash)
    if (!manifestItem) throw new Error("Could not find item: " + item.itemHash)
    let plugIds = socketStates?.map(socket => socket.plugHash) ?? []
    let plugs = !socketStates ? [] : prefetchedPlugs.filter(plug => plugIds.includes(plug.hash))

    let data: SerialisedDestinyItemData = {
        itemName: manifestItem.displayProperties.name,
        itemType: itemTypeToText(manifestItem.itemType),
        mods: plugs.map(plug => plug.displayProperties.name),
        champions: {
            overload: false,
            barrier: false,
            unstoppable: false
        }
    }

    return data
}


async function getD2Characters(discordId: string) {
    let destinyOAuthDetails = await getD2AccessToken(discordId)
    if (!destinyOAuthDetails) return null

    let client = getClient(destinyOAuthDetails.accessToken)
    let profile = await getProfile(client, {
        components: [
            DestinyComponentType.Characters
        ],
        destinyMembershipId: destinyOAuthDetails.membershipId,
        membershipType: destinyOAuthDetails.membershipType
    })
    if (!profile.Response.characters.data) return null
    return Object.values(profile.Response.characters.data).map(i => serialiseDestinyCharacter(i))
}


function itemTypeToText(type: DestinyItemType) {
    switch (type) {
        case DestinyItemType.Armor:
            return "armor"
        case DestinyItemType.Aura:
            return "aura"
        case DestinyItemType.Bounty:
            return "bounty"
        case DestinyItemType.ClanBanner:
            return "clan banner"
        case DestinyItemType.Consumable:
            return "consumable"
        case DestinyItemType.Currency:
            return "currency"
        case DestinyItemType.Dummy:
            return "dummy"
        case DestinyItemType.Emblem:
            return "emblem"
        case DestinyItemType.Emote:
            return "emote"
        case DestinyItemType.Engram:
            return "engram"
        case DestinyItemType.ExchangeMaterial:
            return "exchange material"
        case DestinyItemType.Finisher:
            return "finisher"
        case DestinyItemType.Ghost:
            return "ghost"
        case DestinyItemType.Message:
            return "message"
        case DestinyItemType.MissionReward:
            return "mission reward"
        case DestinyItemType.Mod:
            return "mod"
        case DestinyItemType.QuestStep:
            return "quest step"
        case DestinyItemType.Package:
            return "package"
        case DestinyItemType.Pattern:
            return "pattern"
        case DestinyItemType.Quest:
            return "quest"
        case DestinyItemType.QuestStepComplete:
            return "quest step complete"
        case DestinyItemType.Subclass:
            return "subclass"
        case DestinyItemType.SeasonalArtifact:
            return "seasonal artifact"
        case DestinyItemType.Ship:
            return "ship"
        case DestinyItemType.Vehicle:
            return "vehicle"
        case DestinyItemType.Weapon:
            return "weapon"
        case DestinyItemType.Wrapper:
            return "wrapper"
        default:
            return "none"
    }
}


function serialiseDestinyCharacter(character: DestinyCharacterComponent): DestinyCharacterSerialised {
    return {
        characterId: character.characterId,
        dateLastPlayed: new Date(),
        minutesPlayedThisSeason: parseInt(character.minutesPlayedThisSession),
        minutesPlayedTotal: parseInt(character.minutesPlayedTotal),
        light: character.light,
        class: character.classType === DestinyClass.Titan
            ? "titan"
            : character.classType === DestinyClass.Hunter
                ? "hunter"
                : character.classType === DestinyClass.Warlock
                    ? "warlock"
                    : "unknown",
        race: character.raceType === DestinyRace.Human
            ? "human"
            : character.raceType === DestinyRace.Awoken
                ? "awoken"
                : character.raceType === DestinyRace.Exo
                    ? "exo"
                    : "unknown",
        items: []

    }
}
