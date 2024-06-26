import Discord, {Client, GatewayIntentBits, GuildMember, Message, TextChannel, Webhook} from "discord.js";
import SafeQuery from "./SQL.js";
import mssql from "mssql";
import Jimp from "jimp";
import {makeid} from "../misc/Common.js";
import fs from "fs";
import https from "https";
import * as path from "path";
import {Writable} from "stream"

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildMembers
    ], partials: [Discord.Partials.Channel]
})

export async function sendImpersonateMessage(channel: TextChannel, member: GuildMember, message: string |
    Discord.MessagePayload |
    Discord.BaseMessageOptions |
    Discord.WebhookMessageCreateOptions
) {
    SafeQuery("SELECT * FROM dbo.Webhook WHERE channel_id = @channelid AND user_id = @userid", [
        {name: "userid", type: mssql.TYPES.VarChar(100), data: member.id},
        {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id}
    ])
        .then((res: any) => {
            if (res.recordset.length === 0) throw "Could not find webhook"

            let webhook = new Discord.WebhookClient({id: res.recordset[0].webhook_id, token: res.recordset[0].token})
            return webhook.send(message)
        })
        .catch((e: any) => {
            // channel.createWebhook(member.nickname || member.user.username, {
            //     avatar: member.avatarURL() || member.user.avatarURL(),
            //     reason: "Needed new cheese"
            // })

            SafeQuery("DELETE FROM dbo.Webhook WHERE user_id = @userid AND channel_id = @channelid", [
                {name: "userid", type: mssql.TYPES.VarChar(100), data: member.id},
                {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id}
            ]).then(() => {
                return channel.createWebhook({
                    name: member.nickname || member.user.username,
                    avatar: member.avatarURL() || member.user.avatarURL(),
                    reason: "Needed new cheese"
                })
            })
                .then((webhook: Webhook) => {
                    webhook.send(typeof message === "string" ? {
                        content: message,
                        allowedMentions: {
                            parse: [],
                            users: [],
                            roles: [],
                            repliedUser: false
                        },
                    }: message)
                    return SafeQuery("INSERT INTO dbo.Webhook (user_id, channel_id, webhook_id, token) VALUES (@userid, @channelid, @webhookid, @token)", [
                        {name: "userid", type: mssql.TYPES.VarChar(100), data: member.id},
                        {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id},
                        {name: "webhookid", type: mssql.TYPES.VarChar(100), data: webhook.id},
                        {name: "token", type: mssql.TYPES.VarChar(100), data: webhook.token}
                    ])
                })
                .then(() => {
                })
        })
}

export function downloadDiscordAttachmentWithInfo(msg_id: string, channel_id: string, url: string, extension: string, stream: (filename: string) => Writable): Promise<Buffer | void> {
    return new Promise(async resolve => {
        let _msg: Message | null
        try {
            // @ts-ignore
            _msg = await (await client.channels.fetch(channel_id)).messages.fetch(msg_id)
        } catch (e) {
            resolve(downloadDiscordAttachment(url, extension, stream))
            return
        }
        let msg = _msg as Message

        console.log(url, extension, stream)
        let file = await downloadDiscordAttachment(url, extension, stream)
        let font_big = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
        let font_small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
        Jimp.read(file)
            .then(async image => {
                // console.log(image.getWidth(), image.getHeight())
                let width = image.getWidth()
                let height = image.getHeight()

                if (width > height && width > 1080) {
                    height = (height / width) * 1080
                    width = 1080
                    image.resize(width, height)
                }
                else if (height > width && height > 1080) {
                    width = (width / height) * 1080
                    height = 1080
                    image.resize(width, height)
                }

                // Place black bar along bottom
                let color = Jimp.rgbaToInt(255, 255, 255, .75)
                new Jimp(width, height + 130, "#000", async (err, out) => {
                    out.composite(image, 0, 0)

                    try {
                        // @ts-ignore
                        let author = await Jimp.read((msg.member || msg.author).avatarURL({format: "jpg"}))
                        author.resize(100, 100)
                        author.circle()
                        out.composite(author, 20, height + 20)
                    } catch (e) {
                    }

                    out.print(font_big, 140, height + 20, (msg.member ? msg.member.nickname : msg.author.username) || "Unknown")
                    out.print(font_small, 140, height + 80, "#" + (msg.channel as TextChannel).name)
                    if (msg.content && msg.content.length < 100) out.print(font_small, 200, height + 20, {
                            text: msg.content,
                            alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT
                            // alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                        },
                        width - 220,
                        height)
                    out.getBufferAsync(Jimp.MIME_JPEG).then(buffer => {
                        let name = makeid(10) + ".jpg"
                        while (fs.existsSync(path.resolve("./") + "/memories/" + name)) {
                            name = makeid(10) + ".jpg"
                        }
                        const writeStream = stream(name)
                        writeStream.end(buffer)
                        resolve()
                    })
                })
            })
            .catch(e => {
                console.error(e)
                resolve()
            })
    })
}

export function downloadDiscordAttachment(url: string, fileextension: string, stream: (filename: string) => Writable): Promise<Buffer> {
    return new Promise(resolve => {
        // Pick a filename
        let name = makeid(10) + "." + fileextension
        while (fs.existsSync(path.resolve("./") + "/memories/" + name)) {
            name = makeid(10) + "." + fileextension
        }
        let req = https.get(url.replace("http:", "https:"), (res) => {
            let data: Buffer[] = []
            const writeStream = stream(name)
            res.pipe(writeStream)
            res.on("data", (chunk) => {
                data.push(chunk)
            })
            res.on('close', () => {
                resolve(Buffer.concat(data))
            })

        })
    })
}

export function getToken() {
    return fs.readFileSync(path.join(path.resolve("./"), "botToken")).toString()
}
