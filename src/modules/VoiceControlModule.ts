import {BaseModule, InteractionButtonResponse, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandNumberOption, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {ButtonInteraction, ChatInputCommandInteraction, GuildMember, Message, TextChannel} from "discord.js";
import {getUserData} from "../utilities/getUserData.js";
import {CrashBotUser} from "../misc/UserManager.js";
import SafeQuery, {sql} from "../services/SQL.js";
import mssql from "mssql";
import ffmpeg, {FfmpegCommand, FfprobeData} from "fluent-ffmpeg";
import path from "path";
import {VoiceConnectionManager} from "../services/VoiceManager/VoiceManager.js";
import {PassThrough, Readable} from "stream";
import express from "express"
import crypto from "crypto";
import * as fs from "fs";
import archiver from "archiver";

export class VoiceControlModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("record")
            .setDescription("Record your beautiful voice")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("last")
                    .setDescription("Get an automatic recording of your voice from the last few minutes")
                    .addNumberOption(
                        new SlashCommandNumberOption()
                            .setName("minutes")
                            .setDescription("How many minutes back would you like to look?")
                            .setRequired(true)
                    )
            )
    ]

    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        if (msg.content === "<@892535864192827392> piss off" && msg.guildId) {
            const connection = VoiceConnectionManager.connections.get(msg.guildId)
            if (connection) {
                connection.stop()
            }
        }

        if (msg.channel.id === "999848214691852308") {
            let url = msg.content

            // Check audio queue
            if (!msg.member?.voice.channel) {
                msg.reply("You need to join a voice channel first")
                    .then(msg_2 => {
                        setTimeout(() => {
                            msg.delete()
                            msg_2.delete()
                        }, 3000)
                    })
                return
            }
            VoiceConnectionManager.join((msg.channel as TextChannel).guild, msg.member.voice.channel)
                .then(manager => {
                    if (manager) {
                        manager.generateQueueItem(url).then(item => manager.addToQueue(item))
                    }
                    msg.delete()
                })
                .catch(e => {
                    console.log(e)
                })
        }
    }

    @InteractionChatCommandResponse("record")
    async onRecordCommand(interaction: ChatInputCommandInteraction) {
        let com = interaction.options.getSubcommand()
        let shortcode = (await getUserData(interaction.member as GuildMember)).shortcode

        let user = new CrashBotUser(shortcode)
        if (com === "last") {
            let minutes = interaction.options.getNumber("minutes") || 5

            let recordings = await SafeQuery("SELECT filename, start FROM dbo.VoiceRecordings WHERE user_id = @userid AND start >= DATEADD(MINUTE, @minutes, GETDATE())", [
                {
                    name: "userid",
                    type: mssql.TYPES.VarChar(100),
                    data: (interaction.member as GuildMember)?.id || ""
                },
                {name: "minutes", type: mssql.TYPES.Int(), data: 0 - minutes}
            ])

            if (recordings.recordset.length === 0) {
                interaction.reply({content: "No recordings from within the specified timeframe", ephemeral: true})
                return
            }
            interaction.reply({
                content: "We're processing the audio. You'll receive a DM once processing is complete.",
                ephemeral: true
            })

            const command = ffmpeg()
            const write_stream = new PassThrough()

            let first_track_start = recordings.recordset[0].start
            let filters = []
            let i = 0
            for (let recording of recordings.recordset) {
                let seek = (recording.start.getTime() - first_track_start.getTime())
                console.log(recording, seek)
                command.input(path.join(path.resolve("./"), "voice_recordings", recording.filename))


                if (i !== 0) {
                    filters.push({
                        filter: "adelay",
                        options: seek + "|" + seek,
                        inputs: i.toString(),
                        outputs: `[a${i}]`
                    })
                }
                else {
                    filters.push({
                        filter: "adelay",
                        options: "0|0",
                        inputs: i.toString(),
                        outputs: `[a${i}]`
                    })
                }
                i++
            }
            // command.format("mp3")
            command.complexFilter([
                ...filters,
                {
                    filter: "amix",
                    options: "inputs=" + filters.length,
                    inputs: filters.map(i => i.outputs),
                    outputs: "[b]"
                }
            ])
            command.outputOption("-map", "[b]")
            command.output(path.join(path.resolve("./"), "HERE.mp3"))
            // command.output(write_stream, {end: true})
            command.on("end", () => {
                interaction.user.send({
                    content: "Enjoy your recording!",
                    files: [{
                        attachment: "HERE.mp3",
                        name: "recording.mp3",
                        // @ts-ignore
                        file: "HERE.mp3"
                    }]
                }).catch(e => {
                    console.error(e)
                    interaction.user.send({
                        content: "Oh no! Your audio may have been too large to send! Please try again."
                    })
                })
            })
            command.on("error", (e) => {
                console.error(e)
                interaction.user.send({
                    content: "Oh no! An error occured while processing your audio. Please try again."
                })
            })
            command.run()
            // command.output(write_stream, {end: true})
            // command.run()
        }
    }

    @InteractionButtonResponse("audio_shuffle")
    onAudioShufflePress(interaction: ButtonInteraction) {
        if (VoiceConnectionManager.connections.has(interaction.guildId || "no guild")) {
            VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.shuffle()
            interaction.reply({content: "The queue has been shuffled", ephemeral: true})
        }
        else {
            interaction.reply("There is no active queue. Connect to a voice channel and run `/play` first.")
        }
    }

    @InteractionButtonResponse("audio_stop")
    onAudioStopPress(interaction: ButtonInteraction) {
        if (VoiceConnectionManager.connections.has(interaction.guildId || "no guild")) {
            interaction.reply({content: "Stopping audio...", ephemeral: true})
            VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.stop()
        }
        else {
            interaction.reply({content: "Queue is empty", ephemeral: true})
        }
    }

    @InteractionButtonResponse("audio_rewind")
    onAudioRewindPress(interaction: ButtonInteraction) {
        interaction.reply({content: "Rewinding track...", ephemeral: true})
        VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.rewind()
    }

    @InteractionButtonResponse("audio_pause")
    onAudioPausePress(interaction: ButtonInteraction) {
        interaction.reply({content: "Pausing/Resuming track...", ephemeral: true})
        VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.pause()
    }

    @InteractionButtonResponse("audio_skip")
    onAudioSkipPress(interaction: ButtonInteraction) {
        interaction.reply({content: "Skipping track...", ephemeral: true})
        let connection = VoiceConnectionManager.connections.get(interaction.guildId || "no guild")
        console.log(connection)
        connection?.skip()
    }

    @InteractionButtonResponse("audio_challenge")
    async onAudioChallengePress(interaction: ButtonInteraction) {
        let res = await VoiceConnectionManager.connections.get(interaction.guildId || "no guild")?.challenge()
        if (res) {
            interaction.reply("Challenge mode has been enabled!")
        }
        else {
            interaction.reply("Challenge mode has been disabled.")
        }
    }
}

