import {BaseVoiceModule, MainThread, WorkerThread,} from "./BaseVoiceModule.js";
import console from "console";
import ytdl from "@distube/ytdl-core";

export default class MusicVoiceModule extends BaseVoiceModule {
    uniqueName = "./src/newVoice/modules/MusicVoiceModule.js";

    @MainThread()
    async onReady() {
        console.log("MusicVoiceModule ready")
    }

    @WorkerThread()
    async onWorkerReady() {
        console.log("MusicVoiceModule worker ready")
    }

    _onReady(): any {}
    async _onThreadReady() {
        if (!this.audioStream) return

        // Start streaming
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
        testStream.pipe(this.audioStream)
    }

}
