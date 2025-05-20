import {Item} from "./Item.js";

export abstract class InventoryItem<ATTRIBUTE_DATA extends Record<string, any>> extends Item<ATTRIBUTE_DATA> {
    abstract readonly display: {
        name: string,
        description: string,
    };

    constructor(instanceId: string, itemType: string, attributes: ATTRIBUTE_DATA) {
        super(instanceId, itemType, attributes);
    }
}
