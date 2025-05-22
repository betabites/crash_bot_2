import {Client, EmbedBuilder, TextBasedChannel} from "discord.js";
import {GrantPointsOptions} from "./Points";

export async function grantPointsWithDMResponse(options: GrantPointsOptions & {
    responseChannel: TextBasedChannel,
    discordClient: Client
}) {
    if (options.points == 0) return

    let {level, points, leveled_up} = await options.user.grantPoints(options.points, options.reason, options.capped)
    if (leveled_up) {
        let discordUser = await options.discordClient.users.fetch(options.userDiscordId)

        let upgradeMsg = levelUpgradeMessages[user.level + 1]
        let embed = new EmbedBuilder()
        embed.setTitle(`🥳 Level up!`)
        embed.setDescription(`<@${options.userDiscordId}> just leveled up to level ${user.level}!${
            upgradeMsg ? "\n\n" + upgradeMsg : ""
        }`)
        embed.setThumbnail(discordUser.displayAvatarURL())
        discordUser.send({embeds: [embed]})
    }
}