import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandRoleOption, SlashCommandStringOption} from "@discordjs/builders";
import {AttachmentBuilder, ChatInputCommandInteraction, CommandInteraction, GuildMember, Message} from "discord.js";
import {sendTwaggerPost} from "../misc/sendTwaggerPost.js";
import {getUserData, SPEECH_MODES} from "../utilities/getUserData.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {askGPTQuestion} from "../utilities/askGPTQuestion.js";
import fs from "fs";
import path from "path";

export class MiscModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("vanish")
            .setDescription("Magically vanish for a few minutes, then return!"),
        new SlashCommandBuilder()
            .setName("sussybaka")
            .setDescription("Magically vanish for a few minutes, then return!")
            .addRoleOption(
                new SlashCommandRoleOption()
                    .setName("role")
                    .setDescription("The role of which a random use will be selected from")
                    .setRequired(true)
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("sussy_baka_message")
                    .setDescription("The message that will be sent to the selected random person")
                    .setRequired(true)
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("regular_message")
                    .setDescription("The message that will be sent to everyone else")
                    .setRequired(true)
            )
    ]

    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (msg.content.includes("<@892535864192827392>")) {
            let action = Math.floor(Math.random() * 3)
            switch (action) {
                case 0:
                    msg.member?.timeout(60 * 1000, 'Pls no ping')
                    return
                case 1:
                    let user = await getUserData(msg.member as GuildMember)
                    let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET speech_mode = ${SPEECH_MODES.BABY_SPEAK}
                                           WHERE discord_id = @discordid`, [{
                        name: "discordid", type: mssql.TYPES.VarChar(20), data: msg.author.id
                    }])
                    msg.reply("Awesome! Thank you for enabling `babyspeak`!")
                    return
                case 2:
                    askGPTQuestion("I am a stinky poo-poo face", msg.channel)
            }
        }
        else if (msg.content === "test" && msg.author.id == "404507305510699019") {
            sendTwaggerPost()
        }
        else if (msg.content.toLowerCase() === "guess what?") {
            msg.reply({
                content: "_", files: [
                    new AttachmentBuilder(fs.readFileSync(path.resolve("./") + "/assets/guess_what.jpg"))
                ]
            })
        }
    }

    @InteractionChatCommandResponse("vainsh")
    onVanish(interaction: CommandInteraction) {
        (interaction.member as GuildMember).timeout(5 * 60 * 1000, "They vanished!")
            .then(() => interaction.reply("You have vanished for 5 minutes!"))
            .catch(e => {
                interaction.reply("Oh no! My magic doesn't work on you!")
            })
    }

    @InteractionChatCommandResponse("sussybaka")
    async onSussyBaka(interaction: ChatInputCommandInteraction) {
        console.log("Finding a sussy baka...")
        let role = interaction.options.getRole("role")
        let sussy_baka_msg = interaction.options.getString("sussy_baka_message")
        let regular_msg = interaction.options.getString("regular_message")

        if (!interaction.guild || !role || !sussy_baka_msg || !regular_msg) {
            interaction.reply("Could not find a sussy baka, as a required piece of information (such as message conent, and/or discord server) was missing.")
            return
        }

        let full_role = await interaction.guild.roles.fetch(role.id)
        if (!full_role) {
            interaction.reply("Could not access the role you provided")
            return
        }
        let selected_member = full_role.members.random()
        if (!selected_member) {
            interaction.reply("Could not select a sussy baka. Make sure that the role you entered has users assigned to it.")
            return
        }
        let other_members = full_role.members.filter(i => i !== selected_member)

        selected_member.send(sussy_baka_msg)
        for (let member of other_members) member[1].send(regular_msg)

        interaction.reply("A sussy baka has been deployed!")
    }
}