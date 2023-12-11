import {EventEmitter} from "events";
import {
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    EndBehaviorType,
    NoSubscriberBehavior,
    PlayerSubscription
} from "@discordjs/voice";
import {opus} from "prism-media";
import * as Discord from "discord.js";
import {GuildMember} from "discord.js";
import ytdl from "ytdl-core";
import ytpl from "ytpl";
import SafeQuery from "../SQL.js";
import {makeid, QueueManager, ShuffleArray} from "../Common.js";
import mssql from "mssql"
import yts from "yt-search";
import ffmpeg from "fluent-ffmpeg"
import {client, getToken} from "../Discord.js";
import Spotify from "../Spotify.js";
import * as path from "path";
import * as stream from "stream";
import {parentPort, Worker} from "worker_threads"
import {
    AUDIO_MANAGER_MESSAGE_TYPES,
    messageToAudioManager,
    VOICE_MANAGER_MESSAGE_TYPES,
    messageToVoiceManager, AcknowledgementMessage
} from "./types.js";
import * as crypto from "crypto";

let worker = new Worker("./src/misc/VoiceManager/VoiceManagerWorker.js", {
    workerData: {
        discordClientToken: getToken()
    }
})
const awaitingWorkerMessages = new Map<string, [NodeJS.Timer, (value: unknown) => void, (error?: unknown) => void]>()

worker.on("message", (message: messageToVoiceManager<VOICE_MANAGER_MESSAGE_TYPES>) => {
    if (message.type === VOICE_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT) {
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
        if (message.type === VOICE_MANAGER_MESSAGE_TYPES.PLAYER_IDLING) {
            if (typeof message.data !== "string") throw "Invalid data"
            let connection = VoiceConnectionManager.connections.get(message.data)
            if (!connection) throw "No audio connection"
            connection.nextTrack()
        }
        let acknowledgment: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT> = {
            id: message.id,
            type: AUDIO_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT,
            data: {}
        }
        worker.postMessage(acknowledgment)
    } catch(e) {
        console.error(e)
        let acknowledgment: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT> = {
            id: message.id,
            type: AUDIO_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT,
            data: {
                error: e
            }
        }
        worker.postMessage(acknowledgment)
    }
})

function sendWorkerMessageSync(message: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES>) {
    return new Promise((resolve, reject) => {
        let id = crypto.randomUUID()
        message.id = id
        worker.postMessage(message)
        awaitingWorkerMessages.set(id, [
            setTimeout(() => {
                console.log("Acknowledgement was not received for this message (message to worker thread):", message)
                reject()
            }, 10000),
            resolve, reject]
        )
    })
}

export class VoiceConnectionManager extends EventEmitter {
    static connections = new Map<string, VoiceConnectionManager>()
    channel: Discord.VoiceBasedChannel
    recording_users: {
        id: string,
        recording: boolean
    }[] = []
    private connected_members = new Map<string, GuildMember>()
    private pos: number;
    private queue: QueueItem[] = []
    private paused: boolean;
    private challenge_mode: boolean;
    private subscription: PlayerSubscription | undefined;
    private interval2: NodeJS.Timer;
    private interval1: any;
    private msg: Discord.Message | undefined;
    private last_track_start = Date.now();
    fetch_queue = new QueueManager()
    private ended: boolean = false;

