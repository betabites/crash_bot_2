import {Client, EmbedBuilder} from "discord.js";
import {GrantPointsOptions, levelUpgradeMessages} from "./Points.js";

export async function grantPointsWithDMResponse(options: GrantPointsOptions & {
    discordClient: Client
}) {
    if (options.points == 0) return

    let {level, points, leveled_up} = await options.user.grantPoints(options.points, options.reason, options.capped)
    if (leveled_up) {
        let discordUser = await options.discordClient.users.fetch(options.user.discord_id)

        let upgradeMsg = levelUpgradeMessages[level + 1]
        let embed = new EmbedBuilder()
        embed.setTitle(`🥳 Level up!`)
        embed.setDescription(`<@${options.user.discord_id}> just leveled up to level ${level}!${
            upgradeMsg ? "\n\n" + upgradeMsg : ""
        }`)
        embed.setThumbnail(discordUser.displayAvatarURL())
        discordUser.send({embeds: [embed]})
    }
}