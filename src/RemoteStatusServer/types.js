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
});
export const IncomingMessage = z.object({
    type: z.string(),
    data: z.any()
});
export const IncomingLoginMessage = IncomingMessage.extend({
    type: z.literal("playerConnect"),
    data: MinecraftPlayerData
});
export const IncomingLogoutMessage = IncomingMessage.extend({
    type: z.literal("playerDisconnect"),
    data: MinecraftPlayerData
});
export const IncomingChatMessage = IncomingMessage.extend({
    type: z.literal("message"),
    data: z.object({
        player: MinecraftPlayerData,
        message: z.string(),
        submitted: z.boolean()
    })
});
export const IncomingMessagePlayerList = IncomingMessage.extend({
    type: z.literal("player_list"),
    data: z.array(MinecraftPlayerData)
});
export const IncomingAdvancementMessage = IncomingMessage.extend({
    type: z.literal("playerAdvancementEarn"),
    data: z.object({
        player: MinecraftPlayerData,
        advancement: z.object({
            id: z.string(),
            display: z.object({ title: z.string() })
        })
    })
});