    static async join(guild: Discord.Guild, channel: Discord.VoiceBasedChannel) {
        console.log("Loading new voice connection")

        if (this.connections.has(guild.id)) {
            if (this.connections.get(guild.id)?.channel.id === channel.id) return this.connections.get(guild.id)
            throw "Already in another voice chat for this server"
        }

        await VoiceConnectionManager.connectAudio(channel)
        let item = new VoiceConnectionManager(channel)
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

    static async connectAudio(channel: Discord.VoiceBasedChannel) {
        // Send message to audio manager, to connect to this channel
        let message: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES.CONNECT_CHANNEL> = {
            id: crypto.randomUUID(),
            type: AUDIO_MANAGER_MESSAGE_TYPES.CONNECT_CHANNEL,
            data: {
                guildId: channel.guildId,
                channelId: channel.id
            }
        }
        await sendWorkerMessageSync(message)
    }

    static async onVoiceStateUpdate(oldState: Discord.VoiceState, newState: Discord.VoiceState) {
        let auto_record = (await SafeQuery("SELECT auto_record_voice FROM dbo.Users WHERE discord_id = @discordid", [
            {name: "discordid", type: mssql.TYPES.VarChar(100), data: oldState.member?.id || "null"}
        ])).recordset[0]?.auto_record_voice

        let guild_connection = this.connections.get(oldState.guild.id)
        if (guild_connection && (newState.channel?.id !== oldState.channel?.id)) {
            if (guild_connection.channel.id === newState.channelId) {
                guild_connection.onMemberConnect(oldState.member, auto_record)
            }

            if (guild_connection.channel.id === oldState.channelId) {
                guild_connection.onMemberDisconnect(oldState.member)
            }
        }
        else if (auto_record && newState.channel) {
            VoiceConnectionManager.join(newState.guild, newState.channel)
        }
        else if (newState.channelId === "1173416327352963092") {
            if (!newState.channel) return
            let connection = await VoiceConnectionManager.join(newState.guild, newState.channel)
            if (!connection) return
            let queue_item = await connection.generateQueueItem("https://www.youtube.com/watch?v=cZwFJClScX0")
            queue_item.repeat = true
            connection.addToQueue(queue_item)
        }
    }

    constructor(channel: Discord.VoiceBasedChannel) {
        super();
        this.pos = 0
        this.queue = []
        this.paused = false
        this.challenge_mode = false
        this.channel = channel

        this.interval2 = setInterval(() => {
            this.updateQueueMsg()
        }, 10000)
        this.updateConnectedUsers()

        // this.receiver = vc_connection.receiver.subscribe("404507305510699019", {end: {behavior: discord_voice.EndBehaviorType.AfterSilence, duration: 10000}})
        // const decoder = new opus.Decoder({ frameSize: 960, channels: 2, rate: 48000})
        // const stream = receiver.pipe(decoder).pipe(fs.createWriteStream(path.resolve("./") + "/test.pcm"))
    }

    private async updateConnectedUsers() {
        this.connected_members.clear()
        this.recording_users = []

        let channel = await this.channel.fetch()
        for (let user of channel.members) {
            let auto_record = (await SafeQuery("SELECT auto_record_voice FROM dbo.Users WHERE discord_id = @discordid", [
                {name: "discordid", type: mssql.TYPES.VarChar(100), data: user[0] || "null"}
            ])).recordset[0]?.auto_record_voice

            this.onMemberConnect(user[1], auto_record)
        }
    }

    private onMemberConnect(member: Discord.GuildMember | null, autoRecord = false) {
        console.log("Member connected: ", autoRecord)
        if (member && !member.user.bot) {
            if (this.connected_members.has(member.id)) return // User connection has already been processed
            this.connected_members.set(member.id, member)
            console.log(this.connected_members.size)
        }
        if (member && autoRecord) {
            console.log("Setting up auto recording for: " + member.id)
            this.recording_users.push({
                id: member.id,
                recording: false
            })
        }
    }

    private onMemberDisconnect(member: GuildMember | null) {
        if (!member) return
        console.log("A member disconnected. Total number of connected users: ", this.connected_members)

        this.connected_members.delete(member.id)
        if (this.connected_members.size === 0) {
            console.log("The voice call was abandoned. " + this.connected_members.size)
            this.stop()
        }
    }

    // onMemberDisconnect(user) {
    //
    // }

    async updateQueueMsg() {
        if (this.interval1) {
            clearTimeout(this.interval1)
        }
        this.interval1 = setTimeout(async () => {
            try {
                if (!this.msg) await this.fetchQueueMessage()

                let embed = new Discord.MessageEmbed()
                if (!this.challenge_mode) {
                    embed.setTitle("Play Queue (" + this.queue.length + " items currently)")

                    if (this.queue.length > 0) {
                        if (this.queue[0].thumbnail) {
                            embed.setFooter({text: this.queue[this.pos].title, iconURL: this.queue[this.pos].thumbnail})
                            embed.setImage(this.queue[this.pos].thumbnail)
                        }
                        else {
                            embed.setFooter({text: this.queue[0].title})
                        }
                    }

                    let desc = []
                    if (this.pos > 0) desc.push("...")
                    let queue_slice = this.queue.slice(this.pos, this.pos + 10)
                    for (let item of queue_slice) {
                        let i = this.queue.indexOf(item)
                        let line = (i + 1) + ". "
                        if (i === this.pos && item.downloaded === 0) {
                            line += "⌛"
                        }
                        if (item.title === "") {
                            line += "*Data downloading...*"
                        }
                        else {
                            line += item.title
                        }
                        desc.push(line)
                    }
                    if (queue_slice.length + this.pos < this.queue.length) {
                        desc.push("...")
                    }
                    if (this.queue.length === 0) {
                        embed.setImage("https://live.staticflickr.com/4361/36571823423_fa9f33d0dc_b.jpg")
                        embed.setFooter({text: "\"New Zealand - Castlepoint\" by Leni Sediva is licensed under CC BY-SA 2.0. "})
                    }
                    embed.setDescription(desc.join("\n"))
                    if (this.fetch_queue.started) {
                        embed.setFooter({text: "Some information may be missing as data is still being downloaded. This may take awhile depending on the size of the queue."})
                    }
                    this.msg?.edit({
                        content: " ", embeds: [embed], components: [
                            new Discord.MessageActionRow()
                                .addComponents([
                                    new Discord.MessageButton()
                                        .setCustomId("audio_rewind")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏮"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_pause")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏯"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_skip")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏭"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_shuffle")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("🔀"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_stop")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏹"),
                                ]),
                            new Discord.MessageActionRow().addComponents([
                                new Discord.MessageButton()
                                    .setCustomId("audio_challenge")
                                    .setStyle("SECONDARY")
                                    .setLabel("Challenge Mode")
                                    .setEmoji("🏅")
                            ])
                        ]
                    })
                }
                else {
                    embed.setTitle("🏅 Challenge mode enabled!")
                    embed.setDescription("Challenge mode has been enabled! See if you can guess the songs! To disable challenge mode, click 'Challenge Mode' again.")
                    this.msg?.edit({
                        content: " ", embeds: [embed], components: [
                            new Discord.MessageActionRow()
                                .addComponents([
                                    new Discord.MessageButton()
                                        .setCustomId("audio_rewind")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏮"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_pause")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏯"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_skip")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏭"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_shuffle")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("🔀"),
                                    new Discord.MessageButton()
                                        .setCustomId("audio_stop")
                                        .setStyle("SECONDARY")
                                        .setLabel(" ")
                                        .setEmoji("⏹")
                                ]),
                            new Discord.MessageActionRow().addComponents([
                                new Discord.MessageButton()
                                    .setCustomId("audio_challenge")
                                    .setStyle("PRIMARY")
                                    .setLabel("Challenge Mode")
                                    .setEmoji("🏅")
                            ])
                        ]
                    })
                }
            } catch (e) {
                console.log(e)
            }
        }, 1000)
    }

    async fetchQueueMessage(): Promise<void> {
        return new Promise((resolve, reject) => {
            client.channels.fetch("999848214691852308").then(_channel => {
                let channel = _channel as Discord.TextChannel
                channel.messages.fetch("1000265020795535430").then(msg => {
                    this.msg = msg
                    resolve()
                })
            })
        })
    }

    async generateQueueItem(url: string) {
        // Detect whether it's YouTube or Spotify
        let queue_item: QueueItem, queue_pos = this.queue.length + 1
        if (url.startsWith("https://m.youtube.com") || url.startsWith("https://youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://www.youtube.com") || url.startsWith("https://www.youtu.be")) {
            // YouTube

            // Validate the URL
            if (!ytdl.validateURL(url)) {
                throw "Invalid URL - ytdl"
            }

            queue_item = new YoutubeQueueItem(url, this)

            if (url.includes("list=") || url.includes("/playlist")) {
                // Process as a YouTube playlist
                let playlist = await ytpl(url)
                let video_id = ytdl.getURLVideoID(url)
                for (let item of playlist.items) {
                    console.log(item.url)
                    if (ytdl.getURLVideoID(item.url) !== video_id) this.addToQueue(await this.generateQueueItem(item.url.split("&list")[0]), true)
                }
            }
        }
        else if (url.startsWith("https://open.spotify.com/track/")) {
            // Validate the URL
            try {
                let details = await Spotify.getTrack(url.split("?")[0])

                queue_item = new SpotifyQueueItem(details, url.split("?")[0], this)

                //
                // if (queue_pos - 2 < this.pos) {
                //     queue_item.__spotifyDownload()
                // }
            } catch (e) {
                console.error(e)
                throw "Invalid URL - spotifydl"
            }
        }
        else if (url.startsWith("https://open.spotify.com/playlist/")) {
            try {
                let data = await Spotify.getPlaylist(url.split("?")[0])
                console.log(data)

                for (let item of data.tracks) {
                    this.addToQueue(await this.generateQueueItem("https://open.spotify.com/track/" + item), true)
                }
            } catch (e) {
                throw e
            }
        }
        else if (url.startsWith("https://open.spotify.com/album/")) {
            try {
                let data = await Spotify.getAlbum(url.split("?")[0])

                for (let item of data.tracks) {
                    this.addToQueue(await this.generateQueueItem("https://open.spotify.com/track/" + item))
                }
            } catch (e) {
                throw e
            }
        }
        else {
            // Perform a regular YouTube search
            try {
                let yt_res = (await yts(url)).videos.slice(0, 1)

                queue_item = new YoutubeQueueItem(yt_res[0].url, this)

                //
                // if (queue_pos - 2 < this.pos) {
                //     queue_item.__spotifyDownload()
                // }
            } catch (e) {
                console.error(e)
                throw "Invalid URL - spotifydl"
            }
        }

        // @ts-ignore
        return queue_item
    }

    addToQueue(item: QueueItem, suppress_queue_updates: boolean = false) {
        this.queue.push(item)
        if (this.queue.length === 1) {
            this.startTrack()
        }
        if (this.queue.length - 11 < this.pos && !suppress_queue_updates) this.updateQueueMsg()
    }

    async nextTrack(ignoreRepeats = false) {
        console.log("Loading next track...")
        if (ignoreRepeats || !this.queue[this.pos].repeat) this.pos += 1
        await this.startTrack()
    }

    async startTrack() {
        this.last_track_start = Date.now()
        console.log("Starting track.... Position: " + this.pos)
        this.ended = false

        if (this.pos > this.queue.length - 1) {
            return
        }

        let url = await this.queue[this.pos].fetchYoutubeURL()
        for (let item of this.queue.slice(this.pos, this.pos + 13).filter(i => i.downloaded === DownloadStage.NOT_DOWNLOADED)) {
            item.fetchInfo()
        }

        if (typeof url === "undefined") {
            console.error("Failed to stream a track. Skipping...")
        }
        else {
            let message: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES.START_STREAM> = {
                id: "",
                type: AUDIO_MANAGER_MESSAGE_TYPES.START_STREAM,
                data: {
                    guildId: this.channel.guildId,
                    youtubeUrl: url
                }
            }
            await sendWorkerMessageSync(message)
        }
        await this.updateQueueMsg()
    }

    shuffle() {
        let cur_item = this.queue.splice(0, this.pos)
        this.queue = cur_item.concat(ShuffleArray(this.queue))
        this.updateQueueMsg()
    }

    async stop() {
        let message: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES.STOP_STREAM> = {
            id: "",
            type: AUDIO_MANAGER_MESSAGE_TYPES.STOP_STREAM,
            data: this.channel.guildId
        }
        await sendWorkerMessageSync(message)

        this.queue = []
        await this.updateQueueMsg()
        this.challenge_mode = false

        this.subscription?.unsubscribe()
        clearInterval(this.interval1)
        // @ts-ignore
        clearInterval(this.interval2)
        try {
            this.fetch_queue.stop()
            VoiceConnectionManager.connections.delete(this.channel.guild.id)
        } catch (e) {
        }
    }

    async skip() {
        await this.nextTrack(true)
    }

    rewind() {
        if (Date.now() - 5000 < this.last_track_start && this.pos > 0) this.pos -= 1
        this.startTrack()
    }

    async pause() {
        let message: messageToAudioManager<AUDIO_MANAGER_MESSAGE_TYPES.PAUSE_PLAY_STREAM> = {
            id: "",
            type: AUDIO_MANAGER_MESSAGE_TYPES.PAUSE_PLAY_STREAM,
            data: this.channel.guildId
        }
        await sendWorkerMessageSync(message)
    }

    async challenge() {
        if (this.challenge_mode) {
            this.challenge_mode = false
            this.updateQueueMsg()
            return false
        }
        else {
            this.challenge_mode = true
            this.shuffle()
            await this.nextTrack()
            return true
        }
    }
}

