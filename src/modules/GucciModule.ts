import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Message} from "discord.js";

export class GucciModule extends BaseModule {
    @OnClientEvent("messageCreate")
    async onMessage(msg: Message) {
        if (msg.author.id !== "358045259726323716") return

        let _msg = await msg.reply("nig")
        void _msg.delete()
    }
}
