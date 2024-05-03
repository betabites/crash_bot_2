import {BaseModule, InteractionChatCommandResponse, OnClientEvent} from "./BaseModule.js";
import {
    AttachmentBuilder,
    BaseGuildTextChannel,
    ChatInputCommandInteraction,
    Client,
    EmbedBuilder,
    Message,
    TextBasedChannel,
    TextChannel, VoiceBasedChannel, VoiceState
} from "discord.js";
import SafeQuery, {SafeTransaction, sql} from "../services/SQL.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import Jimp from "jimp";
import {AIConversation, generateAIThumbnail} from "../services/ChatGPT.js";
import {IResult} from "mssql";
import schedule from "node-schedule";

const levelUpgradeMessages = [
    null,
    null, // lv1
    null, // lv2
    null, //...
    "2 new speech modes unlocked!",
    null,
    null,
    "Start new AI conversations by pinging @Crash Bot!",
    null,
    null,
    null
]
type IWeaponClass = {
    className: string,
    hiddenMultipliers: {
        damage: [number, number] // MIN, MAX
        recovery: [number, number] // MIN, MAX
        resistance: [number, number] // MIN, MAX
        uses: [number, number] // MIN, MAX
    }
}
const WEAPON_CLASSES = [
    {
        className: "defense",
        hiddenMultipliers: {
            damage: [.5,.5],
            recovery: [.5,.5],
            resistance: [1,1],
            uses: [.5,.5]
        }
    },
    {
        className: "medical",
        hiddenMultipliers: {
            damage: [.5,.5],
            recovery: [1,1],
            resistance: [.5,.5],
            uses: [.5,.5]
        }
    },
    {
        className: "offensive",
        hiddenMultipliers: {
            damage: [1,1],
            recovery: [.5,.5],
            resistance: [.5,.5],
            uses: [.5,.5]
        }
    },
    {
        className: "sturdy",
        hiddenMultipliers: {
            damage: [.5,.5],
            recovery: [.5,.5],
            resistance: [.5,.5],
            uses: [1,1]
        }
    },
    {
        className: "a bit shit",
        hiddenMultipliers: {
            damage: [0,.5],
            recovery: [0,.5],
            resistance: [0,.5],
            uses: [0,.5]
        }
    },
    {
        className: "influencer",
        hiddenMultipliers: {
            damage: [.25,.5],
            recovery: [.25,.5],
            resistance: [.25,.5],
            uses: [0,2]
        }
    },
    {
        className: "godly",
        hiddenMultipliers: {
            damage: [1,3],
            recovery: [1,3],
            resistance: [1,3],
            uses: [0,.2]
        }
    },
    {
        className: "defaultness",
        hiddenMultipliers: {
            damage: [.1,.2],
            recovery: [.1,.2],
            resistance: [.1,.2],
            uses: [.1,.2]
        }
    },
] as const satisfies IWeaponClass[]

const weaponTypes = [
    "blade", "shovel", "spoon",
    "sword", "spoon", "trident",
    "sink", "bed", "stick",
    "staff", "bath", "school",
    "cookie", "spellbook", "pot"
]

type IWeaponDescriptor = {
    name: string,
    class: typeof WEAPON_CLASSES[number]["className"]
}

const weaponDescriptors = [
    {
        name: "grass",
        class: "a bit shit"
    },
    {
        name: "dirt",
        class: "a bit shit"
    },
    {
        name: "adultry",
        class: "influencer"
    },
    {
        name: "Minecraft",
        class: "influencer"
    },
    {
        name: "YouTube",
        class: "influencer"
    },
    {
        name: "Greek Gods",
        class: "godly"
    },
    {
        name: "brick",
        class: "defense"
    },
    {
        name: "wood",
        class: "sturdy"
    },
    {
        name: "cotton",
        class: "medical"
    },
    {
        name: "Ryan",
        class: "influencer"
    },
    {
        name: "nuclear waste",
        class: "offensive"
    },
    {
        name: "Destiny 2",
        class: "influencer"
    },
    {
        name: "cookies",
        class: "medical"
    },
    {
        name: "stationary",
        class: "medical"
    },
    {
        name: "chocolate chips",
        class: "medical"
    },
    {
        name: "greed",
        class: "a bit shit"
    }
] as const satisfies IWeaponDescriptor[]

