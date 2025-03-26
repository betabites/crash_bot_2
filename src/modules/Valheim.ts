import {BaseModule, InteractionChatCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {ChatInputCommandInteraction, EmbedBuilder} from "discord.js";
import {Logging} from '@google-cloud/logging';
import {GetEntriesRequest} from "@google-cloud/logging/build/src/log.js";
import SafeQuery, {sql} from "../services/SQL.js";

export class Valheim extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("valheim")
            .setDescription("View Valheim server information")
            .addSubcommand(subcommand => subcommand
                .setName("activity")
                .setDescription("View the server's activity for the last 30 days")
            )
            .setDefaultMemberPermissions(null)
    ]

    @InteractionChatCommandResponse("valheim")
    async onValheimCommand(interaction: ChatInputCommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case "activity":
                await interaction.deferReply({ephemeral: true})
                let timeMap = new Map<string, {
                    isActive: boolean,
                    milliseconds: number,
                    lastLogin: number,
                }>()
                let idToName = new Map<string, string>()
                const endTime = new Date();
                const startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago

                const abandonedMessage = /^.*?(?<date>\d{2}\/\d{2}\/\d{4})\s+(?<time>\d{2}:\d{2}:\d{2}):\s+(?<message>Destroying abandoned non persistent zdo)\s+(?<ownerId>\d+):(?<subId>\d+)\s+owner\s+(?<ownerId2>\d+)/
                const connectMessage = /^.*?(?<date>\d{2}\/\d{2}\/\d{4})\s+(?<time>\d{2}:\d{2}:\d{2}):\s+Got character ZDOID from\s+(?<playerName>.*?)\s+:\s+(?<zdoId>\d+):(?<instanceId>\d+)/
                let userData = await SafeQuery<{valheim_name: string}>(sql`SELECT valheim_name FROM dbo.Users WHERE discord_id = ${interaction.user.id}`)
                if (!userData.recordset[0]?.valheim_name) {
                    void interaction.editReply({content: "It appears this command hasn't been correctly configured for you yet. Please contact @Beta."})
                    return
                }

                for await (const entry of getEntries({
                    filter: `(timestamp >= "${startTime.toISOString()}" AND timestamp <= "${endTime.toISOString()}") AND labels."agent.googleapis.com/log_file_path"=~"^/var/lib/docker/containers.*" AND (SEARCH("Destroying abandoned non persistent") OR SEARCH("Got character ZDOID from") OR SEARCH("connection"))`,
                    orderBy: 'timestamp asc',
                })) {
                    if (!entry.metadata.timestamp) continue;

                    console.log(JSON.stringify(entry.data.message))

                    let abandonedMatch = abandonedMessage.exec(entry.data.message)
                    let connectMatch = connectMessage.exec(entry.data.message)

                    if (abandonedMatch) {
                        console.log("Abandoned match")
                        let username = idToName.get(abandonedMatch.groups?.ownerId ?? "")
                        let timeMapItem = timeMap.get(username ?? "")
                        if (!username || !timeMapItem || !timeMapItem.isActive) continue;
                        timeMapItem.milliseconds += new Date(entry.metadata.timestamp as string | number).getTime() - timeMapItem.lastLogin
                        timeMapItem.isActive = false
                        timeMap.set(username, timeMapItem)
                        idToName.delete(abandonedMatch.groups?.ownerId ?? "")
                    }
                    else if (connectMatch && connectMatch.groups?.zdoId && connectMatch.groups?.zdoId.length >= 5) {
                        console.log("Connect match")
                        let timeMapItem = timeMap.get(connectMatch.groups?.zdoId ?? "")
                        let username = connectMatch.groups?.playerName ?? ""
                        if (!timeMapItem) {
                            console.log("New login")
                            timeMapItem = {
                                isActive: true,
                                milliseconds: 0,
                                lastLogin: new Date(entry.metadata.timestamp as string | number).getTime(),
                            }
                            timeMap.set(username, timeMapItem)
                            idToName.set(connectMatch.groups?.zdoId ?? "", username)
                            continue
                        }
                        if (timeMapItem.isActive) {
                            console.log("Active login")
                            continue;
                        }
                        console.log("Re-activating login")
                        timeMapItem.lastLogin = new Date(entry.metadata.timestamp as string | number).getTime()
                        timeMapItem.isActive = true

                        timeMap.set(username, timeMapItem)
                        idToName.set(connectMatch.groups?.zdoId ?? "", username)
                    }
                    else {console.log("No match")}
                }
                console.log(timeMap)
                let embed = new EmbedBuilder()
                    .setTitle("Valheim Server Activity")
                    .setDescription("This may not be entirely accurate, but it's the best I can do for now. If you see any issues, please let me know.")

                const f = (digit: number) => {
                    return digit < 10 ? `0${digit}` : `${digit}`
                }

                for (let [key, value] of timeMap) {
                    let lastLogin = new Date(value.lastLogin)
                    if (value.isActive) {value.milliseconds += Date.now() - value.lastLogin}
                    let seconds = Math.round(value.milliseconds / 1000)
                    let minutes = 0
                    let hours = 0
                    while (seconds >= 3600) {hours++; seconds -= 3600}
                    while (seconds >= 60) {minutes++; seconds -= 60}

                    if (
                        key !== userData.recordset[0]?.valheim_name
                        && interaction.user.id !== "404507305510699019"
                        && interaction.user.id !== "393955339550064641"
                    ) continue

                    embed.addFields([{
                        name: `${value.isActive ? '🟢' : '🔴'} ${key}`,
                        value: `Last login <t:${Math.round(lastLogin.getTime() / 1000)}:R>
Total time online: \`${f(hours)}:${f(minutes)}:${f(seconds)}\``,
                        inline: true
                    }])
                }

                interaction.editReply({content: ' ', embeds: [embed]})

        }
    }
}

async function* getEntries(query?: Omit<GetEntriesRequest, "pageSize" | "pageToken">) {
    const logging = new Logging();
    let nextPageToken: null | string = null;
    const baseQuery: GetEntriesRequest = {...(query ?? {}), pageSize: 50}

    while (true) {
        console.log(baseQuery)
        let [iterator, req, response] = await logging.getEntries(baseQuery);
        for (let entry of iterator) {
            yield entry;
        }

        if (!response.nextPageToken) break;
        baseQuery.pageToken = response.nextPageToken;
    }
}
