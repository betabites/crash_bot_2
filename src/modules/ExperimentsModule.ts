import {BaseModule, InteractionCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandBooleanOption} from "@discordjs/builders";
import {CommandInteraction, GuildMember} from "discord.js";
import {getUserData} from "../utilities/getUserData.js";
import SafeQuery from "../misc/SQL.js";
import mssql from "mssql";

export class ExperimentsModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("experiments")
            .setDescription("Opt in or out of Crash Bot experimental features")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("quoteresponseai")
                    .setDescription("Toggle the 'quote response ai' experiment")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("words")
                    .setDescription("Enable or disable the words experiment")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("babyspeak")
                    .setDescription("Enable or disable the baby speak experiment")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Would you like to enable (true) or disable (false) this experiment?")
                            .setRequired(true)
                    )
            )
    ]

    @InteractionCommandResponse("experiments")
    async onExperimentsCommand(interaction: CommandInteraction) {
        // Used to manage experimental features
        let com = interaction.options.getSubcommand()
        if (com === "quoteresponseai") {
            let bool = interaction.options.getBoolean("setting")
            // Ensure that the user is in the database
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentAIQuoteResponse = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `quoteresponseai` to: `" + (bool ? "true" : "false") + "`",
                ephemeral: true
            })
        }
        else if (com === "words") {
            let bool = interaction.options.getBoolean("setting")
            // Get the user's key
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentWords = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `experimentWords` to: `" + (bool ? "true" : "false") + "`. Individual words that you say, will now be saved. Words are saved independently of each other for security (not as full sentences).",
                ephemeral: true
            })
        }
        else if (com === "babyspeak") {
            let bool = interaction.options.getBoolean("setting")
            // Get the user's key
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET experimentBabyWords = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            interaction.reply({
                content: "Set `experimentBabyWords` to: `" + (bool ? "true" : "false") + "`.",
                ephemeral: true
            })
        }
    }
}