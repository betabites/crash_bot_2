import {BaseModule, InteractionButtonResponse, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {
    SlashCommandBooleanOption,
    SlashCommandBuilder,
    SlashCommandStringOption,
    SlashCommandSubcommandBuilder
} from "@discordjs/builders";
import Discord, {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction, ButtonStyle, ChatInputCommandInteraction,
    Client,
    CommandInteraction, EmbedBuilder, Guild,
    GuildMember,
    Message, MessageActionRowComponentBuilder,
    TextChannel
} from "discord.js";
import {getUserData} from "../utilities/getUserData.js";
import SafeQuery from "../services/SQL.js";
import {updateScoreboard} from "../misc/updateScoreboard.js";
import mssql from "mssql";
import RemoteStatusServer, {Connection as ServerConnection} from "./../misc/RemoteStatusServer.js";
import {client, sendImpersonateMessage} from "../services/Discord.js";

RemoteStatusServer.io.on("connection", () => {
    console.log("Client connected")
})

const MC_CHAT_CHANNEL = "892518396166569994"

export class MinecraftModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("minecraft")
            .setDescription("Minecraft")
            .setDefaultMemberPermissions(null)
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("share_location")
                    .setDescription("Share your current in-game location")
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("detailed_scoreboard")
                    .setDescription("Set whether your online status is detailed (true) or not (false)")
                    .addBooleanOption(
                        new SlashCommandBooleanOption()
                            .setName("setting")
                            .setDescription("Detailed scorebaord (true). Basic scoreboard (false)")
                            .setRequired(true)
                    )
            ),
        new SlashCommandBuilder()
            .setName("execute")
            .setDescription("Execute a command on the MC server")
            .setDefaultMemberPermissions(null)
            .setDMPermission(false)
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("command")
                    .setDescription("The Minecraft command to execute")
                    .setRequired(true)
            )
    ]

    constructor(client: Client) {
        super(client);

        client.channels.fetch(MC_CHAT_CHANNEL)
            .then(_channel => {
                let channel = _channel as TextChannel
                setInterval(async () => {
                    ServerConnection.requestPlayerList()
                    setTimeout(() => {
                        updateScoreboard()
                    }, 10000)
                }, 10000)

                ServerConnection.on("message", async (message: string, player: any) => {
                    SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
                    ])
                        .then(res => {
                            if (res.recordset.length === 0) {
                                let me = channel.guild.members.me
                                if (me) sendImpersonateMessage(channel, me, message)
                            }
                            else {
                                if (message.includes("@")) {
                                    ServerConnection.broadcastCommand(`tellraw ${player.username} ["",{"text":"[Crash Bot - Messaging System] ","bold":true,"color":"dark_red"},{"text":"To prevent ping spam, the '@' symbol is prohibited.'","color":"white"}]`)
                                }

                                channel.guild.members.fetch(res.recordset[0].discord_id).then(member => {
                                    sendImpersonateMessage(channel, member, message.replaceAll("@", ""))
                                })
                            }
                        })
                })

                ServerConnection.on("playerConnect", async (player) => {
                    if (!player.username) return

                    let data = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                    ])
                    SafeQuery(`UPDATE dbo.Users
                           SET mc_connected = 1
                           WHERE mc_id = @mcid`, [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                    ])

                    if (data.recordset.length === 0) {
                        let embed = new EmbedBuilder()
                        embed.setAuthor({
                            name: `${player.username} joined the game`,
                            iconURL: "http://canada1.national.edu/wp-content/uploads/2018/05/iStock-504858574.jpg"
                        })

                        let row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId("link_minecraft_" + player.id)
                                    .setLabel("This is me. Link my account.")
                                    .setStyle(ButtonStyle.Secondary)
                            )

                        channel.send({content: ' ', embeds: [embed], components: [row]})
                    }
                    else {
                        let member = await channel.guild.members.fetch(data.recordset[0].discord_id)

                        let embed = new EmbedBuilder()
                        embed.setAuthor({
                            name: `${player.username} joined the game`,
                            iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                        })
                        embed.setDescription(`<@${data.recordset[0].discord_id}>`)
                        channel.send({content: ' ', embeds: [embed]})
                    }
                    updateScoreboard()
                })

                ServerConnection.on("playerDisconnect", async player => {
                    let data = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                    ])
                    SafeQuery(`UPDATE dbo.Users
                           SET mc_connected = 0
                           WHERE mc_id = @mcid`, [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                    ])

                    if (data.recordset.length === 0) {
                        let embed = new EmbedBuilder()
                        embed.setAuthor({
                            name: `${player.username} left the game`,
                            iconURL: "http://canada1.national.edu/wp-content/uploads/2018/05/iStock-504858574.jpg"
                        })

                        let row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId("link_minecraft_" + player.id)
                                    .setLabel("This is me. Link my account.")
                                    .setStyle(ButtonStyle.Secondary)
                            )

                        channel.send({content: ' ', embeds: [embed], components: [row]})
                    }
                    else {
                        let member = await channel.guild.members.fetch(data.recordset[0].discord_id)

                        let embed = new EmbedBuilder()
                        embed.setAuthor({
                            name: `${player.username} left the game`,
                            iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                        })
                        embed.setDescription(`<@${data.recordset[0].discord_id}>`)
                        channel.send({content: ' ', embeds: [embed]})
                    }
                    await updateScoreboard()
                })

                ServerConnection.on("playerDataUpdate", async player => {
                    await SafeQuery(`UPDATE dbo.Users
                                 SET mc_x   = @mcx,
                                     mc_y   = @mcy,
                                     mc_z   = @mcz,
                                     mc_dim = @mcdim
                                 WHERE mc_id = @mcid`, [
                        {name: "mcx", type: mssql.TYPES.BigInt(), data: player.position[0]},
                        {name: "mcy", type: mssql.TYPES.BigInt(), data: player.position[1]},
                        {name: "mcz", type: mssql.TYPES.BigInt(), data: player.position[2]},
                        {name: "mcdim", type: mssql.TYPES.VarChar(100), data: player.dimension},
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
                    ])
                    await updateScoreboard()

                    // Check for territory invasions
                    SafeQuery(`SELECT *
                           FROM dbo.MCTerritories
                           WHERE ${player.position[0]} >= sx
                             AND ${player.position[1]} >= sy
                             AND ${player.position[2]} >= sz
                             AND ${player.position[0]} <= ex
                             AND ${player.position[1]} <= ey
                             AND ${player.position[2]} <= ez
                             AND dimension = '${player.dimension}'`, []).then(async res => {
                        if (res.recordset.length === 0) {
                            await SafeQuery(`UPDATE dbo.MCTerritoriesLog
                                         SET active = 0
                                         WHERE mc_id = '${player.id}'`, [])
                        }
                        else for (let territory of res.recordset) {
                            let res = await SafeQuery("SELECT * FROM dbo.MCTerritoriesLog WHERE territory_id = @tid AND mc_id = @mcid AND active = 1", [
                                {name: "tid", type: mssql.TYPES.Int(), data: territory.id},
                                {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                            ])

                            if (await res.recordset.length === 0) {
                                // Check if the player is whitelisted/blacklisted
                                let whitelist_entries = await SafeQuery(`SELECT *
                                                                     FROM dbo.MCTerritoriesWhitelist
                                                                     WHERE player_id = '${player.id}'
                                                                       AND territory_id = ${territory.id}`, [])
                                if (
                                    (whitelist_entries.recordset.length !== 0 && !territory.blacklist_mode) ||
                                    whitelist_entries.recordset.length === 0 && territory.blacklist_mode
                                ) continue

                                await SafeQuery(`INSERT INTO dbo.MCTerritoriesLog (territory_id, mc_id, x, y, z)
                                             VALUES (${territory.id}, '${player.id}', ${player.position[0]},
                                                     ${player.position[1]}, ${player.position[2]});`, [])
                                let owner = await client.users.fetch(territory.owner_id)
                                owner.send(`${player.username} has entered your territory: ${territory.name} (${player.position[0], player.position[1], player.position[2]})`)
                                if (!territory.kill) {
                                    ServerConnection.broadcastCommand(`tellraw ${player.username} ["",{"text":"[Crash Bot - Territories] ","bold":true,"color":"dark_red"},{"text":"You have entered '","color":"white"},{"text":"${territory.name}","bold":true,"color":"white"},{"text":"'. The owner of this territory has indicated that this area is strictly private, and may receive an alert about your presence.","color":"white"}]`)
                                }
                                else {
                                    ServerConnection.broadcastCommand(`tellraw ${player.username} ["",{"text":"[Crash Bot - Territories]","bold":true,"color":"dark_red"},{"text":" You have entered a territory ('"},{"text":"${territory.name}","bold":true},{"text":"') which you are not permitted to be in. Please leave the area within 10 seconds."}]`)
                                }
                            }
                            else if (territory.kill) {
                                // Teleport the invading player
                                ServerConnection.broadcastCommand(`tellraw @a ["",{"text":"[Crash Bot - Territories]","bold":true,"color":"dark_red"},{"text":" ${player.username} has been buried for invading a territory. Please do not invade territories."}]`)
                                let owner = await client.users.fetch(territory.owner_id)

                                ServerConnection.broadcastCommand(`tp ${player.username} ${player.position[0]} -50 ${player.position[2]}`)
                                owner.send(`${player.username} has been buried due to territory invasion.`)
                            }
                        }
                    })
                })

                ServerConnection.on("playerAdvancementEarn", async (advancement, player) => {
                    let data = await SafeQuery("SELECT * FROM dbo.Users WHERE mc_id = @mcid", [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                    ])
                    SafeQuery(`UPDATE dbo.Users
                           SET mc_connected = 0
                           WHERE mc_id = @mcid`, [
                        {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id}
                    ])

                    if (!advancement.display.title) return

                    if (data.recordset.length === 0) {
                        let embed = new EmbedBuilder()
                        embed.setAuthor({
                            name: `${player.username} just earned [${advancement.display.title}]`,
                            iconURL: "http://canada1.national.edu/wp-content/uploads/2018/05/iStock-504858574.jpg"
                        })

                        let row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId("link_minecraft_" + player.id)
                                    .setLabel("This is me. Link my account.")
                                    .setStyle(ButtonStyle.Secondary)
                            )

                        channel.send({content: ' ', embeds: [embed], components: [row]})
                    }
                    else {
                        let member = await channel.guild.members.fetch(data.recordset[0].discord_id)

                        let embed = new EmbedBuilder()
                        embed.setAuthor({
                            name: `${player.username} just earned [${advancement.display.title}]`,
                            iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
                        })
                        embed.setDescription(`<@${data.recordset[0].discord_id}>`)
                        channel.send({content: ' ', embeds: [embed]})
                    }
                })

                ServerConnection.on("playerDeath", (player) => {
                    channel.send(player.username + " died (rip)")
                })
            })
    }

    @OnClientEvent("messageCreate")
    onDiscordMessage(msg: Message) {
        // if (msg.channel.id === MC_CHAT_CHANNEL && msg.author.bot === false) {
        //     let content: any[] = ["", {
        //         text: "["
        //     }, {
        //         text: msg.member?.user.username || "Unknown user",
        //         color: msg.member?.displayHexColor || "#fff"
        //     }, {
        //         text: "] (via Discord) " + msg.content
        //     }]
        //     if (msg.attachments.size > 0) {
        //         for (let attachment of msg.attachments) {
        //             content.push({
        //                 text: " - " + attachment[1].name,
        //                 color: "blue",
        //                 clickEvent: {
        //                     action: "open_url",
        //                     value: attachment[1].url
        //                 }
        //             })
        //             attachment[1].name
        //         }
        //     }
        //     // mcServer.sendCommand("tellraw @a " + JSON.stringify(content))
        // }

        if (msg.channel.id === MC_CHAT_CHANNEL && !msg.author.bot) {
            let guild = msg.guild as Guild
            if (!guild) throw "Unknown Guild"
            let message = msg.content
                .replace(/<@!(\d+)>/, (match: string, userId: string): string => {
                    const member = guild.members.cache.get(userId)
                    if (member) {
                        return member.nickname || member.user.username
                    }
                    else {
                        return match
                    }
                })
                .replace(/<@(\d+)>/, (match, userId) => {
                    const member = guild.members.cache.get(userId)
                    if (member) {
                        return member.user.username
                    }
                    else {
                        return match
                    }
                })
                .replace(/<@&(\d+)>/, (match, roleId) => {
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
            RemoteStatusServer.broadcastCommand(`tellraw @a ["",{"text":"[${msg.member?.nickname || msg.member?.user.username} via Discord]","color":"${msg.member?.displayHexColor}"},{"text":" ${message}"}]`)
        }
    }

    @InteractionChatCommandResponse("minecraft")
    async onMinecraftCommand(interaction: ChatInputCommandInteraction) {
        // Used to manage experimental features
        let com = interaction.options.getSubcommand()
        if (com === "share_location") {
            console.log("Getting user coordinates..")

            // Ensure that the user is in the database
            let user = await getUserData(interaction.member as GuildMember)

            if (!user.mc_id) {
                interaction.reply("You haven't linked your Minecraft account yet. You must do this first.")
                return
            }
            if (user.mc_connected) {
                await ServerConnection.requestPlayerList()
                user = await getUserData(interaction.member as GuildMember)
            }

            let member = interaction.member as GuildMember
            member = await member.fetch()
            // @ts-ignore
            let player = RemoteStatusServer.connections["pczWlxfMzPmuI6yjQMaQYA=="].getPlayer(user.mc_id)

            let embed = new EmbedBuilder()
            embed.setAuthor({
                name: `${member.user.username} (${player?.username || "not connected"})`,
                iconURL: member.avatarURL({size: 32}) || member.user.avatarURL({size: 32}) || ""
            })
            if (player) embed.setDescription(`Currently exploring \`${user.mc_dim}\` at \`X${user.mc_x} Y${user.mc_y} Z${user.mc_z}\``)
            else embed.setDescription(`Last seen in \`${user.mc_dim}\` at \`X${user.mc_x} Y${user.mc_y} Z${user.mc_z}\``)
            interaction.reply({content: ' ', embeds: [embed]})
        }
        else if (com === "detailed_scoreboard") {
            let bool = interaction.options.getBoolean("setting")
            // Get the user's key
            let user = await getUserData(interaction.member as GuildMember)
            let req = await SafeQuery(`UPDATE CrashBot.dbo.Users
                                           SET mc_detailed_scoreboard = ${bool ? 1 : 0}
                                           WHERE discord_id = @discordid`, [{
                name: "discordid", type: mssql.TYPES.VarChar(20), data: interaction.user.id
            }])

            updateScoreboard()
            interaction.reply({
                content: "Set `detailed scoreboard` to: `" + (bool ? "true" : "false") + "`.",
                ephemeral: true
            })
        }
    }

    @InteractionButtonResponse((id) => id.startsWith("link_minecraft_"))
    async onMinecraftAccountLinkButtonPress(interaction: ButtonInteraction) {
        let player_id = interaction.customId.replace("link_minecraft_", "")
        // @ts-ignore
        let player = RemoteStatusServer.connections["pczWlxfMzPmuI6yjQMaQYA=="].getPlayer(player_id)

        if (!player) {
            interaction.reply({
                content: "Could not find that player. The player must be connected to the Minecraft Server.",
                ephemeral: true
            })
            return
        }
        let res = await SafeQuery("SELECT * FROM CrashBot.dbo.users WHERE mc_id = @mcid", [
            {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
        ])
        if (res.recordset.length > 0) {
            interaction.reply({
                content: `This account was already linked to <@${res.recordset[0].discord_id}>. If this is incorrect, please contact <@404507305510699019>.`,
                ephemeral: true
            })
            return
        }
        await SafeQuery("UPDATE CrashBot.dbo.Users SET mc_id = @mcid WHERE discord_id = @discordid", [
            {name: "mcid", type: mssql.TYPES.VarChar(100), data: player.id},
            {name: "discordid", type: mssql.TYPES.VarChar(100), data: (interaction.member as GuildMember).id}
        ])

        interaction.reply({content: "Successfully linked!", ephemeral: true})
    }

    @InteractionChatCommandResponse("execute")
    async onExecuteCommand(interaction: ChatInputCommandInteraction) {
        if (interaction.guildId !== "892518158727008297") {
            interaction.reply({content: "Sorry but this command cannot be accessed from this Guild/Discord Server", ephemeral: true})
            return
        }

        let command = interaction.options.getString("command") || ""
        ServerConnection.broadcastCommand(command)
        interaction.reply({content: "Command executed", ephemeral: true})
    }
}