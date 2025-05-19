import {BaseModule, OnClientEvent} from "./BaseModule.ts";
import {Message} from "discord.js";

export class LethalCompanyModule extends BaseModule {
    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        if (
            msg.channelId !== "1180614418858512464" ||
            msg.author.id !== "633083986968576031" ||
            msg.attachments.size === 0 ||
            !msg.attachments.find(i => i.name.includes(".zip"))
        ) return
        msg.pin("New modpack?")
    }
}
