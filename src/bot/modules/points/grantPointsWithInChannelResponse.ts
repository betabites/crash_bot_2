import {BaseGuildTextChannel, Client, EmbedBuilder, SendableChannels} from "discord.js";
import {GrantPointsOptions, levelUpgradeMessages} from "./Points.js";

export async function grantPointsWithInChannelResponse(options: GrantPointsOptions & {
    responseChannel: SendableChannels,
    discordClient: Client
}) {
    if (options.points == 0) return

    let {level, points, leveled_up} = await options.user.grantPoints(options.points, options.reason, options.capped)
    if (leveled_up) {
        let discord_user =
            options.responseChannel instanceof BaseGuildTextChannel ?
                await options.responseChannel.guild.members.fetch(options.user.discord_id) :
                await options.discordClient.users.fetch(options.user.discord_id)

        let upgradeMsg = levelUpgradeMessages[level + 1]
        let embed = new EmbedBuilder()
        embed.setTitle(`🥳 Level up!`)
        embed.setDescription(`<@${options.user.discord_id}> just leveled up to level ${level}!${
            upgradeMsg ? "\n\n" + upgradeMsg : ""
        }`)
        embed.setThumbnail(discord_user.displayAvatarURL())
        options.responseChannel.send({embeds: [embed]})
    }
}