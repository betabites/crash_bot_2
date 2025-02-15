import {BaseModule, OnClientEvent} from "../../modules/BaseModule.js";
import {Message, VoiceBasedChannel} from "discord.js";
import {connectVoice, TestVoiceModule} from "../VoiceConnectionManager.js";

export class MusicPlayerModule extends BaseModule {
    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (msg.author.id === "404507305510699019" && msg.content === "test") {
            console.log("test")
            let testChannel = await this.client.channels.fetch("1117397106441846885") as VoiceBasedChannel
            console.log("Connecting to voice channel")
            let voiceManager = await connectVoice(testChannel)
            console.log("Voice connected")

            // Create the voice module
            let voiceModule = await TestVoiceModule.fromVoiceManager(voiceManager)

            // Start the audio stream
            void voiceModule.startStream()
            console.log("Stream started")
        }
    }
}
