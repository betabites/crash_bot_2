import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Client, Message} from "discord.js";
import {ApplicationCommandOptionTypes} from "discord.js/typings/enums.js";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandStringOption} from "@discordjs/builders";

export class D2Module extends BaseModule {
    readonly commands = [
        (new SlashCommandBuilder())
            .setName("destiny2")
            .setDescription("Commands relating to Destiny 2")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("items")
                    .setDescription("Fetch information about items available in Destiny 2")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("name")
                            .setDescription("The name of the item you are looking for")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("vendors")
                    .setDescription("Fetch information about activities available in Destiny 2")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("name")
                            .setDescription("The name of the vendor you are looking for")
                            .setRequired(true)
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("activities")
                    .setDescription("Fetch information about activities available in Destiny 2")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("name")
                            .setDescription("The name of the activity you are looking for")
                            .setRequired(true)
                    )
            )
    ]

    constructor(client: Client) {
        super(client);
        console.log("Bound client")
    }

    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        console.log("New message!")
    }
}