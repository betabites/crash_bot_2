import {AIConversation, generateAIImage} from "../../services/ChatGPT/ChatGPT.js";
import SafeQuery, {sql} from "../../services/SQL.js";
import {ChatCompletionMessageParam} from "openai/resources/index";
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    Message,
    Role,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import {Character} from "./Speech.js";
import {PointsModule} from "./points/Points.js";
import moment from "moment-timezone"
import {GameSessionData, GameSessionModule} from "./GameSessionModule.js";
import {EVENT_IDS} from "./GameAchievements.js";
import {getCharacter, getProfile} from "bungie-net-core/endpoints/Destiny2";
import {getClient} from "./D2.js";
import {DestinyClass, DestinyComponentType, DestinyItemSubType, DestinyItemType} from "bungie-net-core/enums";
import type {
    DestinyCharacterComponent,
    DestinyInventoryItemDefinition,
    DestinyItemComponent,
    DestinyItemSocketState
} from "bungie-net-core/models";
import {DestinyRace} from "bungie.net";
import {MANIFEST_SEARCH} from "./D2/DestinyManifestDatabase.js";
import {getD2AccessToken} from "./D2/getD2AccessToken.js";
import {z} from "zod";

export const EVENT_KEYS = [
    "chill",
    "movie/tv show",
    "(game) destiny 2",
    "(game) among us",
    "(game) space engineers",
    "(game) bopl battle",
    "(game) lethal company",
    "(game) minecraft",
    "(game) phasmophobia",
    "(game) borderlands",
    "(game) escapists",
    "(game) garry's mod",
    "(game) northgard",
    "(game) oh deer",
    "(game) project playtime",
    "(game) terraria",
    "(game) warframe",
    "(game) who's your daddy",
    "other"
] as const
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

const EmptySchema = z.object({})
const GenerateImageSchema = z.object({
    description: z.string(),
    size: z.enum(["1024x1024", "1792x1024", "1024x1792"]).optional(),
    style: z.enum(["vivid", "natural"]).optional(),
    quality: z.enum(["standard", "hd"]).optional()
})
const BasicDiscordUserSchema = z.object({
    discord_id: z.string().regex(/^[0-9]{18}$/),
})
const RedditMemeSchema = z.object({
    subreddit: z.string().regex(/^r\/[a-zA-Z0-9-_]+$/).optional(),
    allowNSFW: z.boolean(),
    count: z.number().min(1).max(5).optional()
})
const EventSchema = z.object({
    activity: z.enum(EVENT_KEYS),
    description: z.string().min(10).max(1000),
    timeZoneCode: z.string().describe("Standard IANA format Region/Country. If not specified, assume Auckland/Pacific"),
    timestamp: z.string().datetime().describe("Timestamp for when this event starts."),
    maximumPlayers: z.number().optional(),
    minimumPlayers: z.number().optional()
})
const DestinyCharacterFetchSchema = BasicDiscordUserSchema.extend({
    characterId: z.string().regex(/^[0-9]{18}$/).describe("The user's Destiny 2 character ID")
})
const DestinyFetchVaultSchema = BasicDiscordUserSchema.extend({
    fetchOnlyTypes: z.array(z
        .number()
        .describe("0: None, 1: Currency, 2: Armor, 3: Weapon, 7: Message, 8: Engram, 9: Consumable, 10: ExchangeMaterial, 11: MissionReward, 12: QuestStep, 13: QuestStepComplete, 14: Emblem, 15: Quest, 16: Subclass, 17: ClanBanner, 18: Aura, 19: Mod, 20: Dummy, 21: Ship, 22: Vehicle, 23: Emote, 24: Ghost, 25: Package, 26: Bounty, 27: Wrapper, 28: SeasonalArtifact, 29: Finisher, 30: Pattern")
        .min(0)
        .max(30)
    ).min(1).max(30)
})

const DIMLoadoutItemSchema = z.object({
    hash: z.number(),
})

