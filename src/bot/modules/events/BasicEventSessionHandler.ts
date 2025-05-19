import {GameSessionModule} from "../GameSessionModule.ts";
import {
    ActionRowBuilder,
    BaseGuildTextChannel,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    PermissionsBitField
} from "discord.js";
import {EVENT_IDS} from "../GameAchievements.ts";

export class BasicEventSessionHandler extends GameSessionModule {
    onUserJoinsSession = async (session_id: string, user_id: string) => {
        let session = await this.getGameSession(session_id)
        if (!session) return
        let players = await this.getUsersSubscribedToSession(session_id)

        let channel: BaseGuildTextChannel
        if (!session.hidden_discord_channel && players.length >= (session.min_players ?? 0)) {
            // Create a Discord channel for this session
            let guild = await this.client.guilds.fetch("892518158727008297")
            channel = await guild.channels.create({
                name: session.start.toLocaleDateString().replaceAll("/", "-"),
                parent: "1273515817451130913",
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                        ],
                        id: user_id
                    },
                    {
                        deny: [PermissionsBitField.Flags.ViewChannel],
                        id: guild.id // Deny access by default
                    },
                ]
            })
            void this.attachDiscordChannelToSession(session_id, channel.id)
            let actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`unsubscribe_event_${session_id}`)
                        .setLabel("Leave event")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`edit_event_${session_id}`)
                        .setLabel("Edit")
                        .setStyle(ButtonStyle.Secondary)
                )
            if (session.event_creation_channel && session.event_creation_message) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setLabel("Event creation")
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/892518158727008297/${session.event_creation_channel}/${session.event_creation_message}`)

                )
            }

            let msg = await channel.send({
                embeds: [this.buildInviteEmbed(session)],
                components: [actionRow]
            })
            await msg.pin()

            channel.send({content: `Everyone's here! We have enough players to do this event!`})
        }
        else if (session.hidden_discord_channel) {
            let _channel = await this.client.channels.fetch(session.hidden_discord_channel)
            channel = _channel as BaseGuildTextChannel
            void channel.permissionOverwrites.create(user_id, {
                ViewChannel: true
            })
            channel.send(`<@${user_id}> joined this session`)
        }
    }
    onUserLeavesSession = async (session_id: string, user_id: string) => {
        let session = await this.getGameSession(session_id)
        if (!session) return

        let channel: BaseGuildTextChannel
        if (!session.hidden_discord_channel) return

        let _channel = await this.client.channels.fetch(session.hidden_discord_channel)
        channel = _channel as BaseGuildTextChannel
        void channel.permissionOverwrites.delete(user_id)

        channel.send(`<@${user_id}> left this session`)
    }

    constructor(client: Client, game_id: EVENT_IDS) {
        super(client, game_id);
    }
}
