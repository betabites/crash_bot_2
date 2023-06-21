import {EventEmitter} from "events";
import {VoiceConnection, joinVoiceChannel} from "@discordjs/voice";
import {opus} from "prism-media";
import * as Discord from "discord.js";
import * as ytdl from "ytdl-core";
import * as ytpl from "ytpl";
import {SafeQuery} from "./SQL";
import {makeid} from "./Common";
import * as mssql from "mssql"

export class VoiceConnectionManager extends EventEmitter {
    static connections = new Map()
    vc_connection: VoiceConnection
    channel: Discord.TextChannel
    recording_users = []
    session_id: string

    static async join(guild, channel) {
        console.log("Loading new voice conenction")
        if (this.connections.has(guild.id)) {
            if (this.connections.get(guild.id).channel.id === channel.id) return this.connections.get(guild.id)
            throw "Already in another voice chat for this server"
        }

        let connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        })
        let id
        while (true) {
            try {
                id = makeid(20)
                await SafeQuery("INSERT INTO dbo.VoiceSessions (session_id, channel_id) VALUES (@sessionid, @channelid);", [
                    {name: "sessionid", type: mssql.TYPES.Char(20), data: id},
                    {name: "channelid", type: mssql.TYPES.VarChar, data: channel.id}
                ])
                break
            } catch(e) {
                console.log(e)
            }
        }
        let item = new VoiceConnectionManager(connection, channel, id)
        this.connections.set(guild.id, item)

        for (let member of channel.members) {
            let auto_record = (await SafeQuery("SELECT auto_record_voice FROM dbo.Users WHERE discord_id = @discordid", [
                {name: "discordid", type: mssql.TYPES.VarChar, data: member[0]}
            ])).recordset[0]?.auto_record_voice
            item.onMemberConnect(member[1], auto_record)
        }

        console.log("Loaded new voice connection")
        return item
    }

    static async onVoiceStateUpdate(oldState, newState) {
        let auto_record = (await SafeQuery("SELECT auto_record_voice FROM dbo.Users WHERE discord_id = @discordid", [
            {name: "discordid", type: mssql.TYPES.VarChar, data: oldState.member.id}
        ])).recordset[0]?.auto_record_voice

        for (let connection of this.connections.values()) {
            if (connection.channel.id === oldState.channelId) {
                connection.onMemberDisconnect(oldState.member)
            }
            if (connection.channel.id === newState.channelId) {
                connection.onMemberConnect(oldState.member, auto_record)
            }
        }
    }

    constructor(vc_connection, channel, session_id) {
        super();
        this.vc_connection = vc_connection
        this.pos = 0
        this.queue = []
        this.ended = true
        this.paused = false
        this.player = discord_voice.createAudioPlayer({
            behaviors: {
                noSubscriber: discord_voice.NoSubscriberBehavior.Pause
            }
        })
        this.challenge_mode = false
        this.channel = channel
        this.player.on(discord_voice.AudioPlayerStatus.Idle, () => {
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

        // this.receiver = vc_connection.receiver.subscribe("404507305510699019", {end: {behavior: discord_voice.EndBehaviorType.AfterSilence, duration: 10000}})
        // const decoder = new opus.Decoder({ frameSize: 960, channels: 2, rate: 48000})
        // const stream = receiver.pipe(decoder).pipe(fs.createWriteStream(__dirname + "/test.pcm"))
    }

    onMemberSpeak(userId) {
        let recording_item = this.recording_users.find(i => i.id === userId)
        if (!recording_item || recording_item.recording) return
        recording_item.recording = true
        console.log("Recording " + userId)

        let filename = makeid(20)
        const receiver = this.vc_connection.receiver.subscribe(userId, {end: {behavior: discord_voice.EndBehaviorType.AfterSilence, duration: 10000}})
        const decoder = new opus.Decoder({ frameSize: 960, channels: 2, rate: 48000})
        const in_stream = receiver.pipe(decoder)
        in_stream.on("finish", () => {
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
            .output(__dirname + "/voice_recordings/" + filename + ".mp3")
            .noVideo()
            .run()
        SafeQuery("INSERT INTO dbo.VoiceRecordings (session_id, filename, user_id) VALUES (@sessionid, @filename, @userid);", [
            {name: "sessionid", type: mssql.TYPES.Char(20), data: this.session_id},
            {name: "filename", type: mssql.TYPES.Char(24), data: filename + ".mp3"},
            {name: "userid", type: mssql.TYPES.VarChar, data: userId}
        ])
    }

    onMemberConnect(user, autoRecord = false) {
        console.log("Member connected: ", autoRecord)
        if (autoRecord) {
            console.log("Setting up auto recording for: " + user.id)
            this.recording_users.push({
                id: user.id,
                recording: false
            })
        }
    }

    onMemberDisconnect(user) {

    }

    updateQueueMsgTimeout(timeout = 1000) {
        if (this.interval1) {
            clearTimeout(this.interval1)
        }
        this.interval1 = setTimeout(() => {
            this.updateQueueMsg()
        }, timeout)
    }

    async updateQueueMsg() {
        try {
            if (this.interval1) {
                clearTimeout(this.interval1)
            }
            if (!this.msg) await this.fetchQueueMessage()

            let embed = new Discord.MessageEmbed()
            if (!this.challenge_mode) {
                embed.setTitle("Play Queue (" + this.queue.length + " items currently)")

                if (this.queue.length > 0) {
                    if (this.queue[0].thumbnail) {
                        embed.setFooter({text: this.queue[0].title, iconURL: this.queue[0].thumbnail})
                        embed.setImage(this.queue[0].thumbnail)
                    }
                    else {
                        embed.setFooter({text: this.queue[0].title})
                    }
                }

                let desc = []
                for (let i in this.queue) {
                    let line = i + ". "
                    let _i = parseInt(i)
                    if (_i === 0 && this.queue[_i].downloaded === 0) {
                        line += "⌛"
                    }
                    if (this.queue[_i].title === "") {
                        line += "*Data downloading...*"
                    }
                    else {
                        line += this.queue[_i].title
                    }

                    desc.push(line)
                    if (parseInt(i) >= 20) {
                        desc.push("...")
                        break
                    }
                }
                if (this.queue.length === 0) {
                    embed.setImage("https://live.staticflickr.com/4361/36571823423_fa9f33d0dc_b.jpg")
                    embed.setFooter({text: "\"New Zealand - Castlepoint\" by Leni Sediva is licensed under CC BY-SA 2.0. "})
                }
                embed.setDescription(desc.join("\n"))
                if (track_info_get_queue.started) {
                    embed.setFooter({text: "Some information may be missing as data is still being downloaded. This may take awhile depending on the size of the queue."})
                }
                this.msg.edit({
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
                this.msg.edit({
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
        }
    }

    async fetchQueueMessage() {
        return new Promise((resolve, reject) => {
            client.channels.fetch("999848214691852308").then(channel => {
                channel.messages.fetch("1000265020795535430").then(msg => {
                    this.msg = msg
                    resolve()
                })
            })
        })
    }

    async addToQueue(url) {
        // Detect whether it's YouTube or Spotify
        let queue_item, queue_pos = this.queue.length + 1
        if (url.startsWith("https://m.youtube.com") || url.startsWith("https://youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://www.youtube.com") || url.startsWith("https://www.youtu.be")) {
            // YouTube

            // Validate the URL
            if (!ytdl.validateURL(url)) {
                throw "Invalid URL - ytdl"
            }

            queue_item = new queueItem("ytdl", ytdl.getURLVideoID(url), queue_pos)

            if (url.includes("list=") || url.includes("/playlist")) {
                // Process as a YouTube playlist
                let playlist = await ytpl(url)
                let video_id = ytdl.getURLVideoID(url)
                for (let item of playlist.items) {
                    if (ytdl.getURLVideoID(item.url) !== video_id) await this.addToQueue(item.url)
                }
            }
        }
        else if (url.startsWith("https://open.spotify.com/track/")) {
            // Spotify

            // Validate the URL
            try {
                let details = await spotify.getTrack(url)
                let yt_res = (await yts(details.name + " " + details.artists.join(" "))).videos.slice(0, 1)
                console.log("YT DATA: ", yt_res)

                queue_item = new queueItem("ytdl", ytdl.getURLVideoID(yt_res[0].url), queue_pos)

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
                let data = await spotify.getPlaylist(url)
                console.log(data)

                for (let item of data.tracks) {
                    await this.addToQueue("https://open.spotify.com/track/" + item)
                }
            } catch (e) {
                throw e
            }
        }
        else if (url.startsWith("https://open.spotify.com/album/")) {
            try {
                let data = await spotify.getAlbum(url)
                console.log(data)

                for (let item of data.tracks) {
                    await this.addToQueue("https://open.spotify.com/track/" + item)
                }
            } catch (e) {
                throw e
            }
        }

        this.queue.push(queue_item)
        if (this.queue.length === 1) {
            this.startTrack()
        }
        console.log("QUEUE:", this.queue)
        this.updateQueueMsgTimeout()
    }

    async nextTrack() {
        console.log("Loading next track...")
        // this.pos += 1
        await this.queue.shift().unload()
        await this.startTrack()
    }

    async startTrack() {
        console.log("Starting track....")
        this.ended = false
        this.updateQueueMsgTimeout()
        this.queue[this.pos].stream(stream => {
            this.updateQueueMsg()
            if (typeof stream === "undefined") {
                console.error("Failed to stream a track. Skipping...")
            }
            else {
                this.player.play(discord_voice.createAudioResource(stream))
            }
        })
    }

    shuffle() {
        let cur_item = this.queue.shift()
        this.queue = shuffleArray(this.queue)
        this.queue.unshift(cur_item)
        this.updateQueueMsg()
    }

    async stop() {
        this.player.stop()
        try {
            await this.queue[0].unload()
        } catch (e) {
        }
        this.queue = []
        await this.updateQueueMsg()
        this.challenge_mode = false

        this.subscription.unsubscribe()
        this.vc_connection.disconnect()
        clearInterval(this.interval1)
        clearInterval(this.interval2)
        try {
            track_info_get_queue.stop()
        } catch (e) {
        }
        delete this.channel
    }

    skip() {
        this.player.pause()
        this.nextTrack()
    }

    rewind() {
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