import {BaseModule, InteractionChatCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {ChatInputCommandInteraction, Client, EmbedBuilder} from "discord.js";
import {Logging} from '@google-cloud/logging';
import type {GetEntriesRequest} from "@google-cloud/logging/build/src/log.js";
import SafeQuery, {contextSQL, SafeTransaction, sql} from "../../services/SQL.js";
import protos from "google-proto-files"
import {PubSub} from '@google-cloud/pubsub';
import {readFile} from "node:fs/promises"
import {BigQuery, BigQueryDate} from '@google-cloud/bigquery';
import console from "node:console";
import {grantPointsWithDMResponse} from "./points/grantPointsWithDMResponse.js";
import {User} from "server_src/models/User.js";

// Create a PubSub client
const pubsub = new PubSub();

const topicName = 'pterodactyl-connection-history-measure '
const subscriptionName = 'crashbot-connection-history-subscription'

export class Valheim extends BaseModule {
    constructor(client: Client) {
        super(client);
        this.#configurePubSubListener()
        // void this.calculateHistoricalPoints()

        setInterval(async () => {
            // Award 1 point to all connected users every 20 minutes
            let discord_ids = await contextSQL<{ user_id: string }>`
                SELECT user_id
                FROM dbo.ValheimConnectionHistory history
                WHERE history.sessionEnd IS NULL
            `
            for (let user of discord_ids.recordset) {
                await grantPointsWithDMResponse({
                    discordClient: client,
                    user: new User(user.user_id),
                    reason: "Valheim",
                    points: 1,
                    capped: true,
                })
            }
        }, 1.2e+6)
        setInterval(async () => {
            // Award points every 5 minutes if 3+ players are connected
            let discord_ids = await contextSQL<{ user_id: string }>`
                SELECT user_id
                FROM dbo.ValheimConnectionHistory history
                WHERE history.sessionEnd IS NULL
            `
            if (discord_ids.recordset.length < 3) return

            for (let user of discord_ids.recordset) {
                await grantPointsWithDMResponse({
                    discordClient: client,
                    user: new User(user.user_id),
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
        let entries = JSON.parse(await readFile("/opt/crash_bot/src/modules/ValheimLogs.json", "utf-8"))

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

    // Runs when a new connection is made to the server
    static async getUserFromValheimName(valheim_name: string): Promise<User | null> {
        const user_search = await contextSQL<{discord_id: string}>`SELECT id FROM Users WHERE valheim_name=${valheim_name}`
        const user = user_search.recordset[0]
        return user ? new User(user.discord_id) : null
    }
    async #submitNewConnection(timestamp: Date, zdoId: string, username: string) {
        // console.log("STARTING SESSION", zdoId, " ", timestamp, "")
        // Get the user
        const user = await Valheim.getUserFromValheimName(username)

        // First, check to see if a connection is already active
        let res = await contextSQL`UPDATE dbo.ValheimConnectionHistory SET sessionStart = ${timestamp}, user_id = ${user?.discord_id ?? null} WHERE ZDO_ID = ${zdoId} AND sessionStart IS NULL`
        if (!!res.rowsAffected[0]) return
        res = await contextSQL`SELECT * FROM dbo.ValheimConnectionHistory WHERE ZDO_ID = ${zdoId} AND sessionStart IS NOT NULL AND sessionEnd IS NULL`
        if (!!res.recordset[0]) return

        await contextSQL`INSERT INTO dbo.ValheimConnectionHistory (id, ZDO_ID, sessionStart, user_id)
                            VALUES (NEWID(), ${zdoId}, ${timestamp}, ${user?.discord_id ?? null})`
    }

    async #submitNewDisconnection(timestamp: Date, zdoId: string) {
        // First, check to see if a connection is already active
        // console.log("ENDING SESSION", zdoId, " ", timestamp, "")
        let res = await contextSQL<{ sessionEnd: Date, id: string }>`SELECT sessionEnd, id FROM dbo.ValheimConnectionHistory WHERE ZDO_ID = ${zdoId}`
        if (!res.recordset[0]) {
            await contextSQL`INSERT INTO dbo.ValheimConnectionHistory (id, ZDO_ID, sessionEnd)
                                VALUES (NEWID(), ${zdoId}, ${timestamp})`
            return
        }

        let currentSession = res.recordset.find(x => x.sessionEnd === null)
        if (currentSession) await contextSQL`UPDATE dbo.ValheimConnectionHistory SET sessionEnd = ${timestamp} WHERE id = ${currentSession.id}`
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