client.on("voiceStateUpdate", (oldState, newState) => {
    VoiceConnectionManager.onVoiceStateUpdate(oldState, newState)
})

export enum PlayerType {
    YOUTUBE,
    SPOTIFY
}

export enum DownloadStage {
    NOT_DOWNLOADED,
    DOWNLOADING,
    DOWNLOADED
}

interface QueueItem extends EventEmitter {
    downloaded: DownloadStage,
    title: string,
    thumbnail: string,
    url: string,
    readonly type: PlayerType.YOUTUBE | PlayerType.SPOTIFY,
    readonly vc_manager: VoiceConnectionManager,
    fetchYoutubeURL: () => Promise<string> | string,
    repeat: boolean,
    fetchInfo: () => void
}

class YoutubeQueueItem extends EventEmitter implements QueueItem {
    private id: string;
    readonly url: string
    downloaded: DownloadStage;
    title: string;
    thumbnail: string;
    repeat = false;
    readonly type: PlayerType.YOUTUBE | PlayerType.SPOTIFY = PlayerType.YOUTUBE
    readonly vc_manager: VoiceConnectionManager

    constructor(url: string, vc_manager: VoiceConnectionManager) {
        super();
        this.id = ytdl.getURLVideoID(url)
        this.url = url
        this.downloaded = DownloadStage.NOT_DOWNLOADED
        this.title = ""
        this.thumbnail = ""
        this.vc_manager = vc_manager
        this.fetchInfo.bind(this)
    }

