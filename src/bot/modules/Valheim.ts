import {BaseModule, InteractionChatCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {ChatInputCommandInteraction, Client, EmbedBuilder} from "discord.js";
import {Logging} from '@google-cloud/logging';
import type {GetEntriesRequest} from "@google-cloud/logging/build/src/log.js";
import SafeQuery, {SafeTransaction, sql} from "../../services/SQL.js";
import protos from "google-proto-files"
import {PubSub} from '@google-cloud/pubsub';
import {readFile} from "node:fs/promises"
import {BigQuery, BigQueryDate} from '@google-cloud/bigquery';
import console from "node:console";
import {PointsModule} from "./Points.js";

// Create a PubSub client
const pubsub = new PubSub();

const topicName = 'pterodactyl-connection-history-measure '
const subscriptionName = 'crashbot-connection-history-subscription'

export class Valheim extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("valheim")
            .setDescription("View Valheim server information")
            .addSubcommand(subcommand => subcommand
                .setName("activity")
                .setDescription("View the server's activity for the last 30 days")
                .addStringOption(s => s.setName("username").setDescription("The username of the player to view").setRequired(false))
                .addBooleanOption(s => s.setName("show_shares").setDescription("Shows how the user's stats compare against others").setRequired(false))
            )
            .setDefaultMemberPermissions(null)
    ]

    constructor(client: Client) {
        super(client);
        this.#configurePubSubListener()
        // void this.calculateHistoricalPoints()

        setInterval(async () => {
            // Award 1 point to all connected users every 20 minutes
            let discord_ids = await SafeQuery<{ discord_id: string }>(sql`
                SELECT users.discord_id AS 'discord_id'
                FROM dbo.ValheimConnectionHistory history
                JOIN dbo.Users users ON history.username = users.valheim_name
                WHERE history.sessionEnd IS NULL
            `)
            for (let user of discord_ids.recordset) {
                await PointsModule.grantPointsWithDMResponse({
                    discordClient: client,
                    userDiscordId: user.discord_id,
                    reason: "Valheim",
                    points: 1,
                    capped: true,
                })
            }
        }, 1.2e+6)
        setInterval(async () => {
            // Award points every 5 minutes if 3+ players are connected
            let discord_ids = await SafeQuery<{ discord_id: string }>(sql`
                SELECT users.discord_id AS 'discord_id'
                FROM dbo.ValheimConnectionHistory history
                JOIN dbo.Users users ON history.username = users.valheim_name
                WHERE history.sessionEnd IS NULL
            `)
            if (discord_ids.recordset.length < 3) return

            for (let user of discord_ids.recordset) {
                await PointsModule.grantPointsWithDMResponse({
                    discordClient: client,
                    userDiscordId: user.discord_id,
                    reason: "Valheim (group)",
                    points: discord_ids.recordset.length - 2,
                    capped: true,
                })
            }
        }, 300000)


        // this.#importOldSessionData()
    }

    #currentSynchronousTask: Promise<void> | null = null
    #synchronousTaskQueue: (() => Promise<void> | void)[] = []

    #performSynchronousTask(func: () => void | Promise<void>) {
        this.#synchronousTaskQueue.push(func)
        if (this.#currentSynchronousTask) return this.#currentSynchronousTask
        this.#currentSynchronousTask = new Promise(async resolve => {
            while (true) {
                let func = this.#synchronousTaskQueue.splice(0, 1)[0]
                if (!func) break
                try {
                    await func()
                } catch (e) {
                    console.error(e)
                }
            }
            this.#currentSynchronousTask = null
            resolve()
        })
    }

    #configurePubSubListener() {
        const subscription = pubsub.subscription(subscriptionName);

        const abandonedMessage = /(?<message>Destroying abandoned non persistent zdo)\s+(?<ownerId>\d+):(?<subId>\d+)\s+owner\s+(?<ownerId2>\d+)/
        const connectMessage = /Got character ZDOID from\s+(?<playerName>.*?)\s+:\s+(?<zdoId>\d+):(?<instanceId>\d+)/

        subscription.on('message', async (message) => {
            let data: {
                insertId: string,
                jsonPayload?: { message: string },
                labels: {},
                logName: string,
                receiveTimestamp: string,
                timestamp: string,
                protoPayload?: { methodName: string },
                // Does not include *all* of the message properties. Just enough for TypeScript.
            } = JSON.parse(message.data.toString())

            if (data.jsonPayload) {
                let abandonedMatch = abandonedMessage.exec(data.jsonPayload.message)
                let connectMatch = connectMessage.exec(data.jsonPayload.message)

                if (abandonedMatch) {
                    let ownerId = abandonedMatch.groups?.ownerId ?? ""
                    void this.#performSynchronousTask(async () => {
                        await this.#submitNewDisconnection(new Date(data.timestamp), ownerId)
                        message.ack()
                    })
                }
                else if (connectMatch) {
                    let zdoId = connectMatch.groups?.zdoId ?? ""
                    let username = connectMatch.groups?.playerName ?? ""
                    if (zdoId === "0") return message.ack()
                    void this.#performSynchronousTask(async () => {
                        await this.#submitNewConnection(new Date(data.timestamp), zdoId, username)
                        message.ack()
                    })
                }
            }
            else if (data.protoPayload?.methodName === "v1.compute.instances.stop") {
                await this.#closeAllOpenConnections(new Date(data.timestamp))
                message.ack()
            }
            else {
                message.ack()
            }
        })

        subscription.on('error', err => {
            console.error(err)
        })
    }

    async #importOldSessionData() {
        let entries = JSON.parse(await readFile("/home/ubscontrol/resource_pack_creator/dist/modules/ValheimLogs.json", "utf-8"))

        let protobuf = await protos.load(protos.getProtoPath("cloud/audit/audit_log.proto"))
        const auditLog = protobuf.lookupType("google.cloud.audit.AuditLog")

        let timeMap = new Map<string, {
            isActive: boolean,
            milliseconds: number,
            lastLogin: number,
        }>()
        let sessions: {
            start: Date,
            end: Date,
            username: string,
            zdoId: string,
        }[] = []
        let activeSessions = new Map<string, {
            start: Date,
            username: string
        }>

        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago

        const timestampedMessage = /^.*?(?<date>\d{2}\/\d{2}\/\d{4})\s+(?<time>\d{2}:\d{2}:\d{2}):\s+(?<message>.*)/
        const abandonedMessage = /(?<message>Destroying abandoned non persistent zdo)\s+(?<ownerId>\d+):(?<subId>\d+)\s+owner\s+(?<ownerId2>\d+)/
        const connectMessage = /Got character ZDOID from\s+(?<playerName>.*?)\s+:\s+(?<zdoId>\d+):(?<instanceId>\d+)/

        let totalMilliseconds = 0
        for await (const entry of entries) {
            if (!entry.timestamp) continue;

            if (entry.jsonPayload) {
                let timestampMatch = timestampedMessage.exec(entry.jsonPayload.message)
                let message = timestampMatch?.groups?.message ?? entry.jsonPayload.message
                if (!message) continue;

                let abandonedMatch = abandonedMessage.exec(message)
                let connectMatch = connectMessage.exec(message)

                if (abandonedMatch) {
                    // console.log("Abandoned match")
                    let zdoId = abandonedMatch.groups?.ownerId
                    if (!zdoId || zdoId === "0") continue;
                    let session = activeSessions.get(zdoId)
                    if (!session) continue;
                    sessions.push({
                        ...session,
                        end: new Date(entry.timestamp as string | number),
                        zdoId
                    })
                    activeSessions.delete(zdoId)
                }
                else if (connectMatch && connectMatch.groups?.zdoId && connectMatch.groups?.zdoId.length >= 5) {
                    // console.log("Connect match")
                    let username = connectMatch.groups?.playerName ?? ""
                    let zdoId = connectMatch.groups?.zdoId
                    if (!zdoId || zdoId === "0" || activeSessions.has(zdoId)) continue;
                    activeSessions.set(zdoId, {start: new Date(entry.timestamp as string | number), username})
                }
            }
            else if (entry.protoPayload) {
                if (entry.protoPayload.methodName === "v1.compute.instances.stop") {
                    // End all active sessions
                    for (let [zdoId, session] of activeSessions) {
                        sessions.push({
                            ...session,
                            end: new Date(entry.timestamp as string | number),
                            zdoId
                        })
                    }
                    activeSessions.clear()
                }
            }
            // else {console.log("No match")}
        }

        for (let session of sessions) {
            await this.#submitNewConnection(session.start, session.zdoId, session.username)
            await this.#submitNewDisconnection(session.end, session.zdoId)
        }
        console.log("SESSION RESULTS", sessions.filter(s => s.start.getDate() === 17))
    }

    async calculateHistoricalPoints() {
        let usersSearch = await SafeQuery<{
            discord_id: string,
            valheim_name: string
        }>(sql`SELECT discord_id, valheim_name
               FROM dbo.Users`)
        let users = new Map<string, { discord_id: string, points: number }>()
        for (let user of usersSearch.recordset) {
            if (!user.valheim_name) continue
            users.set(user.valheim_name, {discord_id: user.discord_id, points: 0 })
        }

        let history = await SafeQuery<{ username: string, sessionStart?: Date, sessionEnd?: Date }>(
            sql`SELECT username, sessionStart, sessionEnd
                FROM dbo.ValheimConnectionHistory
                ORDER BY sessionStart`
        )
        let switches: { username: string, isEnd: boolean, date: Date }[] = []
        // Calculate switches
        for (let item of history.recordset) {
            if (!item.sessionStart || !item.sessionEnd) continue
            switches.push({
                username: item.username,
                isEnd: false,
                date: item.sessionStart
            })
            switches.push({
                username: item.username,
                isEnd: true,
                date: item.sessionEnd
            })
        }
        // Sort switches
        switches = switches.sort((a, b) => a.date.getTime() - b.date.getTime())

        // Calculate points
        let lastDate = switches[0].date
        let activeUsers = new Set<string>()
        for (let switchItem of switches) {
            // Award points to active users
            if (activeUsers.size >= 3) {
                for (let activeUser of activeUsers) {
                    let user = users.get(activeUser)
                    if (!user) continue
                    console.log("MULTIPLYING", activeUsers.size - 2)
                    let multiplier = activeUsers.size >= 3 ? (activeUsers.size - 2) : .25
                    user.points += Math.floor(Math.floor((switchItem.date.getTime() - lastDate.getTime()) / 300000) * multiplier)
                    users.set(activeUser, user)
                }
            }
            if (switchItem.isEnd) activeUsers.delete(switchItem.username)
            else activeUsers.add(switchItem.username)

            lastDate = switchItem.date
        }

        // grant points
        // await Promise.allSettled([...users].map(async ([username, user]) => {
        //     if (!user.points || user.points <= 0) return
        //     await PointsModule.grantPointsWithDMResponse({
        //         discordClient: this.client,
        //         points: user.points,
        //         reason: "Valheim (retroactive)",
        //         userDiscordId: user.discord_id,
        //     })
        // }))
        console.log("USERS", JSON.stringify([...users]))
    }

    @InteractionChatCommandResponse("valheim")
    async onValheimCommand(interaction: ChatInputCommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case "activity":
                await interaction.deferReply({ephemeral: true})
                // Get billing data
                const bigquery = new BigQuery();
                const [rows] = await bigquery.query(`SELECT DATE(usage_end_time, "UTC") as usage_date,
                                                            SUM(cost)                   as cost
                                                     FROM \`re-flesh.usage_costs.gcp_billing_export_v1_0176BB_97AC5E_923E49\`
                                                     GROUP BY DATE (usage_end_time, "UTC")`);

                // Get session data
                let userData = await SafeQuery<{ valheim_name: string }>(sql`SELECT valheim_name
                                                                             FROM dbo.Users
                                                                             WHERE discord_id = ${interaction.user.id}`)
                if (!userData.recordset[0]?.valheim_name) {
                    void interaction.editReply({content: "It appears this command hasn't been correctly configured for you yet. Please contact @Beta."})
                    return
                }
                let username = userData.recordset[0]?.valheim_name
                if (interaction.options.getString("username")) {
                    if (!["393955339550064641", "404507305510699019"].includes(interaction.user.id)) {
                        interaction.editReply({content: "You aren't authorised to view the activity of other players"})
                        return
                    }
                    username = interaction.options.getString("username", true)
                }
                let showShares = false
                if (interaction.options.getBoolean("show_shares", false) !== null) {
                    if (!["393955339550064641", "404507305510699019"].includes(interaction.user.id)) {
                        interaction.editReply({content: "You aren't authorised to view the shared activity of other players"})
                        return
                    }
                    showShares = true
                }

                let beginningOfMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1))
                let beginningOfNextMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth() + 1, 1))
                let currentMonthHistory = await SafeQuery<{ sessionStart: Date, sessionEnd: Date, username: string }>(
                    sql`SELECT sessionEnd,
                               username,
                               sessionStart
                        FROM dbo.ValheimConnectionHistory
                        WHERE sessionEnd IS NOT NULL
                          AND sessionStart IS NOT NULL
                          AND sessionEnd >= ${beginningOfMonth}
                          AND sessionEnd < ${beginningOfNextMonth}
                          AND username = ${username}`
                )
                let totalHistoryData = await SafeQuery<{ sessionEnd: Date, sessionStart: Date, username: string }>(
                    sql`SELECT sessionEnd,
                               username,
                               sessionStart
                        FROM dbo.ValheimConnectionHistory
                        WHERE sessionEnd IS NOT NULL
                          AND sessionStart IS NOT NULL
                          AND sessionEnd >= ${beginningOfMonth}
                          AND sessionEnd < ${beginningOfNextMonth}
                `)
                let sessionPlaytimeAverage = await SafeQuery<{ median: number }>(sql`WITH UserMedians AS (
                    SELECT
                        username,
                        PERCENTILE_CONT(0.5)
                                        WITHIN GROUP (ORDER BY DATEDIFF(millisecond, sessionStart, sessionEnd))
                                        OVER (PARTITION BY username) as median
                    FROM ValheimConnectionHistory
                    WHERE sessionEnd IS NOT NULL
                )
                                                                                      SELECT DISTINCT username, median
                                                                                      FROM UserMedians
                                                                                      WHERE username = ${username}`)

                let embeds: EmbedBuilder[] = []

                let totalSpend = 0

                let usernameToDateAndDuration = sessionsToDurationMap(totalHistoryData.recordset, beginningOfMonth)
                let dateToDuration = usernameToDateAndDuration.get(username) ?? new Map()
                let sessionEmbeds: {date: Date, embed: EmbedBuilder}[] = []

                for (let [dateString, sessionDuration] of dateToDuration) {

                    let totalForThisDay = 0
                    let shares = new Map<string, number>()
                    for (let [username, dateToDuration] of usernameToDateAndDuration) {
                        let duration = dateToDuration.get(dateString)
                        if (!duration) continue
                        totalForThisDay += duration
                        shares.set(username, duration)
                    }
                    if (!totalForThisDay) throw new Error("No total for this day")
                    let percentage = sessionDuration / totalForThisDay
                    let todaysSpendature = rows.find(x =>
                        (x.usage_date as BigQueryDate).value === dateString
                    )
                    if (todaysSpendature) totalSpend += todaysSpendature.cost * percentage

                    // Only include embeds for the last 6 sessions/days
                    if (showShares) {
                        if (!todaysSpendature) {
                            sessionEmbeds.push({
                                date: new Date(dateString),
                                embed: new EmbedBuilder()
                                    .setDescription(
                                        `\`${dateString}\` - You were online for \`${toTimeDifferenceString(sessionDuration)}\`\n` +
                                        [...shares].map(([username, duration]) => `- \`${toTimeDifferenceString(duration)}\` - ${username} - ${Math.round((duration / totalForThisDay) * 100)}%`).join(`\n`)
                                    )
                            })
                            continue;
                        }

                        sessionEmbeds.push({
                            date: new Date(dateString),
                            embed: new EmbedBuilder()
                                .setDescription(`\`${dateString}\` - You were online for \`${toTimeDifferenceString(sessionDuration)}\` - $${
                                    Math.round((todaysSpendature.cost * percentage) * 100) / 100
                                } (%${Math.round(percentage * 100)} of $${Math.round(todaysSpendature.cost * 100) / 100})\n` +
                                    [...shares].map(([username, duration]) => `- \`${toTimeDifferenceString(duration)}\` - ${username} - ${Math.round((duration / totalForThisDay) * 100)}%`).join(`\n`))

                        })
                    } else {
                        if (!todaysSpendature) {
                            sessionEmbeds.push({
                                date: new Date(dateString),
                                embed: new EmbedBuilder()
                                    .setDescription(`\`${dateString}\` - You were online for \`${toTimeDifferenceString(sessionDuration)}\``)
                            })
                            continue;
                        }

                        sessionEmbeds.push({
                            date: new Date(dateString),
                            embed: new EmbedBuilder()
                                .setDescription(`\`${dateString}\` - You were online for \`${toTimeDifferenceString(sessionDuration)}\` - $${
                                    Math.round((todaysSpendature.cost * percentage) * 100) / 100
                                } (%${Math.round(percentage * 100)} of $${Math.round(todaysSpendature.cost * 100) / 100})`)

                        })
                    }
                }
                sessionEmbeds = sessionEmbeds.sort((a, b) => b.date.getTime() - a.date.getTime())
                if (sessionEmbeds.length > 6) sessionEmbeds = sessionEmbeds.splice(0, 6)
                embeds.push(...sessionEmbeds.map(i => i.embed))
                embeds.unshift(
                    new EmbedBuilder()
                        .setThumbnail("https://wallpapers.com/images/hd/valheim-stunning-black-forest-cbbzj0pqyrz4pyoa.jpg")
                        .setTitle("Valheim Activity")
                        .setDescription(currentMonthHistory.recordset.length === 0
                            ? "No activity recorded for this month."
                            : `This month, you have logged in ${currentMonthHistory.recordset.length} times.
Total time logged in: \`${toTimeDifferenceString(
                                currentMonthHistory.recordset.reduce((acc, x) => acc + x.sessionEnd.getTime() - x.sessionStart.getTime(), 0)
                            )}\`. $${Math.round(totalSpend * 100) / 100} NZD
Your current average (median) is \`${toTimeDifferenceString(sessionPlaytimeAverage.recordset[0]?.median ?? 0)}\` per session.`)
                        .setFooter({
                            text: "Dates and times shown may be in UTC"
                        })
                )

                void interaction.editReply({embeds})
        }
    }

    // Runs when a new connection is made to the server
    async #submitNewConnection(timestamp: Date, zdoId: string, username: string) {
        // console.log("STARTING SESSION", zdoId, " ", timestamp, "")

        // First, check to see if a connection is already active
        let res = await SafeQuery(
            sql`UPDATE dbo.ValheimConnectionHistory SET sessionStart = ${timestamp} AND username = ${username} WHERE ZDO_ID = ${zdoId} AND sessionStart IS NULL`
        )
        if (!!res.rowsAffected[0]) return

        await SafeQuery(sql`INSERT INTO dbo.ValheimConnectionHistory (id, ZDO_ID, sessionStart, username)
                            VALUES (NEWID(), ${zdoId}, ${timestamp}, ${username})`)
    }

    async #submitNewDisconnection(timestamp: Date, zdoId: string) {
        // First, check to see if a connection is already active
        // console.log("ENDING SESSION", zdoId, " ", timestamp, "")
        let res = await SafeQuery(
            sql`SELECT sessionEnd, id FROM dbo.ValheimConnectionHistory WHERE ZDO_ID = ${zdoId}`
        )
        if (!res.recordset[0]) {
            await SafeQuery(sql`INSERT INTO dbo.ValheimConnectionHistory (id, ZDO_ID, sessionEnd)
                                VALUES (NEWID(), ${zdoId}, ${timestamp})`)
            return
        }

        let currentSession = res.recordset.find(x => x.sessionEnd === null)
        if (currentSession) await SafeQuery(
            sql`UPDATE dbo.ValheimConnectionHistory SET sessionEnd = ${timestamp} WHERE id = ${currentSession.id}`
        )
    }

    async #closeAllOpenConnections(timestamp: Date) {
        await SafeTransaction(async (transaction) => {
            await transaction(sql`UPDATE dbo.ValheimConnectionHistory
                                  SET sessionEnd = ${timestamp}
                                  WHERE sessionEnd IS NULL`)
            await transaction(sql`DELETE
                                  FROM dbo.ValheimConnectionHistory
                                  WHERE sessionStart IS NULL`)
        })
    }
}