const DIMLoadoutSchema = z.object({
    name: z.string(),
    classType: z.nativeEnum(DestinyClass),
    equipped: z.array(DIMLoadoutItemSchema),
    unequipped: z.array(DIMLoadoutItemSchema)
})

export class GPTTextChannel extends AIConversation {
    channel: TextBasedChannel;
    #lastMessage: Message | undefined;
    #knownUserMappings = new Map<string, string>() // Maps usernames to discord user IDs. Contains the IDs of users in the conversation.
    #isTypingInterval: null | {interval: NodeJS.Timeout, timeout: NodeJS.Timeout} = null;
    _currentDate: Date | null = null
    _actionRowQueue: ActionRowBuilder<ButtonBuilder>[] = [];
    private client: Client;

    static async load(channel: TextBasedChannel, client: Client, system_message?: string) {
        let messages = await SafeQuery<{ content: string }>(sql`SELECT content
                                                                FROM AiConversationHistory
                                                                WHERE conversation_id = ${"channel_" + channel.id}`);

        let messages_parsed: ChatCompletionMessageParam[]
        if (system_message) messages_parsed = [
            {role: "system", content: system_message},
            ...messages.recordset.map(record => JSON.parse(record.content))
        ]
        else messages_parsed = messages.recordset.map(record => JSON.parse(record.content))
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
        super(messages, "channel_" + channel.id);
        this.channel = channel
        this.client = client
        this.on("message_stop", async message => {
            let content = typeof message.content === "string"
                ? message.content
                : message.content?.map(item => item.type === "text" ? item.text : `> ${item.refusal}`).join("\n") ?? ""
            while (content.length > 2000) {
                await this.channel.send({
                    content: content.substring(0, 2000),
                    allowedMentions: {
                        parse: [],
                        users: [],
                        roles: [],
                        repliedUser: false
                    },
                })
                content = content.substring(2000)
            }

            let embeds: EmbedBuilder[] = []
            for (let tool_call of message.tool_calls ?? []) {embeds.push(
                new EmbedBuilder()
                    .setDescription(`Running tool: ${tool_call.function.name}`)
            )}
            if (message.refusal) embeds.push(new EmbedBuilder()
                .setColor("Red")
                .setDescription(message.refusal)
            )

            if (content.length !== 0 || embeds.length !== 0) this.channel.send({
                content,
                embeds,
                allowedMentions: {
                    parse: [],
                    users: [],
                    roles: [],
                    repliedUser: false
                },
            })
        })
        this.on("error", error => {
            void this.channel.send({
                embeds: [new EmbedBuilder()
                    .setDescription(
                        `We encountered an error while processing your request. Please try again later.\n\n\`\`\`${error}\`\`\``
                    )
                    .setColor("Red")
                ],
                allowedMentions: {
                    parse: [],
                    users: [],
                    roles: [],
                    repliedUser: false
                },
            })
        })
    }

    @AIToolCallWithStatus("generate_image", "Generate an image from the given text. Only use if explicitly asked for", GenerateImageSchema, {
        start: () => "Generating image...",
        error: (data, e) => `Failed to generate image:\n` + "```" + e + "```",
    })
    async generateImage(props: z.infer<typeof GenerateImageSchema>): Promise<string> {
        let image = await generateAIImage({
            prompt: props.description,
            model: "dall-e-3",
            response_format: "url",
            quality: props.quality,
            size: props.size
        })
        if (!image.data[0].url) throw new Error("No image returned by the API")
        await this.channel.send({
            files: [new AttachmentBuilder(image.data[0].url, {
                name: "image.webp"
            })],
        })
        return "Image has been sent to the user"
    }

    @AIToolCallWithStatus("get_now", "Get the current date and time", EmptySchema, {end: () => "Crash Bot fetched the system time"})
    async getNow(data: z.infer<typeof EmptySchema>): Promise<string> {
        return GPTTextChannel.toAIDate(new Date(), true)
    }

