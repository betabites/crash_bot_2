import {EventEmitter} from "events";
import {
    VoiceConnection,
    joinVoiceChannel,
    createAudioPlayer,
    NoSubscriberBehavior,
    AudioPlayerStatus,
    PlayerSubscription,
    EndBehaviorType,
    createAudioResource
} from "@discordjs/voice";
import {opus} from "prism-media";
import * as Discord from "discord.js";
import ytdl from "ytdl-core";
import ytpl from "ytpl";
import SafeQuery from "./SQL.js";
import {makeid, QueueManager, ShuffleArray} from "./Common.js";
import mssql from "mssql"
import yts from "yt-search";
import ffmpeg from "fluent-ffmpeg"
import {client} from "./Discord.js";
import fs from "fs";
import Spotify from "./Spotify.js";
import {GuildMember, VoiceState} from "discord.js";
import * as path from "path";
import * as stream from "stream";
import {ActivityTypes} from "discord.js/typings/enums.js";
import * as util from "util";

export class VoiceConnectionManager extends EventEmitter {
    static connections = new Map<string, VoiceConnectionManager>()
    vc_connection: VoiceConnection
    channel: Discord.VoiceBasedChannel
    recording_users: {
        id: string,
        recording: boolean
    }[] = []
    session_id: string
    private connected_members = new Map<string, GuildMember>()
    private pos: number;
    private queue: QueueItem[] = []
    private ended: boolean;
    private paused: boolean;
    private player: any;
    private challenge_mode: boolean;
    private subscription: PlayerSubscription | undefined;
    private interval2: NodeJS.Timer;
    private interval1: any;
    private msg: Discord.Message | undefined;
    private last_track_start = Date.now();
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
        let item = new VoiceConnectionManager(connection, channel, id)
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
        } else if (auto_record && newState.channel) {
            VoiceConnectionManager.join(newState.guild, newState.channel)
        }
    }

    constructor(vc_connection: VoiceConnection, channel: Discord.VoiceBasedChannel, session_id: string) {
        super();
        this.vc_connection = vc_connection
        this.pos = 0
        this.queue = []
        this.ended = true
        this.paused = false
        this.player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        })
        this.challenge_mode = false
        this.channel = channel
        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log("Player idle")
            this.nextTrack()
        })
        this.subscription = this.vc_connection.subscribe(this.player)
        this.session_id = session_id

        this.interval2 = setInterval(() => {
            this.updateQueueMsg()
        }, 10000)

        this.vc_connection.receiver.speaking.on("start", (userId) => {
            this.onMemberSpeak(userId)
        })
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

    onMemberSpeak(userId: string) {
        let recording_item = this.recording_users.find(i => i.id === userId)
        if (!recording_item || recording_item.recording) return
        recording_item.recording = true
        console.log("Recording " + userId)

        let filename = makeid(20)
        const receiver = this.vc_connection.receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 10000
            }
        })
        const decoder = new opus.Decoder({frameSize: 960, channels: 2, rate: 48000})
        const in_stream = receiver.pipe(decoder)
        in_stream.on("finish", () => {
            // @ts-ignore
            recording_item.recording = false
            console.log("User stopped talking")
        })

        ffmpeg()
            .input(in_stream)
            .inputFormat('s16le')
            .audioChannels(2)
            .inputOptions([
                '-ar 48000',
                '-channel_layout stereo'
            ])
            .output(path.resolve("./") + "/voice_recordings/" + filename + ".mp3")
            .noVideo()
            .run()
        SafeQuery("INSERT INTO dbo.VoiceRecordings (session_id, filename, user_id) VALUES (@sessionid, @filename, @userid);", [
            {name: "sessionid", type: mssql.TYPES.Char(20), data: this.session_id},
            {name: "filename", type: mssql.TYPES.Char(24), data: filename + ".mp3"},
            {name: "userid", type: mssql.TYPES.VarChar(100), data: userId}
        ])
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
        this.interval1 = setTimeout(async() => {
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
            } catch(e) {console.log(e)}
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

    async addToQueue(url: string, suppress_queue_updates = false) {
        // Detect whether it's YouTube or Spotify
        let queue_item, queue_pos = this.queue.length + 1
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
                    if (ytdl.getURLVideoID(item.url) !== video_id) await this.addToQueue(item.url.split("&list")[0], true)
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
                    await this.addToQueue("https://open.spotify.com/track/" + item, true)
                }
            } catch (e) {
                throw e
            }
        }
        else if (url.startsWith("https://open.spotify.com/album/")) {
            try {
                let data = await Spotify.getAlbum(url.split("?")[0])

                for (let item of data.tracks) {
                    await this.addToQueue("https://open.spotify.com/track/" + item)
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

        this.queue.push(queue_item as QueueItem)
        if (this.queue.length === 1) {
            this.startTrack()
        }
        if (this.queue.length - 11 < this.pos && !suppress_queue_updates) this.updateQueueMsg()
    }

    async nextTrack() {
        console.log("Loading next track...")
        this.pos += 1
        await this.startTrack()
    }

    async startTrack() {
        this.last_track_start = Date.now()
        console.log("Starting track.... Position: " + this.pos)
        this.ended = false
        this.updateQueueMsg()
        if (this.pos > this.queue.length - 1) {
            return
        }

        let stream = await this.queue[this.pos].stream()
        for (let item of this.queue.slice(this.pos, this.pos + 13).filter(i => i.downloaded === DownloadStage.NOT_DOWNLOADED)) {
            item.fetchInfo()
        }
        this.updateQueueMsg()
        if (typeof stream === "undefined") {
            console.error("Failed to stream a track. Skipping...")
        }
        else {
            this.player.play(createAudioResource(stream))
            // client.user?.setActivity(this.queue[this.pos].title, {
            //     type: ActivityTypes.PLAYING,
            //     url: this.queue[this.pos].url
            // })
        }
    }

    shuffle() {
        let cur_item = this.queue.splice(0, this.pos)
        this.queue = cur_item.concat(ShuffleArray(this.queue))
        this.updateQueueMsg()
    }

    async stop() {
        this.player.stop()
        this.queue = []
        await this.updateQueueMsg()
        this.challenge_mode = false

        this.subscription?.unsubscribe()
        this.vc_connection.disconnect()
        clearInterval(this.interval1)
        clearInterval(this.interval2)
        try {
            this.fetch_queue.stop()
            VoiceConnectionManager.connections.delete(this.channel.guild.id)
        } catch (e) {
        }
    }

    skip() {
        this.player.pause()
        this.nextTrack()
    }

    rewind() {
        if (Date.now() - 5000 < this.last_track_start && this.pos > 0) this.pos -= 1
        this.startTrack()
    }

    pause() {
        if (this.paused) {
            this.player.unpause()
            this.paused = false
        }
        else {
            this.player.pause();
            this.paused = true
        }
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
    stream: () => Promise<stream.Readable> | stream.Readable,
    fetchInfo: () => void
}

class YoutubeQueueItem extends EventEmitter implements QueueItem {
    private id: string;
    readonly url: string
    downloaded: DownloadStage;
    title: string;
    thumbnail: string;
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
            let data = await ytdl.getInfo("https://www.youtube.com/watch?v=" + this.id)
            this.title = data.videoDetails.title
            this.thumbnail = data.videoDetails.thumbnails[data.videoDetails.thumbnails.length - 1].url
            this.downloaded = DownloadStage.DOWNLOADED
        } catch (e) {
            this.title = "Track data fetch failed"
        }
    }

    async stream() {
        console.log("Streaming track...")

        console.log("Streaming YTDL..", "https://www.youtube.com/watch?v=" + this.id)
        let info = await ytdl.getInfo(this.id)
        return ytdl("https://www.youtube.com/watch?v=" + this.id, {
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

    stream(): Promise<stream.Readable> {
        return new Promise(async (resolve, reject) => {
            console.log("Streaming track...")
            yts(this.track_details.name + " " + this.track_details.artists.join(" ")).then(async search_res => {
                let info = await ytdl.getInfo(ytdl.getURLVideoID(search_res.videos[0].url))
                resolve(ytdl(search_res.videos[0].url, {
                    format: ytdl.chooseFormat(info.formats, {
                        quality: "highestaudio"
                    }),
                    // fmt: "mp3",
                    highWaterMark: 1 << 62,
                    liveBuffer: 1 << 62,
                    dlChunkSize: 0, //disabling chunking is recommended in discord bot
                    // bitrate: 128,
                    quality: "lowestaudio"
                }))
            })
                .catch(e => reject(e))
        })
    }

    fetchInfo(): void {}
}