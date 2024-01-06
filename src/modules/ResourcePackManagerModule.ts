import {BaseModule, InteractionButtonResponse, InteractionChatCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandStringOption} from "@discordjs/builders";
import {ButtonInteraction, ChatInputCommandInteraction, CommandInteraction} from "discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";

export class ResourcePackManagerModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("getlink")
            .setDescription("Get your website link"),
        new SlashCommandBuilder()
            .setName("getcode")
            .setDescription("Get another player's access code/key")
            .setDefaultMemberPermissions(null)
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("mc_username")
                    .setDescription("The player's Minecraft username")
                    .setRequired(true)
            ),

    ]

    @InteractionButtonResponse("getlink")
    @InteractionChatCommandResponse("getlink")
    async onGetLink(interaction: CommandInteraction | ButtonInteraction) {
        // Get the code

        let req = await SafeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE discord_id = @discordid`, [{
            name: "discordid",
            type: mssql.TYPES.VarChar(20),
            data: interaction.user.id
        }])
        console.log(req)

        if (req.recordset.length !== 0) {
            interaction.reply({
                content: `Your website access link is: https://joemamadf7.jd-data.com:8050/home/${req.recordset[0].shortcode}.`,
                ephemeral: true
            })
        }
        else {
            interaction.reply("You don't have a link yet. Run the `/username` command to generate your own link.")
        }
    }

    @InteractionChatCommandResponse("getcode")
    async onGetCode(interaction: ChatInputCommandInteraction) {
        let mc_username = interaction.options.getString("mc_username")
        let req = await SafeQuery(`SELECT shortcode
                                       FROM dbo.Users
                                       WHERE player_name = @username`, [{
            name: "username",
            type: mssql.TYPES.VarChar(30),
            data: mc_username
        }])

        if (req.recordset.length !== 0) {
            interaction.reply({
                content: `The player's code is \`${req.recordset[0].shortcode}\`.`,
                ephemeral: true
            })
        }
        else {
            interaction.reply({
                content: "Could not find that player. They must run `/username` before you can get their code.",
                ephemeral: true
            })
        }
    }
}