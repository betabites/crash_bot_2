// This class serves the purpose of managing interactions between the main thread and the voice worker
import {VoiceBasedChannel} from "discord.js";
import {MessageChannel, Worker} from "worker_threads";
import {PortMessenger} from "./messageHandlers/PortMessenger.js";
import {MessagePortWritable} from "./messageHandlers/MessageChannelStreams.js";
import {Writable} from "stream";
import ytdl from "@distube/ytdl-core";
import {getToken} from "../services/Discord.js";

const connections = new Map<string, VoiceConnectionManager>()

/**
 * Connects the Discord client to a specified voice channel. Errors if the client is already connected to a vc in that guild.
 */
export async function connectVoice(channel: VoiceBasedChannel) {
    if (connections.has(channel.guild.id)) throw new Error("Already connected to a voice channel")
    let manager = await VoiceConnectionManager.create(channel)
    connections.set(channel.guildId, manager)
    return manager
}

/**
 * Gets the current voice connection for the specified Discord guild (if any)
 */
export function getVoice(guildId: string) {
    return connections.get(guildId)
}

export class VoiceConnectionManager {
    static async create(
        channel: VoiceBasedChannel
    ) {
        return new Promise<VoiceConnectionManager>((resolve, reject) => {
            // Start up a dispatcher
            let dispatcher = new Worker("./src/newVoice/workers/Dispatcher.js", {
                workerData: {
                    discordClientToken: getToken(),
                    channelId: channel.id,
                    guildId: channel.guild.id,
                }
            })
            let messenger = new PortMessenger(dispatcher)

            const onerror = (err?: Error) => {
                reject(err)
                deregisterListeners()
            }
            const onsuccess = () => {
                resolve(new this(channel, dispatcher, messenger))
                deregisterListeners()
            }
            const deregisterListeners = () => {
                dispatcher.off("error", onerror)
                dispatcher.off("exit", onerror)
                dispatcher.off("online", onsuccess)
            }
            dispatcher.on("error", onerror)
            dispatcher.on("exit", onerror)
            messenger.on("ready", onsuccess)
        })
    }

    protected constructor(
        private readonly channel: VoiceBasedChannel,
        private readonly dispatcher: Worker,
        private readonly messenger: PortMessenger,
    ) {
        this.dispatcher.on("error", (e) => {
            console.error("DISPATCHER ERROR:")
            console.error(e)
        })
        this.dispatcher.on("exit", (code) => {
            console.log(`Dispatcher exited with code ${code}`)
        })
        this.dispatcher.on("online", () => {console.log("Dispatcher online")})
    }

    /**
     * Creates a MessageChannel that can be used with MessagePortWritable. Audio data can be written to this stream, and
     * will be played over the connection.
     */
    async _createAudioStream() {
        let ports = new MessageChannel()
        await this.messenger.emitWithAck("audioStream", [ports.port2], ports.port2)
        return ports.port1
    }
}

export class TestVoiceModule {

    static async fromVoiceManager(manager: VoiceConnectionManager) {
        let writePort = await manager._createAudioStream()
        let writeStream = MessagePortWritable.fromPort(writePort)
        return new this(writeStream)
    }

    constructor(
        readonly writable: Writable
    ) {}

    async startStream() {
        // Open test stream
        let info = await ytdl.getInfo(ytdl.getURLVideoID("https://www.youtube.com/watch?v=U_1MxeMHX9A"))
        let testStream = ytdl("https://www.youtube.com/watch?v=U_1MxeMHX9A", {
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
        testStream.pipe(this.writable)
    }
}
