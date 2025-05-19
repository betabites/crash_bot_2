import {EventEmitter} from "events";
import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    NoSubscriberBehavior,
    PlayerSubscription,
    VoiceConnection
} from "@discordjs/voice";
import * as Discord from "discord.js";
import {EmbedBuilder, GuildMember} from "discord.js";
import ytdl from "@distube/ytdl-core";
import SafeQuery from "../SQL.ts";
import {makeid, QueueManager} from "../../misc/Common.ts";
import mssql from "mssql"
import {client} from "../Discord.ts";
import * as stream from "stream";
import {parentPort, workerData} from "worker_threads"
import {
    AcknowledgementMessage,
    AUDIO_MANAGER_MESSAGE_TYPES,
    ConnectMessage,
    messageToAudioManager,
    messageToVoiceManager,
    StreamStartMessage,
    VOICE_MANAGER_MESSAGE_TYPES
} from "./types.ts";
import crypto from "crypto";
import {ActiveVoiceRecording} from "./VoiceRecording.ts";
import dotenv from "dotenv";
import {isYoutubeUrl} from "../../utilities/isYoutubeUrl.ts";
import {createReadStream} from "node:fs"

client.login(workerData.discordClientToken)
dotenv.config()

const awaitingWorkerMessages = new Map<string, [NodeJS.Timer, (value: unknown) => void, (error?: unknown) => void]>()
parentPort?.on("message", async (message: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES>) => {
    console.log("Received message from parent thread", message)
    if (message.type === AUDIO_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT) {
        message.data = message.data as AcknowledgementMessage

        let item = awaitingWorkerMessages.get(message.id)
        if (!item) return
        // @ts-ignore
        clearTimeout(item[0])
        if (!message.data.error) item[1](message)
        else item[2](message.data.error)
        return
    }

    try {
        if (message.type === AUDIO_MANAGER_MESSAGE_TYPES.CONNECT_CHANNEL) {
            if (!message.data) return
            message.data = message.data as ConnectMessage
            const guild = await client.guilds.fetch(message.data.guildId)
            const channel = await client.channels.fetch(message.data.channelId) as Discord.VoiceBasedChannel
            await AudioStreamManager.join(guild, channel)
        }
        else if (message.type === AUDIO_MANAGER_MESSAGE_TYPES.START_STREAM) {
            message.data = message.data as StreamStartMessage
            const connection = AudioStreamManager.connections.get(message.data.guildId)
            if (!connection) return
            await connection.streamItem(message.data.streamUrl)
        }
        else if (message.type === AUDIO_MANAGER_MESSAGE_TYPES.STOP_STREAM) {
            message.data = message.data as string
            const connection = AudioStreamManager.connections.get(message.data)
            if (!connection) return
            await connection.stop()
        }
        else if (message.type === AUDIO_MANAGER_MESSAGE_TYPES.PAUSE_PLAY_STREAM) {
            message.data = message.data as string
            const connection = AudioStreamManager.connections.get(message.data)
            if (!connection) return
            connection.pause()
        }

        let acknowledgment: messageToVoiceManager<VOICE_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT> = {
            id: message.id,
            type: VOICE_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT,
            data: {}
        }
        parentPort?.postMessage(acknowledgment)
    } catch(e) {
        console.error(e)
        let acknowledgment: messageToVoiceManager<VOICE_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT> = {
            id: message.id,
            type: VOICE_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT,
            data: {error: e}
        }
        parentPort?.postMessage(acknowledgment)
    }
})

function sendParentMessageSync(message: Omit<messageToVoiceManager<VOICE_MANAGER_MESSAGE_TYPES>, "id"> & {id? : string}) {
    return new Promise((resolve, reject) => {
        let id = crypto.randomUUID()
        message.id = id
        parentPort?.postMessage(message)
        awaitingWorkerMessages.set(id, [
            setTimeout(() => {
                console.log("Acknowledgement was not received for this message (message to parent thread):", message)
                reject()
            }, 10000),
            resolve, reject]
        )
    })
}

export class AudioStreamManager extends EventEmitter {
    static connections = new Map<string, AudioStreamManager>()
    vc_connection: VoiceConnection
    channel: Discord.VoiceBasedChannel
    active_recordings = new Map<string, ActiveVoiceRecording>()
    session_id: string
    private connected_members = new Map<string, GuildMember>()
    private player: AudioPlayer;
    private subscription: PlayerSubscription | undefined;
    private stream: stream.Readable | null = null;
    private paused = false
    fetch_queue = new QueueManager()