    async fetchInfo() {
        if (this.downloaded !== DownloadStage.NOT_DOWNLOADED) return
        try {
            this.downloaded = DownloadStage.DOWNLOADING
            try {
                let data = await ytdl.getInfo("https://www.youtube.com/watch?v=" + this.id)
                this.title = data.videoDetails.title
                this.thumbnail = data.videoDetails.thumbnails[data.videoDetails.thumbnails.length - 1].url
            } catch(e) {
                this.title = "Failed to fetch"
            }
            this.downloaded = DownloadStage.DOWNLOADED
        } catch (e) {
            this.title = "Track data fetch failed"
        }
    }

    async fetchYoutubeURL() {
        console.log("Streaming track...")

        console.log("Streaming YTDL..", "https://www.youtube.com/watch?v=" + this.id)
        return "https://www.youtube.com/watch?v=" + this.id
    }
}

interface TrackDetails {
    name: string,
    artists: string[],
    album_name: string,
    release_date: string,
    cover_url: string
}

class SpotifyQueueItem extends EventEmitter implements QueueItem {
    downloaded: DownloadStage;
    readonly type: PlayerType.YOUTUBE | PlayerType.SPOTIFY = PlayerType.YOUTUBE
    readonly vc_manager: VoiceConnectionManager
    readonly track_details: TrackDetails
    readonly url: string
    repeat = false;

    constructor(details: TrackDetails, url: string, vc_manager: VoiceConnectionManager) {
        super();
        this.track_details = details
        this.downloaded = DownloadStage.NOT_DOWNLOADED
        this.vc_manager = vc_manager
        this.url = url
    }

    get title() {
        if (!this.track_details) return ""

        return this.track_details.name
    }

    get thumbnail() {
        if (!this.track_details) return ""

        return this.track_details.cover_url
    }

    fetchYoutubeURL(): Promise<string> {
        return new Promise(async (resolve, reject) => {
            yts(this.track_details.name + " " + this.track_details.artists.join(" ")).then(async search_res => {
                resolve(search_res.videos[0].url)
            })
                .catch(e => reject(e))
        })
    }

    fetchInfo(): void {
    }
}