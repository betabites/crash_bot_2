/**
 * The Dispatcher takes audio input and dispatches it to the relevant audio stream. One dispatcher per voice connection.
 */

import {MessagePort, parentPort, workerData} from "worker_threads";
import {PortMessenger} from "../messageHandlers/PortMessenger.js";
import {client} from "../../services/Discord.js";
import {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    NoSubscriberBehavior,
    type VoiceConnection
} from "@discordjs/voice";
import {Readable} from "stream";
import {MessagePortReadable} from "../messageHandlers/MessageChannelStreams.js";

if (!parentPort) throw new Error("No parent port");

/* Discord player handling */
let player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
    }
})

/* Audio stream handling */
let messenger = new PortMessenger(parentPort);
let currentAudioStream: Readable | null = null

messenger.on("audioStream", (port: MessagePort, callback: () => void) => {
    console.log("Received new audio stream")
    if (currentAudioStream) currentAudioStream.destroy()
    currentAudioStream = new MessagePortReadable(new PortMessenger(port))
    currentAudioStream.on("readable", () => console.log("Readable", currentAudioStream.readableLength))
    let resource = createAudioResource(currentAudioStream)
    currentAudioStream.resume()
    player.play(resource)
    // setTimeout(() => {console.log(resource)}, 5000)

    // let testFileStream = createWriteStream("test.mp3")
    // testFileStream.on("finish", () => {console.log("Finished")})
    // testFileStream.on("error", (e) => {console.error(e)})
    // testFileStream.on("pipe", () => console.log('Writable: Source stream is piping to this writable'))
    // currentAudioStream.pipe(testFileStream)

    callback()
})

let connection: VoiceConnection;

async function startup() {
    await client.login(workerData.discordClientToken)
    const guild = await client.guilds.fetch(workerData.guildId)
    const channel = await guild.channels.fetch(workerData.channelId)
    if (!channel) throw new Error("Channel not found")

    // Connect to the channel
    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
    })
    player.on("error", (error) => {
        console.error("Player error:", error)
    })
    player.on("debug", (message) => console.debug(message))
    console.log("Joined voice channel")

    connection.on("stateChange", (oldState, newState) => {})
    messenger.emit("ready", [])
}

startup().catch((e) => {
    console.error("Error starting up voice dispatch worker", e)
    process.exit(1)
})
