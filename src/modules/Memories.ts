import {BaseModule} from "./BaseModule.js";
import express from "express";
import SafeQuery, {sql} from "../services/SQL.js";
import e from "express";
import archiver from "archiver";
import {makeid, QueueManager} from "../misc/Common.js";
import {downloadDiscordAttachment, downloadDiscordAttachmentWithInfo} from "../services/Discord.js";
import fs from "fs";
import path from "path";
import ytdl from "ytdl-core";
import {exec} from "child_process";
import ffmpeg from "fluent-ffmpeg";
import {PassThrough, Writable} from "stream"

export class Memories extends BaseModule {

}

export const MEMORIES_ROUTER = express.Router()
MEMORIES_ROUTER.get("/channel/:channelId/*.zip", async (req, res, next) => {
    try {
        let memories

        if (req.params.channelId === "all") {
            memories = await SafeQuery(sql`SELECT *
                                           FROM dbo.Memories
                                           WHERE (type = 1 OR attachment_id IS NOT NULL)
                                             AND YEAR(creation) = ${(new Date()).getFullYear()}
            `)
        }
        else {
            memories = await SafeQuery(sql`SELECT *
                                           FROM dbo.Memories
                                           WHERE (type = 1 OR attachment_id IS NOT NULL)
                                             AND channel_id = ${req.params.channelId}
                                             AND YEAR(creation) = ${(new Date()).getFullYear()}`)
        }

        let queue = new QueueManager(4)
        for (let memory of memories.recordset) {
            if (memory.type === 0) {
                let extension = memory.data.split(".")[memory.data.split(".").length - 1]
                if (extension === "jpg" || extension === "jpeg" || extension === "png") {
                    queue.pushToQueue(downloadDiscordAttachmentWithInfo, [memory.msg_id, memory.channel_id, "https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, (filename: string) => {
                        return fs.createWriteStream("./memory_out/" + filename)
                    }])
                }
                else {
                    queue.pushToQueue(downloadDiscordAttachment, ["https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, (filename: string) => {
                        return fs.createWriteStream("./memory_out/" + filename)
                    }])
                }
            }
            else {
                // console.log([memory.data, archive])
                // console.log("Skipping YouTube video. Please download manually", memory.data)
                queue.pushToQueue(download_ytdl, [memory.data, (filename: string) => {
                    return fs.createWriteStream("./memory_out/" + filename)
                }])
            }
        }
        queue.start()

        res.send("Generating memories!")
    } catch (e) {
        next(e);
    }
})

function download_ytdl(url: string, stream: (filename: string) => Writable): Promise<void> {
    return new Promise((resolve, reject) => {
        // Pick a filename
        let name = makeid(10) + ".mp4"
        while (fs.existsSync(path.resolve("./") + "/memories/" + name)) {
            name = makeid(10) + ".mp4"
        }
        try {
            let audio_download = ytdl(url, {filter: "audioonly", quality: "highestaudio"})
            let video_download = ytdl(url, {filter: "videoonly", quality: "highestvideo"})
            const writeStream = stream(name)

            let ffmpeg_process = ffmpeg()
            ffmpeg_process.input(video_download).videoCodec("libx264").size("1920x180")
            ffmpeg_process.input(audio_download).audioCodec("aac")
            ffmpeg_process.output(writeStream)
            ffmpeg_process.on('end', () => {
                resolve()
            })
            ffmpeg_process.on('error', (e) => {
                reject(e)
            })
        } catch (e) {
            reject(e)
        }
    })
}