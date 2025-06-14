import {BaseModule} from "./BaseModule.js";
import {Client, Interaction} from "discord.js";
import SafeQuery, {contextSQL, sql, SQLContextWrapper} from "../../services/SQL.js";
import crypto from "node:crypto";

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
    @SQLContextWrapper
    async newHandler(funcName: string, func: () => any) {
        let errored = false
        let result: string | null = null
        let handlerId = crypto.randomUUID()
        console.log(handlerId, this.id, funcName)

        contextSQL`
INSERT INTO InteractionHandler (id, interactionId, funcName, result)
VALUES (${handlerId}, ${this.id}, ${funcName}, 'in progress')`

        try {
            result = await func() ?? "no result returned (undefined)"
        } catch (e) {
            if (e instanceof Error && e.stack) result = e.stack
            else result = `${e}`.substring(0, 1000)
            console.error(e)
        }

        contextSQL`UPDATE InteractionHandler SET result=${result}, errored=${errored ? 1 : 0} WHERE id = ${handlerId}`

    }
}
