import {BaseModule, InteractionCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandRoleOption, SlashCommandStringOption} from "@discordjs/builders";
import {CommandInteraction, GuildMember} from "discord.js";

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
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("regular_message")
                    .setDescription("The message that will be sent to everyone else")
                    .setRequired(true)
            )
    ]

    @InteractionCommandResponse("vainsh")
    onVanish(interaction: CommandInteraction) {
        (interaction.member as GuildMember).timeout(5 * 60 * 1000, "They vanished!")
            .then(() => interaction.reply("You have vanished for 5 minutes!"))
            .catch(e => {
                interaction.reply("Oh no! My magic doesn't work on you!")
            })
    }

    @InteractionCommandResponse("sussybaka")
    async onSussyBaka(interaction: CommandInteraction) {
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