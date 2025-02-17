import {Bot} from "./abstracts/bot.js";

export class TestBot extends Bot {
    display = {
        name: "TestBot",
        description: "TestBot",
    }

    static override async new(itemType: string, ownerId: string | null) {
        let attributes = {}
        let newId = await this._newInternal(itemType, ownerId, attributes)
        return new TestBot(newId, itemType, attributes)
    }
}
