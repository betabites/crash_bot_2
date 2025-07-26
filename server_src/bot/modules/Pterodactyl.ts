import {BaseModule, InteractionChatCommandResponse} from "./BaseModule.js";
import {ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, GuildTextBasedChannel} from "discord.js";
import {
    clearShutdownTasks,
    getPterodactylInstanceStatus,
    PubSub,
    scheduleShutdown,
    startPterodactylInstance,
    stopPterodactylInstance
} from "../../services/GCP.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import crypto from "node:crypto";
import {wait} from "../../misc/Common.js";
import {BigQuery, BigQueryDate} from "@google-cloud/bigquery";
import SafeQuery, {contextSQL, sql} from "../../services/SQL";
import console from "node:console";

const PTERODACTYL_SERVER_ADDRESS = process.env.PTERODACTYL_SERVER_ADDRESS || "";
const PTERODACTYL_API_KEY = process.env.PTERODACTYL_API_KEY || "";
const PTERODACTYL_DISCORD_CHANNEL = "1320952224410767462"

type UserObject = {
    object: 'user',
    attributes: {
        id: number,
        external_id: null,
        uuid: string,
        email: string,
        first_name: string,
        last_name: string,
        language: string,
        root_admin: boolean,
        '2fa': boolean,
        created_at: string,
        updated_at: string
    }
}