function randomFromArray<T>(array: T[]) {
    return array[Math.floor(Math.random() * array.length)]
}

function toTitleCase(str: string) {
    return str.toLowerCase().split(' ').map(function (word) {
        return (word.charAt(0).toUpperCase() + word.slice(1));
    }).join(' ');
}

function randomStatRoll(minRoll: number, maxRoll: number): number
function randomStatRoll(minRoll: number, maxRoll: number) {
    const actualMax = maxRoll - minRoll
    return minRoll + Math.floor(Math.random() * actualMax) + 1
}

interface GrantPointsOptions {
    userDiscordId: string,
    points: number,
    capped?: boolean,

    // Specify if the user should only receive the points when they are above a certain level.
    levelGate?: number
}

export class PointsModule extends BaseModule {
    // This set is used to prevent users from being able to spam and get additional points.
    // Every time a user gains points from a message, their ID goes in here.
    // While their ID is in here, they cannot gain points again until it is removed.
    // The array is reset every 2.5mins
    userMessagesOnCooldown = new Set<string>()
    commands = [
        new SlashCommandBuilder()
            .setName("level")
            .setDescription("Display your current Crash Bot level")
            .addUserOption((usr) => usr
                .setName("user")
                .setDescription("The user who's level you'd like to check")
                .setRequired(false)
            )
    ]
    // KEY: Voice channel id
    activeVoiceChannels = new Map<string, string[]>()

    constructor(client: Client) {
        super(client);
        setInterval(() => {
            this.userMessagesOnCooldown.clear()
        }, 150000)

        setInterval(async () => {
            // Give points to users in voice calls with 2 or more members
            console.log("GRANTING VOICE CALL POINTS")
            for (let call of this.activeVoiceChannels) {
                console.log(`GRANTING POINTS TO CHANNEL: ${call[0]}`)
                if (call[1].length < 2) continue
                for (let memberId of call[1]) {
                    console.log(`GRANTING POINTS TO USER; ${memberId}`)
                    void PointsModule.grantPointsWithDMResponse({
                        userDiscordId: memberId,
                        points: 1,
                        capped: true,
                        discordClient: this.client,
                        levelGate: 5
                    })
                }
            }
        }, 600000)

        // Reset capped points at midnight every day
        schedule.scheduleJob("0 0 0 * * *", () => {
            console.log("RESET CAPPED POINTS")
            SafeQuery(sql`UPDATE Users SET cappedPoints=0 WHERE 1=1`)
        })
    }


    static async grantPointsWithInChannelResponse(options: GrantPointsOptions & {responseChannel: TextBasedChannel, discordClient: Client}) {
        if (options.points == 0) return

        let user = await PointsModule.grantPoints(options)
        if (!user) return
        if (user.points == 0) {
            let discord_user =
                options.responseChannel instanceof BaseGuildTextChannel ?
                    await options.responseChannel.guild.members.fetch(options.userDiscordId) :
                    await options.discordClient.users.fetch(options.userDiscordId)

            let upgradeMsg = levelUpgradeMessages[user.level + 1]
            let embed = new EmbedBuilder()
            embed.setTitle(`🥳 Level up!`)
            embed.setDescription(`<@${options.userDiscordId}> just leveled up to level ${user.level + 1}!${
                upgradeMsg ? "\n\n" + upgradeMsg : ""
            }`)
            embed.setThumbnail(discord_user.displayAvatarURL())
            options.responseChannel.send({embeds: [embed]})
        }
    }

    static async grantPointsWithDMResponse(options: GrantPointsOptions & {discordClient: Client}) {
        if (options.points == 0) return

        let user = await PointsModule.grantPoints(options)
        if (!user) return
        if (user.points == 0) {
            let discordUser = await options.discordClient.users.fetch(options.userDiscordId)

            let upgradeMsg = levelUpgradeMessages[user.level + 1]
            let embed = new EmbedBuilder()
            embed.setTitle(`🥳 Level up!`)
            embed.setDescription(`<@${options.userDiscordId}> just leveled up to level ${user.level + 1}!${
                upgradeMsg ? "\n\n" + upgradeMsg : ""
            }`)
            embed.setThumbnail(discordUser.displayAvatarURL())
            discordUser.send({embeds: [embed]})
        }
    }

