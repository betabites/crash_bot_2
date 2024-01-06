import {BaseModule, InteractionButtonResponse, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandNumberOption, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {ButtonInteraction, ChatInputCommandInteraction, CommandInteraction, GuildMember, Message} from "discord.js";
import {getUserData} from "../utilities/getUserData.js";
import {CrashBotUser} from "../misc/UserManager.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import ffmpeg from "fluent-ffmpeg";
import {PassThrough} from "stream";
import path from "path";
import {VoiceConnectionManager} from "../misc/VoiceManager/VoiceManager.js";

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
    }

    @InteractionChatCommandResponse("record")
    async onRecordCommand(interaction: ChatInputCommandInteraction) {
        let com = interaction.options.getSubcommand()
        let shortcode = (await getUserData(interaction.member as GuildMember)).shortcode

        let user = new CrashBotUser(shortcode)
        if (com === "last") {
            let minutes = interaction.options.getInteger("minutes") || 5

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