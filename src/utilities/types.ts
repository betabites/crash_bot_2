import {Message, MessageCreateOptions, MessagePayload, TextBasedChannel} from "discord.js";

export type SendableTextChannel = TextBasedChannel & {send(options: string | MessagePayload | MessageCreateOptions): Promise<Message>}