import {client} from "../services/Discord.js";
import Discord, {EmbedBuilder, Guild, GuildMember, TextChannel} from "discord.js";
import SafeQuery from "../services/SQL.js";
import RemoteStatusServer from "./RemoteStatusServer.js";

let last_scoreboard_update = Date.now() - 30000

export async function updateScoreboard() {
    if (Date.now() < last_scoreboard_update + 30000) return
    console.log("Updating scoreboard")
    last_scoreboard_update = Date.now()

    let channel = await client.channels.fetch("968298113427206195") as TextChannel
    if (!channel) return
    let msg = await channel.messages.fetch("1105257601450651719")

    let embed = new EmbedBuilder()
    embed.setTitle("Scoreboard")
    embed.setDescription("Here you can see a list of online players")

    let res = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id IS NOT NULL", [])
    for (let user of res.recordset) {
        let member: GuildMember | null = null
        try {
            member = await channel.guild.members.fetch(user.discord_id)
        } catch(e) {}
        // @ts-ignore
        let player = RemoteStatusServer.connections["pczWlxfMzPmuI6yjQMaQYA=="].getPlayer(user.mc_id)

        if (player && user.mc_detailed_scoreboard) {
            embed.addFields({
                name: member?.nickname || member?.user.username || player.username || user.discord_id.toString(),
                value: `Currently exploring: \`${player.dimension}\``
            })
        }
        else if (player) {
            embed.addFields({
                name: member?.nickname || member?.user.username || player.username || user.discord_id.toString(),
                value: `Online`
            })
        }
        // else {
        //     embed.addFields({
        //         name: member.nickname || member.user.username,
        //         value: "offline"
        //     })
        // }
    }
    msg.edit({content: ' ', embeds: [embed]})
}