    @AIToolCallWithStatus("get_points", "Get the points for a given user", BasicDiscordUserSchema, {end: (data) => `Crash Bot fetched the points for <@${data.discord_id}>`})
    async getDate(data: z.infer<typeof BasicDiscordUserSchema>): Promise<string> {
        let points = await PointsModule.getPoints(data.discord_id);
        return `Level: ${points.level}, Points: ${points.points}/${PointsModule.calculateLevelGate(points.level + 1)}`
    }

    @AIToolCallWithStatus(
        "send_memes",
        "Send random memes from Reddit to the conversation channel",
        RedditMemeSchema,
        {
            start: ({subreddit, allowNSFW, count}) => `Crash Bot is fetching ${count || 1} memes from ${subreddit ? `r/${subreddit}` : "Reddit"}`,
        }
    )
    async sendMemes({subreddit, allowNSFW, count}: z.infer<typeof RedditMemeSchema>): Promise<string> {
        if (!count) count = 1

        let endpoint = subreddit
            ? `http://meme-api.com/gimme/${subreddit.replace("r/", "")}/${count}`
            : `http://meme-api.com/gimme/${count}`
        // let refleshGuild = this.client.guilds.cache.get("892518158727008297")

        let req = await fetch(endpoint)
        let res = await req.json() as Partial<{
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
        }>

        let results: { title: string, url: string }[] = []
        for (let meme of res.memes ?? []) {
            if (meme.nsfw && !allowNSFW) {
                console.log("NSFW meme disallowed: GPT did not ask for nsfw")
                return "Fetched meme was NSFW"
            }
            if (meme.nsfw
                && this.channel instanceof TextChannel
                && !this.channel.nsfw
            ) {
                console.log("NSFW meme disallowed: User does not have required discord role")
                return "This user is not permitted to access NSFW content"
            }
            if (meme.nsfw && this.channel.type !== ChannelType.DM && (this.channel.type !== ChannelType.GuildText || !this.channel.nsfw)) {
                console.log("NSFW meme disallowed: Cannot send in a non-nsfw guild channel")
                return "Cannot send NSFW content in this channel"
            }
            results.push({title: meme.title, url: meme.url})
        }

        await this.channel.send({files: results.map(item => new AttachmentBuilder(item.url, {}))})
        return "Fetched memes with the following names and sent them to the conversation channel; " + JSON.stringify(results.map(i => i.title))
    }

    @AIToolCallWithStatus("create_event", "Create a new event", EventSchema, {})
    async createEvent(props: z.infer<typeof EventSchema>): Promise<string> {
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

        let message = await this.channel.send("`creating an event...`")
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

        return "Created new event"
    }

    @AIToolCallWithStatus("get_events", "Get all events", EmptySchema, {
        start: data => "Fetching all events...",
        end: data => "Fetched all events"
    })
    async getEvents(props: {}): Promise<string> {
        let events = await GameSessionModule.getAllGameSessions()
        for (let event of events) {
            let handler = GameSessionModule.sessionBindings.get(event.game_id);
            if (!handler) continue

            // this._embedQueue.push(handler.buildInviteEmbed(event))
        }

        let statusMessage = await this.channel.send({
            embeds: [new EmbedBuilder().setColor("Blue").setDescription(`Crash Bot fetched all events`)],
        })
        return JSON.stringify(events)
    }

    @AIToolCallWithStatus("get_roles", "Get a list of all roles in this Discord server", EmptySchema, {
        start: data => "Fetching all Discord roles...",
        end: data => "Fetched all Discord roles"
    })
    async getRoles(props: {}): Promise<string> {
        if (this.channel.type === ChannelType.DM) {
            return "This function is not available for Discord DM-based communications";
        }
        let roles = await this.channel.guild.roles.fetch();
        let statusMessage = await this.channel.send({
            embeds: [new EmbedBuilder().setColor("Blue").setDescription(`Crash Bot fetched all Discord roles in this server`)],
        })
        return JSON.stringify(roles.map((value) => serialiseRole(value)))
    }

