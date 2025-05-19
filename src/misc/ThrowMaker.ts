import Jimp from "jimp";
import fs from "node:fs";
import {GuildMember} from "discord.js";
import {ShuffleArray} from "./Common.ts";
import * as path from "node:path";

interface ThrowTemplate {
    location: string,
    url?: string,
    pfp_locations: {
        type: "target" | "sender" | "random",
        location: { x: number, y: number },
        size: {x: number, y: number},
        circle?: boolean
    }[],
    verified: boolean
}

interface ThrowResult {
    template: ThrowTemplate,
    file: string
}

export function fetchThrowTemplates(): ThrowTemplate[] {
    return JSON.parse(fs.readFileSync(path.resolve("./") + "/assets/throw/memes.json").toString()) as ThrowTemplate[]
}

function sanitiseThrowTemplates() {
    let memes = fetchThrowTemplates()
    for (let meme of memes) {
        if (typeof meme.url !== "undefined") {
            let base64Image = meme.url.split(';base64,').pop() || "";
            fs.writeFileSync(path.resolve("./") + "/assets/throw/" + meme.location, base64Image, {encoding: 'base64'})

            delete meme.url
        }

        if (typeof meme.verified === "undefined") meme.verified = true
    }
    fs.writeFileSync(path.resolve("./") + "/assets/throw/memes.json", JSON.stringify(memes))
}

sanitiseThrowTemplates()

export function generateThrow(sender: GuildMember, target: GuildMember, template: string | null = null): Promise<ThrowResult> {
    return new Promise((resolve, reject) => {
        let memes = fetchThrowTemplates()

        let meme: ThrowTemplate,
            temp_name: string
        if (template === null) {
            // Pick a random meme
            memes = memes.filter(meme => meme.verified)
            meme = memes[Math.floor(Math.random() * memes.length)]
            temp_name = Math.round(Math.random() * 10000000) + meme.location
        }
        else {
            let find_res = memes.find(meme => {
                return meme.location === template
            })
            if (!find_res) {
                console.log(template)
                reject("Ooop. We could not find that template")
                return false
            }
            meme = find_res
        }

        // Load in the image
        Jimp.read(path.resolve("./") + "/assets/throw/" + meme.location)
            .then(async image => {
                try {
                    let sender_pfp = await Jimp.read(
                        sender.avatarURL({extension: "jpg"}) || sender.user.avatarURL({extension: "jpg"}) || ""
                    )


                    let target_pfp = await Jimp.read(
                        target.avatarURL({extension: "jpg"}) || target.user.avatarURL({extension: "jpg"}) || ""
                    )

                    let random_users = ShuffleArray((await sender.guild.members.fetch()).map(i => {
                        return i
                    }).filter(i => {
                        return i.id !== sender.id && i.id !== target.id
                    }))

                    let current_random = 0
                    for (let location of meme.pfp_locations) {
                        if (location.type === "target") {
                            let temp = await target_pfp.clone()
                            if (typeof location.circle !== "undefined") {
                                temp.circle()
                            }
                            temp.resize(location.size.x, location.size.y)
                            image.composite(temp, location.location.x, location.location.y)
                        }
                        else if (location.type === "sender") {
                            let temp = await sender_pfp.clone()
                            if (typeof location.circle !== "undefined") {
                                temp.circle()
                            }
                            temp.resize(location.size.x, location.size.y)
                            image.composite(temp, location.location.x, location.location.y)
                        }
                        else if (location.type === "random") {
                            let temp = await Jimp.read(
                                random_users[current_random].avatarURL({extension: "jpg"}) || random_users[current_random].user.avatarURL({extension: "jpg"}) || ""
                            )

                            if (typeof location.circle !== "undefined") {
                                temp.circle()
                            }
                            temp.resize(location.size.x, location.size.y)
                            image.composite(temp, location.location.x, location.location.y)

                            if (current_random === random_users.length) {
                                current_random = 0
                            }
                            else {
                                current_random += 1
                            }
                        }
                    }
                    image.write(path.resolve("./") + "/" + temp_name, () => {
                        resolve({
                            template: meme,
                            file: path.resolve("./") + "/" + temp_name
                        })
                        setTimeout(() => {
                            fs.unlinkSync(path.resolve("./") + "/" + temp_name)
                        }, 5000)
                    })
                } catch (e: any) {
                    console.log(e)
                    reject("Whoops. It seems an error occoured while trying to generate a meme using `" + meme.location + "`\n\n```json\n" + JSON.stringify(meme) + "```\n" + e.toString())
                }
            })
    })
}