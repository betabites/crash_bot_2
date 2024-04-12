import {BaseModule, OnClientEvent} from "./BaseModule.js";
import {Client, Interaction} from "discord.js";
import SafeQuery, {sql} from "../services/SQL.js";
import crypto from "crypto";

export class UsageTrackingModule extends BaseModule {
    constructor(client: Client) {
        super(client);
    }
}

export class InteractionTracker {
    private interaction: Interaction;
    readonly id: string;
    static async create(interaction: Interaction) {
        let id = crypto.randomUUID()
        let interactionJSON = interaction.toJSON()
        await SafeQuery(sql`INSERT INTO InteractionTracker (id, incomingJSON) VALUES (${id}, ${
            typeof interaction === "string" ? interactionJSON as string: "no json available"
        })`)
        return new InteractionTracker(id, interaction)
    }
    private constructor(id: string, interaction: Interaction) {
        this.id = id
        this.interaction = interaction
    }

    /*
    Pass in a new function that will handle this interaction. The function
    will be executed immediately. Any errors/results returned will be logged.
     */
    async newHandler(funcName: string, func: () => any) {
        let errored = false
        let result: string | null = null
        let handlerId = crypto.randomUUID()

        SafeQuery(
            sql`
INSERT INTO InteracionHandler (id, interactionId, funcName, result, discordUserID)
VALUES (${handlerId}, ${this.id}, ${funcName}, "in progress", ${this.interaction.user.id})`
        )

        try {
            result = await func()
        } catch (e) {
            if (e instanceof Error && e.stack) result = e.stack
            else result = `${e}`
            console.error(e)
        }

        SafeQuery(
            sql`UPDATE InteracionHandler SET result=${result}, errored=${errored} WHERE id = ${handlerId}`
        )

    }
}