export class Pterodactyl extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("pterodactyl")
            .setDescription("Manage the game server")
            .addSubcommand(subcommand =>
                subcommand
                    .setName("start")
                    .setDescription("Start up the server")
                    .addIntegerOption(option => option
                        .setName("minutes")
                        .setMinValue(6)
                        .setMaxValue(360)
                        .setDescription("The amount of time to run the server for in minutes. Defaults to 3 hours (180 minutes)")
                        .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("stop")
                    .setDescription("Stop the server")
                    .addBooleanOption(option => option
                        .setName("now")
                        .setDescription("Stop the server immediately")
                        .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("activity")
                    .setDescription("View your activity on Pterodactyl")
                    .addUserOption(u => u.setName("username").setDescription("The username of the player to view"))
                    .addBooleanOption(s => s.setName("show_shares").setDescription("Shows how the user's stats compare against others").setRequired(false))
                    .addBooleanOption(s => s.setName("last_month").setDescription("Show details for last month instead").setRequired(false))
            )
    ]
    lastKnownStatus = ""
    #topic = PubSub.topic("pterodactyl-status-updates")
    #subscription = this.#topic.subscription("crashbot-subscription")
    #enabled = true
    #pterodactylChannelId = "1320952224410767462"

    constructor(client: Client) {
        super(client);
        void this.#getServerStatus()

        setInterval(async () => {
            void this.#getServerStatus()
        }, 60000)
        this.#subscription.on("message", async (message) => {
            message.ack()
            let data = JSON.parse(message.data.toString())
            console.log("PUB/SUB", data)
            if (data.incident.policy_name !== "Users connected monitor (do not change name)") return

            let channel = await this.client.channels.fetch("1320952224410767462") as GuildTextBasedChannel
            // Schedule shutdown for in 15 mins

            if (await this.#getServerStatus() !== "RUNNING") return
            if (data.incident.state === "closed") {
                // Check that the machine is still running first

                await this.#scheduleShutdown(72 * 60 * 60)
                // channel.send(`The previous automatic shutdown has been cancelled. The server will now shut down <t:${Math.round(Date.now() / 1000) + 21600}:R> unless inactivity occurs.\n> If this is incorrect, please alert @BetaBites.`)
            } else {
                await this.#scheduleShutdown(900)
                // channel.send(`The server will shut down in <t:${Math.round(Date.now() / 1000) + 900}:R> due to inactivity.\n> This shutdown will be cancelled if another user connects to the server. If this is incorrect and someone is connected, please alert @BetaBites.`)
            }
        })
    }

    async #scheduleShutdown(timeSeconds: number) {
        await scheduleShutdown(timeSeconds)
        await this.#updateShutdownMessage(new Date(Date.now() + (timeSeconds * 1000)))
    }

    async #updateShutdownMessage(shutdownTime: Date) {
        let channel = await this.client.channels.fetch(this.#pterodactylChannelId)
        if (!channel || channel.type !== ChannelType.GuildText) return

        let message = await channel.messages.fetch("1326325666462957719")
        message.edit(`The server will shut down <t:${Math.round(shutdownTime.getTime() / 1000)}:R>`)
    }

    async #getServerStatus() {
        // Update the #pterodactyl channel name every minute
        let currentStatus = await getPterodactylInstanceStatus()
        if (!currentStatus || this.lastKnownStatus === currentStatus) return currentStatus

        void this.#updateDiscordChannelName(currentStatus)
        this.lastKnownStatus = currentStatus
        return currentStatus
    }

    async #updateDiscordChannelName(status: string) {
        let channel = await this.client.channels.fetch(PTERODACTYL_DISCORD_CHANNEL) as GuildTextBasedChannel | null
        if (!channel) return
        if (status === "TERMINATED") {
            await channel.setName("🔴-pterodactyl")
        } else if (status === "RUNNING") {
            await channel.setName("🟢-pterodactyl")
        } else {
            await channel.setName("🟠-pterodactyl")
        }
    }

    @InteractionChatCommandResponse("pterodactyl")
    async startupServer(interaction: ChatInputCommandInteraction) {
        let subcommand = interaction.options.getSubcommand()
        if (subcommand === "start") {
            if (!this.#enabled) {
                void interaction.reply({content: "The Pterodactyl server is currently unavailable due to maintenance. Please try again later."})
                return
            }
            let serverDurationMinutes = interaction.options.getInteger("minutes") ?? 72 * 60
            await interaction.reply({content: "Starting up server...", ephemeral: true})

            try {
                // First, check the current status of the server
                let status = await this.#getServerStatus()
                console.log(status)
                await interaction.editReply("Configuring GCP tasks...")
                await this.#scheduleShutdown(serverDurationMinutes * 60)

                if (status === "TERMINATED") {
                    /*
                     * Schedule another shutdown for in 6 hours. This runs first as if this fails, we do not want the server
                     * to run forever.
                     */
                    void this.#updateDiscordChannelName("STARTING")
                    // Attempt to start up the server
                    await interaction.editReply("Contacting compute engine...")
                    await startPterodactylInstance()
                    void this.#updateDiscordChannelName("RUNNING")
                    await interaction.editReply("Waiting 1 minute for services to come online...")
                    await wait(60000)

                } else if (status !== "RUNNING")
                    throw new Error(
                        `The server is currently ${status}.`
                    )

                // Access Pterodactyl API to create an SSO link for the user
                await interaction.editReply("Checking your account details...")
                let user = await this.#checkUserExists(interaction.user.username)
                if (!user) {
                    let password = await this.#createUser(interaction.user.username)
                    user = await this.#checkUserExists(interaction.user.username)
                    if (!user) throw new Error("User was not created")
                    void interaction.editReply(`Welcome to Pterodactyl! Please save and use the login details below to login;
Username: ${interaction.user.username}
Password: ||${password}||

You can login to and manage your servers here; https://${PTERODACTYL_SERVER_ADDRESS}/`)

                } else {
                    void interaction.editReply(`The server is currently running. https://${PTERODACTYL_SERVER_ADDRESS}/`)
                }

            } catch (e) {
                console.error(e)
                void interaction.editReply("An error occurred while starting up the server;\n```" + e + "```")
            }
        }
        else if (subcommand === "stop") {
            if (interaction.options.getBoolean("now")) {
                // Clear the shutdown schedule
                await interaction.reply("Configuring GCP tasks...")
                await clearShutdownTasks()
                await interaction.editReply("Sending shutdown request...")
                await stopPterodactylInstance()
                await interaction.editReply("Server shutdown processes have begun. You can start the server again by running `/pterodactyl start` once the shutdown is complete.")
                return
            }
            await interaction.reply("Configuring GCP tasks...")
            // Schedule shutdown for in 5 mins and 30s
            await this.#scheduleShutdown(330)
            await interaction.editReply("A shutdown has been scheduled. Run `/pterodactyl start` again to cancel.")
        }
        else if (subcommand === "activity") {
            await interaction.deferReply({ephemeral: true})
            // Get billing data
            const bigquery = new BigQuery();
            const [rows] = await bigquery.query(`SELECT DATE(usage_end_time, "UTC") as usage_date,
                                                        SUM(cost)                   as cost
                                                 FROM \`re-flesh.usage_costs.gcp_billing_export_v1_0176BB_97AC5E_923E49\`
                                                 GROUP BY DATE (usage_end_time, "UTC")`);

            // Get session data
            const discordUser = interaction.options.getUser("username") || interaction.user
            const showShares = !!interaction.options.getBoolean("show_shares", false)

            let beginningOfMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1))
            let beginningOfNextMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth() + 1, 1))
            if (!!interaction.options.getBoolean("last_month", false)) {
                beginningOfMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth() - 1, 1))
                beginningOfNextMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1))
            }
            let currentMonthHistory = await contextSQL<{ sessionStart: Date, sessionEnd: Date, user_id: string }>`
                SELECT sessionEnd, user_id, sessionStart
                FROM dbo.ValheimConnectionHistory
                WHERE sessionEnd IS NOT NULL
                  AND sessionStart IS NOT NULL
                  AND sessionEnd >= ${beginningOfMonth}
                  AND sessionEnd < ${beginningOfNextMonth}
                  AND user_id = ${discordUser.id}`
            let totalHistoryData = await contextSQL<{ sessionEnd: Date, sessionStart: Date, user_id: string }>
                `SELECT sessionEnd, user_id, sessionStart
                 FROM dbo.ValheimConnectionHistory
                 WHERE sessionEnd IS NOT NULL
                   AND sessionStart IS NOT NULL
                   AND sessionEnd >= ${beginningOfMonth}
                   AND sessionEnd < ${beginningOfNextMonth}
                `
            let sessionPlaytimeAverage = await contextSQL<{ median: number }>`
                WITH UserMedians AS (SELECT user_id,
                                            PERCENTILE_CONT(
                                                    0.5)
                                                    WITHIN GROUP (ORDER BY DATEDIFF(millisecond, sessionStart, sessionEnd))
                                                    OVER (PARTITION BY user_id) as median
                                     FROM ValheimConnectionHistory
                                     WHERE sessionEnd IS NOT NULL)
                SELECT DISTINCT user_id, median
                FROM UserMedians
                WHERE user_id = ${discordUser.id}`

            let embeds: EmbedBuilder[] = []

            let totalSpend = 0

            let userIdToDateAndDuration = sessionsToDurationMap(totalHistoryData.recordset, beginningOfMonth)
            let dateToDuration = userIdToDateAndDuration.get(discordUser.id) ?? new Map()
            let sessionEmbeds: { date: Date, embed: EmbedBuilder }[] = []

            for (let [dateString, sessionDuration] of dateToDuration) {

                let totalForThisDay = 0
                let shares = new Map<string, number>()
                for (let [username, dateToDuration] of userIdToDateAndDuration) {
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
                    .setTitle("Pterodatyl Activity")
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

    async #checkUserExists(username: string) {
        console.log(`https://${PTERODACTYL_SERVER_ADDRESS}/api/application/users`)
        const req = await fetch(`https://${PTERODACTYL_SERVER_ADDRESS}/api/application/users`, {
            headers: {
                "Authorization": `Bearer ${PTERODACTYL_API_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'Application/vnd.pterodactyl.v1+json',
            }
        })
        const res = await req.json() as { data: any }
        console.log(res.data)
        return res.data.find((item: any) => item.attributes.username === username) as UserObject | undefined
    }

    /**
     * @returns the generated user's password
     * @param username
     * @private
     */
    async #createUser(username: string) {
        console.log(`https://${PTERODACTYL_SERVER_ADDRESS}/api/application/users`)
        let password = crypto.randomUUID()
        const req = await fetch(`https://${PTERODACTYL_SERVER_ADDRESS}/api/application/users`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${PTERODACTYL_API_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'Application/vnd.pterodactyl.v1+json',
            },
            body: JSON.stringify({
                username,
                email: `${username}@pterodactyl.unholyandtwisted.com`,
                first_name: username,
                last_name: username,
                password
            })
        })
        const res = await req.json()
        console.log(res.data)
        return password
    }
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

function sessionsToDurationMap(sessions: {
    sessionStart: Date,
    sessionEnd: Date,
    user_id: string
}[], ignoreBefore: Date) {
    let usernameMap = new Map<string, Map<string, number>>()
    for (let session of sessions) {
        let dateToDuration = usernameMap.get(session.user_id) ?? new Map<string, number>()

        if (session.sessionStart.getTime() < ignoreBefore.getTime()) session.sessionStart = ignoreBefore

        let canExit = false
        while (true) {
            let end: Date
            if (session.sessionStart.getTime() > session.sessionEnd.getTime()) throw new Error("Error processing sessions")
            if (session.sessionStart.getDate() === session.sessionEnd.getDate()) {
                end = session.sessionEnd
                canExit = true
            } else {
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
        usernameMap.set(session.user_id, dateToDuration)
    }
    return usernameMap
}

function renderTimePart(num: number) {
    return num >= 10 ? num.toString() : "0" + num.toString()
}

