import {Player} from "./player.js";
import {z} from "zod";

export const MinecraftPlayerData = z.object({
    username: z.string(),
    id: z.string(),
    experience: z.object({
        level: z.number(),
        xp: z.number()
    }),
    position: z.array(z.number()).length(3),
    dimension: z.string(),
    dead: z.boolean(),
    voiceConnectionGroup: z.string().optional().nullable()
})

export const IncomingMessage = z.object({
    type: z.string(),
    data: z.any()
})

export const IncomingLoginMessage = IncomingMessage.extend({
    type: z.literal("playerConnect"),
    data: MinecraftPlayerData
})

export const IncomingLogoutMessage = IncomingMessage.extend({
    type: z.literal("playerDisconnect"),
    data: MinecraftPlayerData
})

export const IncomingChatMessage = IncomingMessage.extend({
    type: z.literal("message"),
    data: z.object({
        player: MinecraftPlayerData,
        message: z.string(),
        submitted: z.boolean()
    })
})

export const IncomingMessagePlayerList = IncomingMessage.extend({
    type: z.literal("player_list"),
    data: z.array(MinecraftPlayerData)
})

export interface OutgoingMessage {
    type: "message"
    data: {
        players: z.infer<typeof MinecraftPlayerData>[],
        message: string
    }
}

export interface OutgoingCommand {
    type: "message"
    data: string,
    silent: boolean
}

export const IncomingAdvancementMessage = IncomingMessage.extend({
    type: z.literal("playerAdvancementEarn"),
    data: z.object({
        player: MinecraftPlayerData,
        advancement: z.object({
            id: z.string(),
            display: z.object({title: z.string()})
        })
    })
})

export interface IServerConnectionEvents {
    message: [string, Player],
    "typing_start": [Player],
    playerDisconnect: [Player],
    playerChangedDimension: [Player],
    playerXpPickup: [Player],
    playerXpChanged: [Player],
    playerLevelChanged: [Player],
    playerDeath: [Player],
    playerRespawn: [Player],
    playerConnect: [Player],
    serverConnect: [],
    serverDisconnect: [],
    playerAdvancementEarn: [{ id: string, display: { title: string } }, Player],
    playerDataUpdate: [Player],
}
