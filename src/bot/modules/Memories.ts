import {BaseModule, OnClientEvent} from "./BaseModule.ts";
import express from "express";
import SafeQuery, {sql} from "../services/SQL.ts";
import {makeid, QueueManager} from "@/misc/Common.ts";
import {downloadDiscordAttachment, downloadDiscordAttachmentWithInfo} from "../services/Discord.ts";
import fs from "node:fs";
import path from "node:path";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import {PassThrough, Writable} from "stream"
import archiver from "archiver";
import {Message} from "discord.js";
import mssql from "mssql";

const imageCaptureChannels = ["892518159167393824", "928215083190984745", "931297441448345660", "966665613101654017", "933949561934852127", "1002003265506000916", "1235198055788187820", "1180614418858512464"]


export class Memories extends BaseModule {
    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        if (imageCaptureChannels.indexOf(msg.channel.id) !== -1 && !msg.author.bot) {
            let urls = msg.content.match(/\bhttps?:\/\/\S+/gi) || []
            let yt_urls: any[] = []
            for (let url of urls) {
                if (ytdl.validateURL(url)) yt_urls.push(url)
            }

            if (msg.attachments.size > 0 || yt_urls.length > 0) {
                msg.react("❌").then(reaction => {
                    msg.awaitReactions({
                        filter: (reaction, user) => {
                            return reaction.emoji.name === "❌" && user.id === msg.author.id
                        },
                        max: 1,
                        time: 15000
                    }).then(async reactions => {
                        if (reactions.size === 0) {
                            console.log("Saving memory...")
                            for (let attachment of msg.attachments) {
                                console.log(attachment)
                                await SafeQuery("INSERT INTO dbo.Memories (author_discord_id, channel_id, data, msg_id, attachment_id) VALUES (@author,@channel,@data,@msg,@attachmentid)", [
                                    {name: "author", type: mssql.TYPES.VarChar(100), data: msg.author.id},
                                    {name: "channel", type: mssql.TYPES.VarChar(100), data: msg.channel.id},
                                    {name: "data", type: mssql.TYPES.VarChar(100), data: attachment[1].name},
                                    {name: "msg", type: mssql.TYPES.VarChar(100), data: msg.id},
                                    {name: "attachmentid", type: mssql.TYPES.VarChar(100), data: attachment[1].id}
                                ])
                                console.log("Saved attachment")
                            }

                            for (let url of yt_urls) {
                                await SafeQuery("INSERT INTO dbo.Memories (author_discord_id, channel_id, data, msg_id, type) VALUES (@author,@channel,@data,@msg,1)", [
                                    {name: "author", type: mssql.TYPES.VarChar(100), data: msg.author.id},
                                    {name: "channel", type: mssql.TYPES.VarChar(100), data: msg.channel.id},
                                    {name: "data", type: mssql.TYPES.VarChar(100), data: url},
                                    {name: "msg", type: mssql.TYPES.VarChar(100), data: msg.id}
                                ])
                            }
                        }
                    }).catch(e => {
                    })
                        .finally(() => {
                            reaction.remove()
                        })
                })
            }
        }
    }
}

export const MEMORIES_ROUTER = express.Router()
MEMORIES_ROUTER.get("/channel/:channelId/*.zip", async (req, res, next) => {
    res.setHeader("cache-control", "no-store")
    res.setHeader("CDN-Cache-Control", "no-store")
    console.log(`Generating memories for channel: ${req.params.channelId}`)
    try {
        let memories

        if (req.params.channelId === "all") {
            memories = await SafeQuery(sql`SELECT *
                                           FROM dbo.Memories
                                           WHERE (type = 1 OR attachment_id IS NOT NULL)
            `)
        }
        else {
            memories = await SafeQuery(sql`SELECT *
                                           FROM dbo.Memories
                                           WHERE (type = 1 OR attachment_id IS NOT NULL)
                                             AND channel_id = ${req.params.channelId}`)
        }

        let archive = archiver("zip")
        let queue = new QueueManager(4)
        for (let memory of memories.recordset) {
            if (memory.type === 0) {
                let extension = memory.data.split(".")[memory.data.split(".").length - 1]
                if (extension === "jpg" || extension === "jpeg" || extension === "png") {
                    queue.pushToQueue(downloadDiscordAttachmentWithInfo, [memory.msg_id, memory.channel_id, "https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, (filename: string) => {
                        let stream = new PassThrough()
                        archive.append(stream, {name: filename})
                        return stream
                    }])
                }
                else {
                    queue.pushToQueue(downloadDiscordAttachment, ["https://cdn.discordapp.com/attachments/" + memory.channel_id + "/" + memory.attachment_id + "/" + memory.data, extension, (filename: string) => {
                        let stream = new PassThrough()
                        archive.append(stream, {name: filename})
                        return stream
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
        queue.start().then(() => archive.finalize()).catch(e => {
            console.error(e)
            archive.abort()
        })

        archive.pipe(res)
        // res.send("Generating memories!")
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
