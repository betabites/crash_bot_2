import {BaseModule, InteractionChatCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {ChatInputCommandInteraction, Client, EmbedBuilder} from "discord.js";
import {Logging} from '@google-cloud/logging';
import {GetEntriesRequest} from "@google-cloud/logging/build/src/log.js";
import SafeQuery, {sql} from "../services/SQL.js";
import protobufjs from "protobufjs"
import protos from "google-proto-files"
import {PubSub} from '@google-cloud/pubsub';

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
            )
            .setDefaultMemberPermissions(null)
    ]

    constructor(client: Client) {
        super(client);
        this.#configurePubSubListener()
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
                jsonPayload: {message: string},
                labels: {},
                logName: string,
                receiveTimestamp: string,
                timestamp: string,
                // Does not include *all* of the message properties. Just enough for TypeScript.
            } = JSON.parse(message.data.toString())
            console.log(data)

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
            else {message.ack()}
        })

        subscription.on('error', err => {
            console.error(err)
        })
    }

    @InteractionChatCommandResponse("valheim")
    async onValheimCommand(interaction: ChatInputCommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case "activity":
                await interaction.deferReply({ephemeral: true})
                let protobuf = await protos.load(protos.getProtoPath("cloud/audit/audit_log.proto"))
                const auditLog= protobuf.lookupType("google.cloud.audit.AuditLog")

                protobufjs.load(protos.logging.v2, (err, root) => {})
                let timeMap = new Map<string, {
                    isActive: boolean,
                    milliseconds: number,
                    lastLogin: number,
                }>()
                let idToName = new Map<string, string>()
                const endTime = new Date();
                const startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago

                const timestampedMessage = /^.*?(?<date>\d{2}\/\d{2}\/\d{4})\s+(?<time>\d{2}:\d{2}:\d{2}):\s+(?<message>.*?)/
                const abandonedMessage = /(?<message>Destroying abandoned non persistent zdo)\s+(?<ownerId>\d+):(?<subId>\d+)\s+owner\s+(?<ownerId2>\d+)/
                const connectMessage = /Got character ZDOID from\s+(?<playerName>.*?)\s+:\s+(?<zdoId>\d+):(?<instanceId>\d+)/
                let userData = await SafeQuery<{valheim_name: string}>(sql`SELECT valheim_name FROM dbo.Users WHERE discord_id = ${interaction.user.id}`)
                if (!userData.recordset[0]?.valheim_name) {
                    void interaction.editReply({content: "It appears this command hasn't been correctly configured for you yet. Please contact @Beta."})
                    return
                }

                let totalMilliseconds = 0
                for await (const entry of getEntries({
                    filter: `(timestamp >= "${startTime.toISOString()}" AND timestamp <= "${endTime.toISOString()}")
                    (
                        labels."agent.googleapis.com/log_file_path"=~"^/var/lib/docker/containers.*"
                        (SEARCH("Destroying abandoned non persistent") OR SEARCH("Got character ZDOID from") OR SEARCH("connection"))
                    ) OR (
                        severity = "NOTICE"
                        resource.labels.instance_id = "5955043253614319225"
                        protoPayload.methodName="v1.compute.instances.stop"
                    )`,
                    orderBy: 'timestamp asc',
                })) {
                    if (!entry.metadata.timestamp) continue;

                    // console.log(JSON.stringify(entry.data.message))

                    let abandonedMatch = abandonedMessage.exec(entry.data.message)
                    let connectMatch = connectMessage.exec(entry.data.message)

                    if (abandonedMatch) {
                        // console.log("Abandoned match")
                        let username = idToName.get(abandonedMatch.groups?.ownerId ?? "")
                        let timeMapItem = timeMap.get(username ?? "")
                        if (!username || !timeMapItem || !timeMapItem.isActive) continue;
                        let milliseconds = new Date(entry.metadata.timestamp as string | number).getTime() - timeMapItem.lastLogin
                        timeMapItem.milliseconds += milliseconds
                        totalMilliseconds += milliseconds
                        timeMapItem.isActive = false
                        timeMap.set(username, timeMapItem)
                        idToName.delete(abandonedMatch.groups?.ownerId ?? "")
                    }
                    else if (connectMatch && connectMatch.groups?.zdoId && connectMatch.groups?.zdoId.length >= 5) {
                        // console.log("Connect match")
                        let username = connectMatch.groups?.playerName ?? ""
                        let timeMapItem = timeMap.get(username)
                        if (!timeMapItem) {
                            // console.log("New login")
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
                            // console.log("Active login")
                            continue;
                        }
                        // console.log("Re-activating login")
                        timeMapItem.lastLogin = new Date(entry.metadata.timestamp as string | number).getTime()
                        timeMapItem.isActive = true

                        timeMap.set(username, timeMapItem)
                        idToName.set(connectMatch.groups?.zdoId ?? "", username)
                    }
                    else if (entry.metadata.protoPayload) {
                        console.log(entry.data.protoPayload, entry.metadata.protoPayload)
                        const decodedLog: any = auditLog.decode(entry.metadata.protoPayload.value as Uint8Array);
                        console.log(decodedLog);
                        if (decodedLog.methodName === "v1.compute.instances.stop") {
                            for (let timeMapItem of timeMap) {
                                if (!timeMapItem[1].isActive) continue;

                                // console.log("Abandoned match")
                                let milliseconds = new Date(entry.metadata.timestamp as string | number).getTime() - timeMapItem[1].lastLogin
                                timeMapItem[1].milliseconds += milliseconds
                                totalMilliseconds += milliseconds
                                timeMapItem[1].isActive = false
                                timeMap.set(timeMapItem[0], timeMapItem[1])
                            }
                            idToName.clear()
                        }
                    }
                    // else {console.log("No match")}
                }
                // console.log(timeMap)
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
Total time online: \`${f(hours)}:${f(minutes)}:${f(seconds)}\` (${
                            Math.round((value.milliseconds / totalMilliseconds) * 100)
                        }%)`,
                        inline: true
                    }])
                }

                interaction.editReply({content: ' ', embeds: [embed]})

        }
    }

    // Runs when a new connection is made to the server
    async #submitNewConnection(timestamp: Date, zdoId: string, username: string) {
        console.log("STARTING SESSION", zdoId, " ", timestamp, "")

        // First, check to see if a connection is already active
        let res = await SafeQuery<{
            id: string, ZDO_ID: string, sessionStart: Date | null, sessionEnd: Date | null, username: string
        }>(sql`SELECT * FROM dbo.ValheimConnectionHistory WHERE ZDO_ID = ${zdoId} AND sessionEnd IS NULL`)
        if (res.recordset.length !== 0) {
            if (!res.recordset[0].sessionStart) await SafeQuery(sql`UPDATE dbo.ValheimConnectionHistory SET sessionStart = ${timestamp} WHERE ZDO_ID = ${zdoId} AND sessionEnd IS NULL`)
            return
        }

        await SafeQuery(sql`INSERT INTO dbo.ValheimConnectionHistory (id, ZDO_ID, sessionStart, username) VALUES (NEWID(), ${zdoId}, ${timestamp}, ${username})`)
    }

    async #submitNewDisconnection(timestamp: Date, zdoId: string) {
        // First, check to see if a connection is already active
        console.log("ENDING SESSION", zdoId, " ", timestamp, "")
        let res = await SafeQuery<{
            id: string, ZDO_ID: string, sessionStart: Date, sessionEnd: Date
        }>(sql`SELECT * FROM dbo.ValheimConnectionHistory WHERE ZDO_ID = ${zdoId}`)
        if (res.recordset.length === 0) {
            await SafeQuery(sql`INSERT INTO dbo.ValheimConnectionHistory (id, ZDO_ID, sessionEnd) VALUES (NEWID(), ${zdoId}, ${timestamp})`)
            return
        }

        let closeSession = res.recordset.find(x => x.sessionEnd === null)
        if (!closeSession) return
        await SafeQuery(sql`UPDATE dbo.ValheimConnectionHistory SET sessionEnd = ${timestamp} WHERE id = ${closeSession.id}`)
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
