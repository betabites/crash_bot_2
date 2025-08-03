import {BaseModule} from "./BaseModule.js";
import {Logging} from '@google-cloud/logging';
import type {GetEntriesRequest} from "@google-cloud/logging/build/src/log.js";
import {PubSub} from '@google-cloud/pubsub';
import {IO} from "@/server_src/getHttpServer.js"
import {
    ChannelType,
    Client,
    EmbedBuilder,
    GuildMember,
    MessageCreateOptions,
    MessagePayload,
    TextChannel
} from "discord.js";
import {contextSQL} from "../../services/SQL";
import {sendImpersonateMessage} from "../../services/Discord";

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

export class Minecraft extends BaseModule {
    static IO = (async () => {
        const io = await IO
        return io.of('/minecraft')
    })()
    channel: TextChannel | null = null

    constructor(client: Client) {
        super(client);
        void this.#prepareListeners()
    }

    async #prepareListeners() {
        const io = await Minecraft.IO
        const _channel = await this.client.channels.fetch(SERVER_CHAT_ID)
        if (_channel?.type !== ChannelType.GuildText) throw new Error("Could not find server chat channel")
        this.channel = _channel

        io.on('connection', (socket) => {
            console.log('a minecraft server connected')
            socket.join('minecraft')

            socket.on('disconnect', () => {
                console.log('a minecraft server disconnected')
                this.recordServerDisconnection()
            })

            socket.on('updatePlayer', async (player: PlayerData) => {
                const isKnownUser = await this.recordUserConnection(player.id)
                if (isKnownUser) return

            })
            socket.on('playerDeath', async (player: PlayerData) => {
                const user_id = await this.getDiscordIDFromMinecraftID(player.id)
                await this.recordUserConnection(player.id, user_id)
            })
            socket.on('disconnectPlayer', async (player: PlayerData) => {
                const user_id = await this.getDiscordIDFromMinecraftID(player.id)
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
                this.recordUserConnection(data.player.id)
            })
            socket.on("message", async (data: MessageData) => {
                const user = await this.getDiscordIDFromMinecraftID(data.player.id)
                await this.recordUserConnection(data.player.id, user)
                const discordUser = user ? await this.channel?.guild.members.fetch(user) : null

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
            SELECT id
            FROM Users
            WHERE mc_id = ${minecraft_id}`
        return user.recordset[0]?.discord_id ?? null
    }

    /**
    Returns 'true' if it's a new session
     */
    async recordUserConnection(minecraft_id: string, user_id: string | null = null): Promise<boolean> {
        // Detect if the user already has open history
        const res = await contextSQL`
            SELECT *
            FROM dbo.ValheimConnectionHistory
            WHERE MC_ID = ${minecraft_id}
              AND sessionEnd IS NULL`
        if (res.recordset.length > 0) return false


        await contextSQL`
            INSERT INTO dbo.ValheimConnectionHistory (MC_ID, sessionStart, user_id)
            VALUES (${minecraft_id}, ${new Date()}, ${user_id})`
        await this.sendDiscordMessage({
            payload: {
                embeds: [new EmbedBuilder().setTitle("joined the party")]
            },
            member: user_id ? await this.channel?.guild.members.fetch(user_id) : null,
            name: minecraft_id,
        })
        return true
    }

    async recordUserDisconnection(minecraft_id: string) {
        await contextSQL`
            UPDATE dbo.ValheimConnectionHistory
            SET sessionEnd = ${new Date()}
            WHERE MC_ID = ${minecraft_id} AND sessionEnd IS NULL`
    }

    async recordServerDisconnection() {
        await contextSQL`
            UPDATE dbo.ValheimConnectionHistory
            SET sessionEnd = ${new Date()}
            WHERE sessionEnd IS NULL`
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
