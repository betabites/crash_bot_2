import Discord, {TextBasedChannel} from "discord.js";
import {client} from "../misc/Discord.js";

export function removeAllMentions(str: string, channel_or_guild: Discord.Guild | TextBasedChannel): string {
    let channel: Discord.TextBasedChannel | undefined
    let guild: Discord.Guild | undefined
    if (channel_or_guild instanceof Discord.TextChannel) {
        channel = channel_or_guild
        guild = channel.guild
    }
    else if (channel_or_guild instanceof Discord.Guild) {
        guild = channel_or_guild
    }
    else {
        channel = channel_or_guild
    }
    return str.replace(/<@!(\d+)>/, (match: string, userId: string): string => {
        const user = client.users.cache.get(userId)
        if (user) {
            return user.username
        }
        else {
            return match
        }
    })
        .replace(/<@(\d+)>/, (match, userId) => {
            const user = client.users.cache.get(userId)
            if (user) {
                return user.username
            }
            else {
                return match
            }
        })
        .replace(/<@&(\d+)>/, (match, roleId) => {
            if (!guild) return `<@&${roleId}>`
            const role = guild.roles.cache.get(roleId)
            if (role) {
                return role.name
            }
            else {
                return match
            }
        })
        .replaceAll("@", "")
        .replaceAll("\"", "\\\"")
}