import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Client, Message} from "discord.js";

export class GPTModule extends BaseModule {
    constructor(client: Client) {
        super(client);
        console.log("Bound client")
    }

    @OnClientEvent("messageCreate")
    onMessage(msg: Message) {
        console.log("New message!")
    }
}