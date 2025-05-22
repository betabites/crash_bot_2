import {BaseModule} from "./BaseModule.js";
import {Client} from "discord.js";

export class QuotesGame extends BaseModule {
    commands = []

    constructor(client: Client) {
        super(client);
    }
}