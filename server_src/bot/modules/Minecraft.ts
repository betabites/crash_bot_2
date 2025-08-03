import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Logging} from '@google-cloud/logging';
import type {GetEntriesRequest} from "@google-cloud/logging/build/src/log.js";
import {PubSub} from '@google-cloud/pubsub';
import {IO} from "@/server_src/getHttpServer.js"
import {
    ChannelType,
    Client,
    EmbedBuilder,
    GuildMember, Message,
    MessageCreateOptions,
    MessagePayload,
    SlashCommandBuilder,
    TextChannel
} from "discord.js";
import {contextSQL} from "../../services/SQL";
import {sendImpersonateMessage} from "../../services/Discord";
import {Pterodactyl} from "./Pterodactyl";

// Create a PubSub client
const pubsub = new PubSub();

const topicName = 'pterodactyl-connection-history-measure '
const subscriptionName = 'crashbot-connection-history-subscription'

// const SERVER_CHAT_ID = "968298113427206195"
const SERVER_CHAT_ID = "892518396166569994"
const SCOREBOARD_MSG_ID = "1105257601450651719"
// const VERIFY_KEY = ""

type PlayerData = {
    username: string,
    id: string,
    dead: boolean,
    experience: {
        level: number,
        xp: number,
    },
    position: [number, number, number],
    dimension: string
}

type AdvancementData = {
    id: string,
    display: {
        title: string,
    }
}

type MessageData = {
    player: PlayerData,
    message: string,
    submitted: boolean,
}

type ShowItem = {
    id: string,
    count?: number,
    tag?: string,
}

type ShowEntity = {
    type: string,
    id: string,
    name?: TextComponent
}

type ScoreComponentValue = {
    name: string,
    objective: string,
    value?: string,
}

type NBTComponent = {
    nbt: string,
    block?: string,
    entity?: string,
    storage?: string,
    interpret?: boolean,
    separator?: TextComponent | TextComponent[]
}

type BaseTextComponent = {
    color?: string,
    bold?: boolean,
    italic?: boolean,
    underlined?: boolean,
    strikethrough?: boolean,
    obfuscated?: boolean,
    insertion?: string,
    clickEvent?: {
        action: "open_url" | "run_command" | "suggest_command" | "change_page" | "copy_to_clipboard";
        value: string;
    },
    hoverEvent?: {
        action: "show_text" | "show_item" | "show_entity";
        value: TextComponent | ItemHover | EntityHover;
    },
    font?: string,
    extra?: BaseTextComponent[],
}

type TextComponent =
    | (BaseTextComponent & { text: string })
    | (BaseTextComponent & { translate: string; with?: TextComponent[] })
    | (BaseTextComponent & { score: ScoreComponentValue })
    | (BaseTextComponent & { selector: string })
    | (BaseTextComponent & { keybind: string })
    | (BaseTextComponent & NBTComponent);

type TellRawMessage = null | string | boolean | number | TextComponent | TellRawMessage[]

export class Minecraft extends BaseModule {
    commands = [
        // new SlashCommandBuilder()
        //     .setName('minecraft')
        //     .setDescription('Minecraft commands')
        //     .setDefaultMemberPermissions(PermissionFlags.)
        //     .addSubcommand(subcommand => subcommand
        //         .setName('execute')
        //         .setDescription('Execute a command on the server')
        //         .addStringOption(option => option
        //             .setName('server')
        //             .setDescription('The server to connect to')
        //             .setRequired(true)
        //         )
        //     )
    ]
    static IO = (async () => {
        const io = await IO
        return io.of('/minecraft')
    })()
    onlinePlayers = new Map<string, PlayerData>()
    channel: TextChannel | null = null

    constructor(client: Client) {
        super(client);

        void this.#prepareListeners()
    }

    @OnClientEvent("messageCreate")
    async onMessageCreate(message: Message) {
        if (message.webhookId) return
        const username = message.member?.displayName
            || message.author.displayName
            || message.author.username
        const color = message.member?.displayHexColor
            || "#fff"
        const tellRawMessage: TellRawMessage = [
            {text: `[${username}] `, color},
            message.content,
        ]
        for (let attachment of message.attachments.values()) {
            tellRawMessage.push({
                text: ` [${attachment.name}]`,
                color,
                hoverEvent: {
                    action: "show_text",
                    value: {
                        text: attachment.url,
                        color: "#fff",
                    },
                },
                clickEvent: {
                    action: "open_url",
                    value: attachment.url,
                },
            })
        }

        await this.#sendTellRaw("@a", tellRawMessage)
    }

    async #prepareListeners() {
        const io = await Minecraft.IO
        setInterval(() => {
            io.to("keepalive").emit("ping")
        }, 1000)

        const _channel = await this.client.channels.fetch(SERVER_CHAT_ID)
        if (_channel?.type !== ChannelType.GuildText) throw new Error("Could not find server chat channel")
        this.channel = _channel