    static async grantPoints(options: GrantPointsOptions): Promise<{ level: number, points: number } | null> {
        let res: IResult<{ points: number, level: number }>
        if (options.capped) {
            res = await SafeQuery<{
                points: number,
                level: number
            }>
            (sql`UPDATE Users
                 SET points=points + ${options.points}, cappedPoints=cappedPoints + ${options.points}
                 WHERE discord_id = ${options.userDiscordId} AND cappedPoints < 40;
            SELECT points, level
            FROM Users
            WHERE discord_id = ${options.userDiscordId} AND level >= ${options.levelGate || 0}`)
        }
        else {
            res = await SafeQuery<{
                points: number,
                level: number
            }>
            (sql`UPDATE Users
                 SET points=points + ${options.points}
                 WHERE discord_id = ${options.userDiscordId};
            SELECT points, level
            FROM Users
            WHERE discord_id = ${options.userDiscordId} AND level >= ${options.levelGate || 0}`)
        }

        console.log(res)

        let user = res.recordset[0]
        if (!user) return null
        if (user.points >= PointsModule.calculateLevelGate(user.level + 1)) {
            await SafeQuery(sql`UPDATE Users
                                SET points=0,
                                    level=level + 1
                                WHERE discord_id = ${options.userDiscordId}`)
            user.level += 1
            user.points = 0
        }
        return user
    }

    static async getPoints(userDiscordId: string) {
        let res = await SafeQuery<{ points: number, level: number }>(sql`SELECT points, level
                                                                         FROM dbo.Users
                                                                         WHERE discord_id = ${userDiscordId}`)
        return res.recordset[0]
    }

    @OnClientEvent("messageCreate", this)
    async onMessageCreate(msg: Message) {
        if (msg.channelId === "892518396166569994" && msg.content === "new_weapon") {
            const level = await PointsModule.getPoints(msg.author.id)
            const max_points = 10 + (level.level * 5)
            const descriptor = randomFromArray(weaponDescriptors);
            const descriptorClass = WEAPON_CLASSES.find((i) => i.className === descriptor.class)
            if (!descriptorClass) throw new Error("Weapon descriptor has an invalid class")

            const weapon = {
                name: toTitleCase(`${randomFromArray(weaponTypes)} of ${randomFromArray(weaponDescriptors)}`),
                damage: randomStatRoll(
                    max_points * descriptorClass.hiddenMultipliers.damage[0],
                    max_points * descriptorClass.hiddenMultipliers.damage[1]
                ),
                recovery: randomStatRoll(
                    max_points * descriptorClass.hiddenMultipliers.recovery[0],
                    max_points * descriptorClass.hiddenMultipliers.recovery[1]
                ),
                resistance: randomStatRoll(
                    max_points * descriptorClass.hiddenMultipliers.resistance[0],
                    max_points * descriptorClass.hiddenMultipliers.resistance[1]
                ),
                uses: randomStatRoll(
                    Math.floor(max_points / 3) * descriptorClass.hiddenMultipliers.uses[0],
                    Math.floor(max_points / 3) * descriptorClass.hiddenMultipliers.uses[1]
                )
            }
            console.log(weapon)
            const ai_conversation = AIConversation.new()
            await ai_conversation.saveMessage({
                role: "system",
                content: `Write an image generation prompt for an item that meets these details;
<Name>${weapon.name}</Name>
<Stats>
<Damage>${weapon.damage}</Damage>
<Recovery>${weapon.recovery}</Recovery>
<Resistance>${weapon.resistance}</Resistance>
</Stats>`
            })
            let prompt = (await ai_conversation.sendToAI()).content as string
            let image_url = await generateAIThumbnail(prompt)
            if (!image_url) return

            await ai_conversation.saveMessage({
                role: "system",
                content: "Create a short blurb for the item. The blurb must be short and comedic. It DOES NOT need to fully describe the item. Some examples are 'good for throwing', 'Nice for a warm bath', and 'sharp to the touch'."
            })
            let short_desc = (await ai_conversation.sendToAI()).content as string

            let embed = new EmbedBuilder()
            embed.setTitle(weapon.name)
            embed.setDescription(`<@${msg.author.id}> found a new item!\n\n${short_desc}`)
            embed.setFields([
                {name: "⚔️ Damage", value: weapon.damage.toString() + "/" + max_points, inline: true},
                {name: "❤️‍🩹 Recovery", value: weapon.recovery.toString() + "/" + max_points, inline: true},
                {name: "🛡️ Resistance", value: weapon.resistance.toString() + "/" + max_points, inline: true},
                {name: "↪️ Uses", value: weapon.uses.toString() + "/" + Math.floor(max_points / 3), inline: true}
            ])
            embed.setThumbnail("attachment://thumbnail.png")
            embed.setFooter({
                text: `The maximum amount of stats points an item can have is based on your current level (${level.level}). Increasing your level will allow you to gain more powerful items.`
            })

            let weapon_msg = await msg.reply({
                embeds: [embed],
                files: [
                    new AttachmentBuilder(image_url)
                        .setName("thumbnail.png")
                ]
            })
            console.log(weapon_msg.attachments)
        }

        if (msg.author.bot) return
        else if (this.userMessagesOnCooldown.has(msg.author.id)) return
        this.userMessagesOnCooldown.add(msg.author.id)
        await PointsModule.grantPointsWithInChannelResponse({
            userDiscordId: msg.author.id,
            points: 3,
            responseChannel: msg.channel,
            discordClient: this.client
        })
    }