async function* getEntries(query?: Omit<GetEntriesRequest, "pageSize" | "pageToken">) {
    const logging = new Logging();
    let nextPageToken: null | string = null;
    const baseQuery: GetEntriesRequest = {...(query ?? {}), pageSize: 50}

    while (true) {
        // console.log(baseQuery)
        let [iterator, req, response] = await logging.getEntries(baseQuery);
        for (let entry of iterator) {
            yield entry;
        }

        if (!response.nextPageToken) break;
        baseQuery.pageToken = response.nextPageToken;
    }
}

function renderTimePart(num: number) {
    return num >= 10 ? num.toString() : "0" + num.toString()
}

function toTimeDifferenceString(milliseconds: number) {
    let hours = 0
    let minutes = 0
    let seconds = 0
    while (milliseconds >= 3600000) {
        hours += 1;
        milliseconds -= 3600000
    }
    while (milliseconds >= 60000) {
        minutes += 1;
        milliseconds -= 60000
    }
    while (milliseconds >= 1000) {
        seconds += 1;
        milliseconds -= 1000
    }
    return `${renderTimePart(hours)}:${renderTimePart(minutes)}:${renderTimePart(seconds)}`
}

function sessionsToDurationMap(sessions: {sessionStart: Date, sessionEnd: Date, username: string}[], ignoreBefore: Date) {
    let usernameMap = new Map<string, Map<string, number>>()
    for (let session of sessions) {
        let dateToDuration = usernameMap.get(session.username) ?? new Map<string, number>()

        if (session.sessionStart.getTime() < ignoreBefore.getTime()) session.sessionStart = ignoreBefore

        let canExit = false
        while (true) {
            let end: Date
            if (session.sessionStart.getTime() > session.sessionEnd.getTime()) throw new Error("Error processing sessions")
            if (session.sessionStart.getDate() === session.sessionEnd.getDate()) {
                end = session.sessionEnd
                canExit = true
            }
            else {
                end = new Date(Date.UTC(
                    session.sessionStart.getFullYear(),
                    session.sessionStart.getMonth(),
                    session.sessionStart.getDate() + 1
                ))
            }
            let dateString = `${session.sessionStart.getFullYear()}-${renderTimePart(session.sessionStart.getMonth() + 1)}-${renderTimePart(session.sessionStart.getDate())}`
            let previousDuration = dateToDuration.get(dateString) ?? 0
            dateToDuration.set(dateString, previousDuration + (end.getTime() - session.sessionStart.getTime()))

            if (canExit) break;
            session.sessionStart = end
            console.log("Repeating for session", session)
        }
        usernameMap.set(session.username, dateToDuration)
    }
    return usernameMap
}