        io.on('connection', (socket) => {
            console.log('a minecraft server connected')
            this.channel?.send({embeds: [new EmbedBuilder().setTitle("🟢 Server online")]})
            socket.join('minecraft')
            socket.join('keepalive')

            socket.on('disconnect', () => {
                console.log('a minecraft server disconnected')
                this.recordServerDisconnection()
            })

            socket.on('updatePlayer', async (player: PlayerData) => {
                const isKnownUser = await this.updateUser(player)
                if (isKnownUser) return

            })
            socket.on('playerDeath', async (player: PlayerData) => {
                await this.updateUser(player)
            })
            socket.on('disconnectPlayer', async (player: PlayerData) => {
                const user_id = await this.getDiscordIDFromMinecraftID(player.id)
                console.log("DISCONNECT", user_id, player.id)
                await this.recordUserDisconnection(player.id)
                await this.sendDiscordMessage({
                    payload: {
                        embeds: [new EmbedBuilder().setTitle("left the game")]
                    },
                    member: user_id ? await this.channel?.guild.members.fetch(user_id) : null,
                    name: player.id
                })
            })
            socket.on("platerAdvancementEarn", (data: { player: PlayerData, advancement: AdvancementData }) => {
                const user_id = this.getDiscordIDFromMinecraftID(data.player.id)
                this.updateUser(data.player)
            })
            socket.on("message", async (data: MessageData) => {
                const user = await this.getDiscordIDFromMinecraftID(data.player.id)
                console.log("MESSAGE", user, data.player.id, data.message)
                await this.updateUser(data.player, user)
                // const discordUser = user ? await this.channel?.guild.members.fetch(user) : null

                await this.sendDiscordMessage({
                    payload: data.message,
                    member: user ? await this.channel?.guild.members.fetch(user) : null,
                    name: data.player.id
                })
            })
        })
    }

    async sendDiscordMessage(options: {
        payload: MessagePayload | MessageCreateOptions | string,
        member?: GuildMember | null,
        name?: string,
    }) {
        if (!this.channel) throw new Error("Channel not bound yet")
        const member = options.member || this.channel.guild.members.me
        if (!member) throw new Error("Unknown error")

        await sendImpersonateMessage(
            this.channel,
            member,
            options.payload,
            options.member ? null : options.name,
        )
    }

    async getDiscordIDFromMinecraftID(minecraft_id: string): Promise<string | null> {
        // attempt to find the user
        const user = await contextSQL<{ discord_id: string }>`
            SELECT discord_id
            FROM Users
            WHERE mc_id = ${minecraft_id}`
        return user.recordset[0]?.discord_id ?? null
    }

    /**
     Returns 'true' if it's a new session
     */
    async updateUser(playerData: PlayerData, user_id: string | null = null): Promise<boolean> {
        // Detect if the user already has open history
        this.onlinePlayers.set(playerData.id, playerData)
        const res = await contextSQL`
            SELECT *
            FROM dbo.ValheimConnectionHistory
            WHERE MC_ID = ${playerData.id}
              AND sessionEnd IS NULL`
        if (res.recordset.length > 0) return false
        if (!user_id) user_id = await this.getDiscordIDFromMinecraftID(playerData.id)

        await contextSQL`
            INSERT INTO dbo.ValheimConnectionHistory (MC_ID, sessionStart, user_id)
            VALUES (${playerData.id}, ${new Date()}, ${user_id})`
        await this.sendDiscordMessage({
            payload: {
                embeds: [new EmbedBuilder().setTitle("joined the party")]
            },
            member: user_id ? await this.channel?.guild.members.fetch(user_id) : null,
            name: playerData.id,
        })
        Pterodactyl.scheduleShutdown(Infinity)
        return true
    }

    async recordUserDisconnection(minecraft_id: string) {
        this.onlinePlayers.delete(minecraft_id)

        await contextSQL`
            UPDATE dbo.ValheimConnectionHistory
            SET sessionEnd = ${new Date()}
            WHERE MC_ID = ${minecraft_id}
              AND sessionEnd IS NULL`

        if (this.onlinePlayers.size !== 0) return

        // Schedule server shutdown
        Pterodactyl.scheduleShutdown(60 * 5)
    }

    async recordServerDisconnection() {
        await contextSQL`
            UPDATE dbo.ValheimConnectionHistory
            SET sessionEnd = ${new Date()}
            WHERE sessionEnd IS NULL`
    }

    async #sendTellRaw(selector: string, message: TellRawMessage) {
        const io = await Minecraft.IO
        io.to("minecraft").emit("sendCommand", `tellraw ${selector} ${JSON.stringify(message)}"`)
    }

    async #sendCommand(command: string) {
        const io = await Minecraft.IO
        await io.to("minecraft").emit("sendCommand", command)
    }
}

async function* getEntries(query?: Omit<GetEntriesRequest, "pageSize" | "pageToken">) {
    const logging = new Logging();
    let nextPageToken: null | string = null;
    const baseQuery: GetEntriesRequest = {...(query ?? {}), pageSize: 50}

    while (true) {
        // console.log(baseQuery)
        let [iterator, req, response] = await logging.getEntries(baseQuery);
        for (let entry of iterator) {
            yield entry;
        }

        if (!response.nextPageToken) break;
        baseQuery.pageToken = response.nextPageToken;
    }
}