export const VOICE_ROUTER = express.Router()
VOICE_ROUTER.get("/record/:userId/:fromTime/:toTime/*.zip", async (req, res) => {
    let fromTime = new Date(req.params.fromTime)
    let toTime = new Date(req.params.toTime)

    let recordings = await SafeQuery<{ filename: string, start: Date }>(sql`SELECT filename, start
                                                           FROM dbo.VoiceRecordings
                                                           WHERE user_id = ${req.params.userId}
                                                             AND start >= ${fromTime}
                                                             AND start <= ${toTime}
                                                            ORDER BY start ASC 
    `)

    if (recordings.recordset.length === 0) {
        res.status(404)
        return
    }
    const archive = archiver('zip')
    archive.pipe(res)
    for (let recording of recordings.recordset) {
        archive.append(fs.createReadStream(path.join(path.resolve("./"), "voice_recordings", recording.filename)), {
            name: recording.filename
        })
    }
    archive.finalize()
})

VOICE_ROUTER.get("/record/:userId/:fromTime/:toTime/*.mp3", async (req, res) => {
    let fromTime = new Date(req.params.fromTime)
    let toTime = new Date(req.params.toTime)

    let recordings = await SafeQuery<{ filename: string, start: Date }>(sql`SELECT filename, start
                                                           FROM dbo.VoiceRecordings
                                                           WHERE user_id = ${req.params.userId}
                                                             AND start >= ${fromTime}
                                                             AND start <= ${toTime}
                                                            ORDER BY start ASC 
    `)

    if (recordings.recordset.length === 0) {
        res.status(404)
        return
    }

    let audio_stream = (await createMergeJob(recordings.recordset, fromTime))
    audio_stream.pipe(fs.createWriteStream(`VoiceRecording_${req.params.userId}`))
    // audio_stream.pipe(res)
    res.send("OK!")
})