    @AIToolCallWithStatus("d2_get_character", "Get a user's Destiny 2 character", BasicDiscordUserSchema, {
        start: data => `Fetching Destiny 2 character for <@${data.discord_id}>`,
        end: data => `Fetched Destiny 2 character for <@${data.discord_id}>`,
        error: (data, err) => `Failed to fetch Destiny 2 character for <@${data.discord_id}>` + "\n```Errors for Bungie.NET are hidden. Try running /destiny2 login to resolve issues.```"
    })
    async getD2Character(data: z.infer<typeof BasicDiscordUserSchema>): Promise<string> {
        let character = await getD2Characters(data.discord_id)
        if (!character) return "User has not linked their Bungie.NET account"
        return JSON.stringify(character)
    }

    @AIToolCallWithStatus("d2_get_character_inventory", "Get a list of items that the given user has equipped in Destiny 2. Includes subclass and mod info.", DestinyCharacterFetchSchema, {
        start: data => `Fetching Destiny 2 character for <@${data.discord_id}>`,
        end: data => `Fetched Destiny 2 character for <@${data.discord_id}>`,
        error: (data, err) => `Failed to fetch Destiny 2 character for <@${data.discord_id}>` + "\n```Errors for Bungie.NET are hidden. Try running /destiny2 login to resolve issues.```"
    })
    async getD2CharacterItems(props: z.infer<typeof DestinyCharacterFetchSchema>): Promise<string> {
        let destinyOAuthDetails = await getD2AccessToken(props.discord_id)
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
        if (!equipment) throw new Error("No equipment data was returned by the Bungie.NET API")
        if (!profile.Response.itemComponents.sockets.data) throw new Error("No item socket data returned by the Bungie.NET API")
        let itemSocketComponents = profile.Response.itemComponents.sockets.data
        if (!profile.Response.plugSets.data?.plugs) throw new Error("No plug data returned by the Bungie.NET API")
        // let plugs = profile.Response.plugSets.data?.plugs

        let character = profile.Response.character.data;
        if (!character) throw new Error("No character data returned by the Bungie.NET API")
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
        return JSON.stringify(output)
    }

    @AIToolCallWithStatus("d2_get_all_inventory", "Get all items a player currently has", DestinyFetchVaultSchema, {
        start: data => `Fetching Destiny 2 character for <@${data.discord_id}>`,
        end: data => `Fetched Destiny 2 character for <@${data.discord_id}>`,
        error: (data, err) => `Failed to fetch Destiny 2 character for <@${data.discord_id}>` + "\n```Errors for Bungie.NET are hidden. Try running /destiny2 login to resolve issues.```"
    })
    async getD2AllInventory(props: z.infer<typeof DestinyFetchVaultSchema>): Promise<string> {
        let items = await fetchAllItemsInInventory(props.discord_id)
        if (items === null) return "User has not linked their Bungie.NET account"
        console.log("Fetching ", props.fetchOnlyTypes)

        // Get item details from manifest
        let itemHashes: number[] = []
        for (let item of items) itemHashes.push(item[1].itemHash)
        let manifestItems = await MANIFEST_SEARCH.items.byHash(itemHashes)

        let res: {
            id: string,
            hash: number,
            name: string,
            type: (typeof DestinyItemType)[keyof typeof DestinyItemType],
            subType: (typeof DestinyItemSubType)[keyof typeof DestinyItemSubType]
        }[] = []
        let limited = false
        for (let item of items) {
            let manifestItem = manifestItems.find(i => i.hash === item[1].itemHash)
            if (!manifestItem) continue
            if (!manifestItem.itemType || !props.fetchOnlyTypes.includes(manifestItem.itemType)) continue
            res.push({
                id: item[0],
                hash: item[1].itemHash,
                name: manifestItem.displayProperties.name,
                type: manifestItem.itemType,
                subType: manifestItem.itemSubType
            })
            if (res.length >= 100) {
                limited = true
                break
            }
        }
        return JSON.stringify({DestinyItemType, DestinyItemSubType, res, limited})
    }

