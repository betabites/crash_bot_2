import {BaseModule} from "./BaseModule.js";
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
        let interactionObj: {
            user?: string,
            member?: string
        } = interaction.toJSON() as any
        delete interactionObj.user
        delete interactionObj.member
        let jsonValue = JSON.stringify(interactionObj, (key, value) => typeof value === 'bigint' ? value.toString() : value)
        console.log(jsonValue, jsonValue.length)

        await SafeQuery(sql`INSERT INTO InteractionTracker (id, incomingJSON) VALUES (${id}, ${jsonValue})`)
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
        console.log(handlerId, this.id, funcName)

        SafeQuery(
            sql`
INSERT INTO InteractionHandler (id, interactionId, funcName, result)
VALUES (${handlerId}, ${this.id}, ${funcName}, 'in progress')`
        )

        try {
            result = await func() ?? "no result returned (undefined)"
        } catch (e) {
            if (e instanceof Error && e.stack) result = e.stack
            else result = `${e}`
            console.error(e)
        }

        SafeQuery(
            sql`UPDATE InteractionHandler SET result=${result}, errored=${errored ? 1 : 0} WHERE id = ${handlerId}`
        )

    }
}
