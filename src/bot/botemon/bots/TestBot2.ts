import {Bot} from "./abstracts/bot.ts";

export class TestBot2 extends Bot {
    display = {
        name: "TestBot2",
        description: "TestBot2",
    }
    static override async new(itemType: string, ownerId: string | null) {
        let attributes = {}
        let newId = await this._newInternal(itemType, ownerId, attributes)
        return new TestBot2(newId, itemType, attributes)
    }
}