    @AIToolCallWithStatus("d2_plan_build", "Read the guide on how to plan a build. ALWAYS READ FIRST BEFORE FETCHING ANY DATA WHEN MAKING A BUILD!", EmptySchema, {
        end: data => "Got instructions for how to plan a Destiny 2 build",
    })
    async planD2Build(data: {}): Promise<string> {
        return `Follow these steps to plan a Destiny 2 build:
    When fetching data about the character, always fetch the character first, then the inventory. This ensures you have all required information.
    ALWAYS RUN 'd2_get_all_inventory' ONCE PER SLOT IN THE BUILD! This should end up being used 7 times (3 weapons, 4 armour).
        
<WeaponsGuide>Pick exactly 1 exotic weapon that the user already has, and plan the build around it. You need to pick 1 weapon per slot (Primary, Secondary, and Heavy), including the exotic</WeaponsGuide>
<ArmourGuide>Pick 1 armour piece for each of the following slots. Armour piece must match the user's desired class. YOU must also pick a shader and up to 5 mods for each armour piece. Mods must adhere to the build rules and constraints for Destiny 2:
- Head
- Chest
- Arms
- Legs
</ArmourGuide>
<ClassGuide>You need to pick ALL options that link to a player's class. This includes:
- Class (Solar, Arc, Void, etc)
- Sub-class (Dawnblade, etc)
- Melee
- Grenade
- Character ability (ie rift/barrier/dodge)
- Aspects
- Fragments
</ClassGuide>
ALWAYS SEND THE RESULT AS A DIM BUILD UNLESS SPECIFICALLY REQUESTED!
        `
    }

    @AIToolCallWithStatus("dim_create_build", "Convert a Destiny 2 build object into a URL. Always perfer this over sharing the actual Destiny 2 build", DIMLoadoutSchema, {})
    async createDIMLoadout(data: z.infer<typeof DIMLoadoutSchema>): Promise<string> {
        this.channel.send(`https://app.destinyitemmanager.com/loadouts?loadout=${encodeURIComponent(JSON.stringify(data))}`)
        return "Created DIM loadout and sent it to the user"
    }

    unload() {
        this.removeAllListeners()
    }

    async processMessage([msg]: [Message], messageContent: string, character: Character | null) {
        if (msg.author.id === this.client.user?.id) return
        this.#knownUserMappings.set((msg.author.displayName ?? msg.author.username).toLowerCase(), msg.author.id)
        this.appendMessage({
            role: "user",
            name: character?.name || (msg.author.displayName ?? msg.author.username).replaceAll(/[^A-z]/g, ""),
            content: JSON.stringify({discordId: msg.author.id, message: messageContent})
        })
        void this.delayedSendToAI()
        return
    }

    appendMessage(message: ChatCompletionMessageParam, ignoreDateCheck ?: boolean) {
        this.controller?.abort("Received a new message")
        if (this._currentDate?.getDate() !== (new Date()).getDate()) {
            this._currentDate = new Date()
            // Day has changed,
            super.appendMessage({
                role: "system",
                content: `The current date is: ${GPTTextChannel.toAIDate(new Date())}`
            })
        }
        return super.appendMessage(message);
    }

    delayedSendToAI() {
        if (this.delayedSendTimer) clearTimeout(this.delayedSendTimer)
        this.delayedSendTimer = setTimeout(() => {
            this.sendToAI()
        }, 1500)
    }

