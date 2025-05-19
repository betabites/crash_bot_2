import {
    BaseModule,
    InteractionAutocompleteResponse,
    InteractionButtonResponse,
    InteractionChatCommandResponse
} from "./BaseModule.ts";
import {SlashCommandBuilder, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {
    ActionRowBuilder,
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    ModalActionRowComponentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";
import {EVENT_IDS} from "./GameAchievements.ts";
import {GameSessionData, GameSessionModule} from "./GameSessionModule.ts";
import moment from "moment-timezone";

export class EventsModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("events")
            .setDescription("Mange gaming events")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("create")
                    .setDescription("Create a new gaming event")
                    .addIntegerOption((i) => i
                        .setName("activity")
                        .setDescription("Your event type")
                        .setRequired(true)
                        .addChoices([
                            {name: "Other", value: EVENT_IDS.OTHER},
                            {name: "Chill", value: EVENT_IDS.CHILL},
                            {name: "Movie/TV Show", value: EVENT_IDS.MOVIE_OR_TV},
                            {name: "Gaming", value: EVENT_IDS.OTHER},
                            ...[
                                {name: "Destiny 2", value: EVENT_IDS.DESTINY2},
                                {name: "Among Us", value: EVENT_IDS.AMONG_US},
                                {name: "Space Engineers", value: EVENT_IDS.SPACE_ENGINEERS},
                                {name: "Bopl Battle", value: EVENT_IDS.BOPL_BATTLE},
                                {name: "Lethal Company", value: EVENT_IDS.LETHAL_COMPANY},
                                {name: "Minecraft", value: EVENT_IDS.MINECRAFT},
                                {name: "Phasmophobia", value: EVENT_IDS.PHASMOPHOBIA},
                                {name: "Borderlands", value: EVENT_IDS.BORDERLANDS},
                                {name: "Escapists", value: EVENT_IDS.ESCAPISTS},
                                {name: "Garry's Mod", value: EVENT_IDS.GMOD},
                                {name: "Northgard", value: EVENT_IDS.NORTHGARD},
                                {name: "Oh Deer!", value: EVENT_IDS.OH_DEER},
                                {name: "Project Playtime", value: EVENT_IDS.PROJECT_PLAYTIME},
                                {name: "Terraria", value: EVENT_IDS.TERRARIA},
                                {name: "Warframe", value: EVENT_IDS.WARFRAME},
                                {name: "Who's your daddy!?", value: EVENT_IDS.WHOS_YOUR_DADDY}
                            ].sort((a,b) => a.name < b.name ? -1 : 1)
                        ])
                    )
                    .addStringOption((str) => str
                        .setName("description")
                        .setDescription("A description for your event")
                        .setRequired(true)
                        .setMaxLength(1_000)
                        .setDescription("Timezone. Examples; NZ, AU, MY, GB")
                    )
                    .addStringOption((str) => str
                        .setName("timezone")
                        .setDescription("Your current timezone. Your inputted time will be converted based on this.")
                        .setRequired(true)
                        .setMaxLength(2)
                        .setMinLength(2)
                        .setDescription("Timezone. Examples; NZ, AU, MY, GB")
                    )
                    .addIntegerOption(i => i
                        .setName("hour")
                        .setDescription("The hour")
                        .setMinValue(0)
                        .setMaxValue(23)
                        .setDescription("The hour at which this event starts. Expects values between 0-23.")
                        .setRequired(true)
                    )
                    .addIntegerOption(i => i
                        .setName("minute")
                        .setDescription("The minute")
                        .setMinValue(0)
                        .setMaxValue(59)
                        .setDescription("The minute at which this event starts. Expects values between 0-59.")
                        .setRequired(true)
                    )
                    .addIntegerOption(i => i
                        .setName("second")
                        .setDescription("The second")
                        .setMinValue(0)
                        .setMaxValue(59)
                        .setDescription("The hour at which this event starts. Expects values between 0-59.")
                        .setRequired(true)
                    )
                    .addStringOption(str => str
                        .setName("date")
                        .setDescription("The date. Defaults to today if not specified")
                        .setDescription("The event's date in DD-MM-YYYY format. Defaults to today.")
                    )
                    .addIntegerOption(i => i
                        .setName("min_players")
                        .setDescription("The minimum amount of players required for the event to proceed")
                    )
                    .addIntegerOption(i => i
                        .setName("max_players")
                        .setDescription("The maximum amount of players required for the event to proceed")
                    )
            )
    ]

    @InteractionChatCommandResponse("events")
    async onEventsCommand(interaction: ChatInputCommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case "create":
                let activity = interaction.options.getInteger("activity", true)
                let description = interaction.options.getString("description", true)
                let timezone = interaction.options.getString("timezone", true)
                let hour = interaction.options.getInteger("hour", true)
                let minute = interaction.options.getInteger("minute", true)
                let second = interaction.options.getInteger("second", true)

                let date = interaction.options.getString("date")
                let minPlayers = interaction.options.getInteger("min_players")
                let maxPlayers = interaction.options.getInteger("max_players")

                let sessionHandler = GameSessionModule.sessionBindings.get(activity)
                if (!sessionHandler) {
                    interaction.reply("Oops! It looks like that activity either doesn't exist, or we don't have a handler for it. Please try selecting another activity.")
                    throw new Error("Could not find game session manager for game ID: " + activity)
                }

                let momentObj = moment()
                if (date) momentObj = moment(date, "DD-MM-YYYY")
                momentObj.tz(timezone, true)
                momentObj.hours(hour)
                momentObj.minutes(minute)
                momentObj.seconds(second)
                // Convert the moment back to UTC
                momentObj.tz("UTC")

                let message = await interaction.deferReply({fetchReply: true})
                let session = await sessionHandler.createNewGameSession(momentObj.toDate(), description, message.channel.id, message.id)
                let gameData: GameSessionData = {
                    id: session,
                    game_id: activity,
                    start: momentObj.toDate(),
                    hidden_discord_channel: null,
                    description
                }
                void interaction.editReply({
                    content: "",
                    embeds: [sessionHandler.buildInviteEmbed(gameData)],
                    components: [sessionHandler.buildInviteComponents(gameData)]
                })
                return
            default:
                interaction.reply("Congratulations! You found a new feature that is in development.")
        }
    }

    @InteractionAutocompleteResponse("events")
    onAutoComplete(interaction: AutocompleteInteraction) {
        switch (interaction.options.getSubcommand()) {
            case "create":
                console.log(interaction)
        }
    }

    @InteractionButtonResponse((b) => b.startsWith("join_event_"))
    async onJoinEventButton(interaction: ButtonInteraction) {
        await interaction.deferReply({ephemeral: true})
        try {
            let sessionData = await GameSessionModule.getGameSession(
                interaction.customId.replace("join_event_", "")
            )
            if (!sessionData) throw new Error("Could not find event session")

            // Determine the event handler
            const handler = GameSessionModule.sessionBindings.get(sessionData.game_id)
            if (!handler) throw new Error("Could not find event session handler")

            await handler.subscribeUserToSession(interaction.user.id, sessionData.id)
            void interaction.editReply("Subscribed you to the event!")
        } catch (e) {
            void interaction.editReply({
                content: "Uh oh! There was an error while adding you to this event",
            })
            throw e
        }
    }

    @InteractionButtonResponse((t) => t.startsWith("unsubscript_event_"))
    onUnsubscribeButton(interaction: ButtonInteraction) {
        interaction.reply("Not implemented yet sorry :(")
    }

    @InteractionButtonResponse((t) => t.startsWith("edit_event_"))
    async onEditEvent(interaction: ButtonInteraction) {
        let session_id = interaction.customId.replace("edit_event_", "")
        let session = await GameSessionModule.getGameSession(session_id)
        if (!session) {
            interaction.reply({content: "Unknown session", ephemeral: true})
            return
        }

        const modal = new ModalBuilder()
            .setCustomId(interaction.customId)
            .setTitle("Edit event")
            .addComponents(
                // new ActionRowBuilder<ModalActionRowComponentBuilder>()
                //     .addComponents(
                //         new TextInputBuilder()
                //             .setCustomId("timezone")
                //             .setLabel("Your current timezone")
                //             .setValue("Auckland/Pacific")
                //             .setStyle(TextInputStyle.Short)
                //             .setRequired(true)
                //     ),
                new ActionRowBuilder<ModalActionRowComponentBuilder>()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId("start")
                            .setLabel("Start")
                            .setValue(
                                moment(session.start)
                                    .tz("Auckland/Pacific")
                                    .toISOString()
                            )
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short),
                    ),
                new ActionRowBuilder<ModalActionRowComponentBuilder>()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId("description")
                            .setLabel("Event description")
                            .setStyle(TextInputStyle.Paragraph)
                    )
            )


        await interaction.showModal(modal)
    }
}