async function createMergeJob(recordings: { filename: string, start: Date }[], start: Date) {
    const stream = new PassThrough()

    const command = ffmpeg()
    // let filters = []
    let lastTrackEnd = start.getTime()
    let lastTrackStart = recordings[0].start
    let firstTrackStart = recordings[0].start
    let i = 0
    command.input(path.join(path.resolve("./"), "SILENT_AUDIO.mp3"))
    for (let recording of recordings) {
        console.log(`Processing record ${recordings.indexOf(recording)}/${recordings.length}`)
        let metadata = await getMetadata(path.join(path.resolve("./"), "voice_recordings", recording.filename))
        let gap = recording.start.getTime() - lastTrackEnd
        console.log(recording.start.getTime(), lastTrackEnd, metadata.format.duration, recording.filename)
        console.log(`GAP: ${gap}ms`)
        if (gap < 0) {
            console.error(`SKIPPING ${recording.filename} - Already processed this audio. Duplicate?`)
            continue
        }
        if (gap !== 0) {
            command
                .input("anullsrc")
                .inputFormat("lavfi")
                .addInputOptions([
                    "-ac 1", // 1 audio channel
                    // "-ar 44100", // 44100 frequency
                    `-t ${gap/1000}` // Duration
                ])

        }
        command.input(path.join(path.resolve("./"), "voice_recordings", recording.filename))

        // if (i !== 0) {
        //     filters.push({
        //         filter: "adelay",
        //         options: seek + "|" + seek,
        //         inputs: i.toString(),
        //         outputs: `[a${i}]`
        //     })
        // }
        // else {
        //     filters.push({
        //         filter: "adelay",
        //         options: "0|0",
        //         inputs: i.toString(),
        //         outputs: `[a${i}]`
        //     })
        // }
        // i++
        console.log(metadata)
        lastTrackEnd = recording.start.getTime() + ((metadata.format.duration ?? 0) * 1000)
        lastTrackStart = recording.start
    }
    console.log("FINISHED BUILDING FFMPEG COMMAND")

    // command.format("mp3")
    // command.complexFilter([
    //     ...filters,
    //     {
    //         filter: "amix",
    //         options: "inputs=" + filters.length,
    //         inputs: filters.map(i => i.outputs),
    //         outputs: "[b]"
    //     }
    // ])
    // command.outputOption("-map", "[b]")
    command.format("mp3")
    command.on("start", (cli) => {
        fs.writeFileSync("cli.txt", cli)
        console.log("Wrote ffmpeg command to cli.txt")
    })
    command.mergeToFile(stream, path.resolve("audio_processing"))
    // command.stream(res)
    // command.output(write_stream, {end: true})
    // command.run()
    return stream
}

function getMetadata(path: string) {
    return new Promise<FfprobeData>((resolve, reject) => {
        const command = ffmpeg()
        command.input(path)
        command.ffprobe((err, data) => {
            if (err) {
                reject(err)
                return
            }

            resolve(data)
        })
    })
}
