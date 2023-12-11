import {BaseModule, InteractionButtonResponse, InteractionCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandStringOption, SlashCommandUserOption} from "@discordjs/builders";
import Discord, {ButtonInteraction, CommandInteraction, GuildMember, Message} from "discord.js";
import SafeQuery from "../misc/SQL.js";
import {client} from "../misc/Discord.js";
import {fetchThrowTemplates, generateThrow} from "../misc/ThrowMaker.js";
import * as fs from "fs";
import path from "path";
import {quoteReply} from "../utilities/quoteReply.js";

export class ImagesModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("throw")
            .setDescription("Throw a random user")
            .addUserOption(
                new SlashCommandUserOption()
                    .setName("user")
                    .setDescription("A member of this server whom you wish to throw")
                    .setRequired(true)
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("template")
                    .setDescription("The template to use")
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName("random_capture")
            .setDescription("Receive the blessing (or curse) of a random screenshot.")
    ]

    @InteractionCommandResponse("throw")
    onThrow(interaction: CommandInteraction) {
        // Read available memes
        interaction.deferReply().then(async () => {
            let sender = interaction.member as GuildMember
            let target = interaction.options.getMember("user") as GuildMember

            generateThrow(await sender.fetch(), await target.fetch(), interaction.options.getString("template") || null).then(meme => {

                interaction.editReply({
                    content: "TEMPLATE: `" + meme.template.location + "`", files: [
                        new Discord.MessageAttachment(fs.readFileSync(meme.file))
                    ]
                }).then(() => {

                })
            }).catch(e => {
                console.log(e)
                interaction.editReply({
                    content: e.toString()
                })
            })
        })
    }

    @InteractionCommandResponse("random_capture")
    async onRandomCapture(interaction: CommandInteraction) {
        interaction.reply(await generateRandomCaptureMsg() || "Oops. Could not find a random cature")
    }

    @InteractionButtonResponse((id) => id.startsWith("verify_throw_"))
    onVerifyButtonPress(interaction: ButtonInteraction) {
        let template_id = interaction.customId.replace("verify_throw_", "")
        console.log(template_id)

        let memes = fetchThrowTemplates()
        let meme = memes.find(meme => {
            return meme.location === template_id
        })
        if (!meme) {
            interaction.reply("Ooop. We could not find that template")
            return
        }
        else {
            memes[memes.indexOf(meme)].verified = true
            fs.writeFileSync(path.resolve("./") + "/assets/throw/memes.json", JSON.stringify(memes))
            interaction.reply("👍 Verified")
        }
    }

    @InteractionButtonResponse("offensive_inspiro_quote")
    onOffensiveQuoteButtonPress(interaction: ButtonInteraction) {
        (interaction.message as Message).delete()
        interaction.reply({
            content: "That's ok. Inspirobot isn't perfect, and can sometimes create some offensive quotes.",
            ephemeral: true
        })
    }

    @InteractionButtonResponse("another_inspiro_quote")
    onAnotherQuotePress(interaction: ButtonInteraction) {
        if (!interaction.channel) throw "Unknown channel"
        quoteReply(interaction.channel, interaction)
    }
}

interface RandomCaptureData {
    content: string
    components: Discord.MessageActionRow[]
}

async function generateRandomCaptureMsg(): Promise<RandomCaptureData | void> {
    let capture = (await SafeQuery("SELECT TOP 1 * from dbo.Memories ORDER BY NEWID()")).recordset[0]
    if (capture.type === 0) {
        let channel = await client.channels.fetch(capture.channel_id)
        if (capture.attachment_id) {
            let data: RandomCaptureData = {
                content: "https://cdn.discordapp.com/attachments/" + capture.channel_id + "/" + capture.attachment_id + "/" + capture.data,
                components: [
                    new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setStyle("LINK")
                                .setURL("https://discord.com/channels/892518158727008297/" + capture.channel_id + "/" + capture.msg_id)
                                .setLabel("Go to original message"),
                            new Discord.MessageButton()
                                .setStyle("SECONDARY")
                                .setCustomId("random_capture")
                                .setLabel("Another")
                                .setEmoji("🔃")
                        )
                ]
            }
            return data
        }
        else {
            let data: RandomCaptureData = {
                content: "Unfortunately this capture does not support previewing. Click the button below to see it.",
                components: [
                    new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setStyle("LINK")
                                .setURL("https://discord.com/channels/892518158727008297/" + capture.channel_id + "/" + capture.msg_id)
                                .setLabel("Go to original message"),
                            new Discord.MessageButton()
                                .setStyle("SECONDARY")
                                .setCustomId("random_capture")
                                .setLabel("Another")
                                .setEmoji("🔃")
                        )
                ]
            }
            return data
        }
    }
}