    @InteractionChatCommandResponse("level")
    async onLevelCommand(interaction: ChatInputCommandInteraction) {
        let user = interaction.options.getUser("user") ?? interaction.user
        const userPointsData = await PointsModule.getPoints(user.id)

        const width = 500
        const height = 10
        const padding = 5
        const backgroundColor = 0xFFFFFFFF; // White background
        const image = new Jimp(width, height, backgroundColor)
        const barColor = 0x0000FFFF; // Blue progress bar

        // Draw bar
        const pointsRequiredForNextLevel = PointsModule.calculateLevelGate(userPointsData.level + 1)
        const progressWidth = Math.round(
            (userPointsData.points / pointsRequiredForNextLevel) * width
        )
        image.scan(0, 0, progressWidth, height, (x, y, idx) => {
            image.bitmap.data[idx + 0] = (barColor >> 24) & 255; // Red
            image.bitmap.data[idx + 1] = (barColor >> 16) & 255; // Green
            image.bitmap.data[idx + 2] = (barColor >> 8) & 255;  // Blue
            image.bitmap.data[idx + 3] = 255;                     // Full Alpha
        })

        const embed = new EmbedBuilder()
        embed.setThumbnail(user.avatarURL())
        embed.setTitle("🔎 Crash Bot Points progress")
        embed.setDescription(`You're currently level ${userPointsData.level}
You've earned ${userPointsData.points}/${pointsRequiredForNextLevel} points`)
        interaction.reply({
            embeds: [embed],
            files: [await image.getBufferAsync("image/png")]
        })
    }

    @OnClientEvent("voiceStateUpdate")
    onUserVoiceStateChange(oldState: VoiceState, newState: VoiceState) {
        console.log("STATE UPDATING!")
        if (oldState.channel) void this.#updateUsersInVoiceChannel(oldState.channel)
        if (newState.channel) void this.#updateUsersInVoiceChannel(newState.channel)
    }

    async #updateUsersInVoiceChannel(channel: VoiceBasedChannel) {
        let members = channel.members.map(member => member.id);
        if (members.length < 2) {
            if (this.activeVoiceChannels.has(channel.id)) this.activeVoiceChannels.delete(channel.id)
            return
        }

        console.log(members)
        this.activeVoiceChannels.set(channel.id, members)
    }

    static calculateLevelGate(targetLevel: number) {
        return Math.round(targetLevel ** 2.05) + 20
    }
}