import {BaseModule, InteractionChatCommandResponse} from "./BaseModule.js";
import {ChannelType, ChatInputCommandInteraction, Client, GuildTextBasedChannel} from "discord.js";
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
    ]
    lastKnownStatus = ""
    #topic = PubSub.topic("pterodactyl-status-updates")
    #subscription = this.#topic.subscription("crashbot-subscription")
    #enabled = true
    #pterodactylChannelId = "1320952224410767462"

    constructor(client: Client) {
        super(client);
        void this.#getServerStatus()

        setInterval(async () => {void this.#getServerStatus()}, 60000)
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
            }
            else {
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

                }
                else if (status !== "RUNNING")
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

                }
                else {
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
        const res = await req.json()
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