    static async join(guild: Discord.Guild, channel: Discord.VoiceBasedChannel) {
        console.log("Loading new voice conenction")
        if (this.connections.has(guild.id)) {
            if (this.connections.get(guild.id)?.channel.id === channel.id) return this.connections.get(guild.id)
            throw "Already in another voice chat for this server"
        }

        let connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            // @ts-ignore
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        })
        console.log("Joined voice channel")
        let id
        while (true) {
            try {
                id = makeid(20)
                await SafeQuery("INSERT INTO dbo.VoiceSessions (session_id, channel_id) VALUES (@sessionid, @channelid);", [
                    {name: "sessionid", type: mssql.TYPES.Char(20), data: id},
                    {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id}
                ])
                break
            } catch (e) {
                console.log(e)
            }
        }
        let item = new AudioStreamManager(connection, channel, id)
        this.connections.set(guild.id, item)

        for (let member of channel.members) {
            let auto_record = (await SafeQuery("SELECT auto_record_voice FROM dbo.Users WHERE discord_id = @discordid", [
                {name: "discordid", type: mssql.TYPES.VarChar(100), data: member[0]}
            ])).recordset[0]?.auto_record_voice
            item.onMemberConnect(member[1], auto_record)
        }

        console.log("Loaded new voice connection")
        return item
    }

    constructor(vc_connection: VoiceConnection, channel: Discord.VoiceBasedChannel, session_id: string) {
        super();
        this.vc_connection = vc_connection
        this.player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        })
        this.channel = channel
        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log("Player idle")
            let message: messageToVoiceManager<VOICE_MANAGER_MESSAGE_TYPES.PLAYER_IDLING> = {
                id: "",
                type: VOICE_MANAGER_MESSAGE_TYPES.PLAYER_IDLING,
                data: this.channel.guildId
            }
            sendParentMessageSync(message)
        })
        this.subscription = this.vc_connection.subscribe(this.player)
        this.session_id = session_id

        this.vc_connection.receiver.speaking.on("start", async (userId) => {
            let recording = this.active_recordings.get(userId)
            if (!recording) return
            if (!recording) {
                // recording = await this.#newActiveVoiceRecording(userId)
                // this.active_recordings.set(userId, recording)

                // SafeQuery(sql`INSERT INTO dbo.VoiceRecordings (id, user_id) VALUES (${recording.id}, ${userId});`)
            }
            recording.subscribe()
        })
        this.updateConnectedUsers()

        // this.receiver = vc_connection.receiver.subscribe("404507305510699019", {end: {behavior: discord_voice.EndBehaviorType.AfterSilence, duration: 10000}})
        // const decoder = new opus.Decoder({ frameSize: 960, channels: 2, rate: 48000})
        // const stream = receiver.pipe(decoder).pipe(fs.createWriteStream(path.resolve("./") + "/test.pcm"))
    }

    async #newActiveVoiceRecording(userId: string) {
        let recording = await ActiveVoiceRecording.new(this.channel, this.vc_connection, userId)
        void sendParentMessageSync({
            type: VOICE_MANAGER_MESSAGE_TYPES.RECORDING_STARTED,
            data: {userId}
        })
        client.users.fetch(userId).then(user => user.send({
            embeds: [new EmbedBuilder()
                .setTitle("New recording started")
                .setDescription(`A new recording of your voice has started. You can download this recording at any time from http://${
                    process.env["DOMAIN"]
                }/voice/download/${userId}/${recording.id}/recording.mp3`)
            ]
        }))
        return recording
    }

    private async updateConnectedUsers() {
        this.connected_members.clear()
        this.active_recordings.clear()

        let channel = await this.channel.fetch()
        for (let user of channel.members) {
            let auto_record = (await SafeQuery("SELECT auto_record_voice FROM dbo.Users WHERE discord_id = @discordid", [
                {name: "discordid", type: mssql.TYPES.VarChar(100), data: user[0] || "null"}
            ])).recordset[0]?.auto_record_voice

            this.onMemberConnect(user[1], auto_record)
        }
    }

    private async onMemberConnect(member: Discord.GuildMember | null, autoRecord = false) {
        console.log("Member connected: ", autoRecord)
        if (member && !member.user.bot) {
            if (this.connected_members.has(member.id)) return // User connection has already been processed
            this.connected_members.set(member.id, member)
            console.log(this.connected_members.size)
        }
        if (member && autoRecord) {
            console.log("Setting up auto recording for: " + member.id)
            this.active_recordings.set(member.id, await this.#newActiveVoiceRecording(member.id))
        }
    }

    private onMemberDisconnect(member: GuildMember | null) {
        if (!member) return
        console.log("A member disconnected. Total number of connected users: ", this.connected_members)

        this.connected_members.delete(member.id)
        if (this.active_recordings.get(member.id)) this.active_recordings.delete(member.id)

        if (this.connected_members.size === 0) {
            console.log("The voice call was abandoned. " + this.connected_members.size)
            this.stop()
        }
    }

    // onMemberDisconnect(user) {
    //
    // }

    async streamItem(streamUrl: string) {
        console.log("Opening new stream...")
        try {
            if (this.stream) this.stream.destroy()
        } catch (e) {
            console.error(e)
        }
        try {
            if (isYoutubeUrl(streamUrl)) {
                let info = await ytdl.getInfo(ytdl.getURLVideoID(streamUrl))

                this.stream = ytdl(streamUrl, {
                    format: ytdl.chooseFormat(info.formats, {
                        quality: "highestaudio"
                    }),
                    // @ts-ignore
                    fmt: "mp3",
                    highWaterMark: 1 << 62,
                    liveBuffer: 1 << 62,
                    dlChunkSize: 0, //disabling chunking is recommended in discord bot
                    // bitrate: 128,
                    quality: "lowestaudio"
                })
                this.player.play(createAudioResource(this.stream))
            }
            else if (streamUrl.startsWith("file://")) {
                console.log("Playing local sound:", streamUrl)
                this.player.play(createAudioResource(createReadStream(streamUrl.replace("file://", ""))))
            }
            else {
                throw new Error("Invalid stream URL:" + streamUrl)
            }
        } catch(e) {}
        console.log("New stream opened!")
    }

    async stop() {
        this.player.stop()

        this.subscription?.unsubscribe()
        this.vc_connection.disconnect()
        try {
            AudioStreamManager.connections.delete(this.channel.guild.id)
        } catch (e) {
        }
    }

    rewind() {
        if (!this.stream) return
        this.player.play(createAudioResource(this.stream))
    }

    pause() {
        if (this.paused) {
            this.player.unpause()
        } else {
            this.player.pause()
        }
        this.paused = !this.paused
    }
}
