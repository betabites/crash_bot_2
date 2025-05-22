import {BasicBotAttributes, Bot} from "./abstracts/bot.js";

export class TestBot2 extends Bot {
    resistantTo = []
    vulnerableTo = []
    onTurnStart(): void {
        throw new Error("Method not implemented.");
    }
    display = {
        name: "TestBot2",
        description: "TestBot2",
    }
    static override async new(itemType: string, ownerId: string | null) {
        let attributes: BasicBotAttributes = {
            health: 0,
            maxHealth: 0,
            mana: 0,
            maxMana: 0,
            level: 0
        }
        let newId = await this._newInternal(itemType, ownerId, attributes)
        return new TestBot2(newId, itemType, attributes)
    }
}