    async sendToAI() {
        if (!this.#isTypingInterval) {
            void this.channel.sendTyping()
            let interval = setInterval(() => {
                void this.channel.sendTyping()
            }, 3000)
            // In case for any odd reason an error occurs, the following timeout ensures that the bot doesn't remain in an 'is typing' state forever.
            let timeout: NodeJS.Timeout
            const clear = () => {
                clearInterval(interval)
                clearTimeout(timeout)
                this.#isTypingInterval = null
                this.removeListener("message_stop", clear)
                this.removeListener("error", clear)
            }
            timeout = setTimeout(() => clear(), 30000)
            this.#isTypingInterval = {interval, timeout}

            this.once("message_stop", clear)
            this.once("error", clear)
        }
        return super.sendToAI()
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

async function fetchAllItemsInInventory(discordId: string) {
    let destinyOAuthDetails = await getD2AccessToken(discordId)
    if (!destinyOAuthDetails) return null

    let client = getClient(destinyOAuthDetails.accessToken)
    let profile = await getProfile(client, {
        components: [
            DestinyComponentType.ProfileInventories,
            DestinyComponentType.Characters,
            DestinyComponentType.CharacterInventories,
            DestinyComponentType.CharacterEquipment,
            DestinyComponentType.ItemInstances
        ],
        destinyMembershipId: destinyOAuthDetails.membershipId,
        membershipType: destinyOAuthDetails.membershipType
    })
    if (!profile.Response.characters.data || !profile.Response.profileInventory.data) throw new Error("No characters returned")
    // let activeCharacter = profile.Response.characters.data[Object.keys(profile.Response.characters.data)[0]]
    // let characterClass = activeCharacter.classType

    const allItems = new Map<string, DestinyItemComponent>()
    const vaultItems = profile.Response.profileInventory.data.items || [];
    vaultItems.forEach(item => {
        if (item.itemInstanceId) allItems.set(item.itemInstanceId, item);
    });
    return allItems
}

function itemTypeToText(type: (typeof DestinyItemType)[keyof typeof DestinyItemType]) {
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

export function AIToolCallWithStatus<SCHEMA extends z.Schema<any>>(
    toolName: string,
    description: string,
    schema: SCHEMA,
    messageBuilders: {
        start?: (data: z.infer<SCHEMA>) => string | false,
        end?: (data: z.infer<SCHEMA>, res: unknown) => string | false,
        error?: (data: z.infer<SCHEMA>, e: unknown) => string | false,
    }
) {
    function decorator<CLASS extends GPTTextChannel>(originalMethod: (data: z.infer<SCHEMA>) => Promise<string>, context: ClassMethodDecoratorContext<CLASS>) {
        async function newMethod (this: CLASS, data: z.infer<SCHEMA>) {
            let statusMessage: Message | undefined
            const updateStatusMessage = async (builder:  (builder: EmbedBuilder) => EmbedBuilder) => {
                if (!statusMessage) statusMessage = await this.channel.send({embeds: [builder(new EmbedBuilder())]})
                else statusMessage.edit({embeds: [builder(new EmbedBuilder())]})
            }

            try {
                if (messageBuilders.start) {await updateStatusMessage(b => b
                    .setColor("Yellow")
                    // @ts-expect-error
                    .setDescription(messageBuilders.start(data))
                )}
                let res = await originalMethod.call(this, data)
                if (messageBuilders.end) {void updateStatusMessage(b => b
                    .setColor("Green")
                    // @ts-expect-error
                    .setDescription(messageBuilders.end(data, res))
                )}
                else if (statusMessage) {
                    void statusMessage.delete()
                }
                return res
            } catch (e) {
                if (messageBuilders.error) {void updateStatusMessage(b => b
                    .setColor("Red")
                    // @ts-expect-error
                    .setDescription(messageBuilders.error(data, e))
                )}
                else {
                    // Show a standard error for all tools that fail
                    void updateStatusMessage(b => b
                        .setColor("Red")
                        .setDescription(`Tool ${toolName} failed:` + "\n```" + (e as Error).toString().substring(0, 200) + "```")
                    )
                }
                throw e
            }
        }

        context.addInitializer(function init(this: CLASS) {
            this.functions.set(toolName, {
                schema,
                description,
                func: newMethod.bind(this)
            })
        })

        return originalMethod
    }

    return decorator
}
