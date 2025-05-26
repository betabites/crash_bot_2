import SafeQuery, {sql} from "../../../../services/SQL.js";

type ActionMetadata<SELF extends Item<any>> = {
    name: string,
    available(thisBot: SELF, target: SELF): boolean,
    action(target: SELF): any
}
export class Item<ATTRIBUTE_DATA extends Record<string, any>> {
    actions: ActionMetadata<this>[] = []

    static async new(itemType: string, ownerId: string | null) {
        let newId = await this._newInternal(itemType, ownerId, {})
        return new this(newId, itemType, {})
    }

    /**
     * Creates the item in the database. Returns the ID assigned by the database for the new item.
     * @param itemType
     * @param ownerId
     * @param attributes
     * @returns string
     * @protected
     */
    protected static async _newInternal(
        itemType: string,
        ownerId: string | null,
        attributes: Record<string, any> = {}
    ) {
        let res = await SafeQuery<{id: string}>(sql`INSERT INTO InventoryItems (itemType, attributes, owner) OUTPUT INSERTED.id VALUES (${itemType}, ${JSON.stringify(attributes)}, ${ownerId})`)
        return res.recordset[0].id
    }

    getAttribute<KEY extends keyof ATTRIBUTE_DATA>(key: KEY): ATTRIBUTE_DATA[KEY] {
        return this._attributes[key]
    }
    setAttribute<KEY extends keyof ATTRIBUTE_DATA>(
        key: KEY, value: ATTRIBUTE_DATA[KEY] | ((v: ATTRIBUTE_DATA[KEY]) => ATTRIBUTE_DATA[KEY])
    ) {
        // @ts-expect-error
        if (typeof value === "function") this._attributes[key] = value(this._attributes[key])
        else this._attributes[key] = value
    }


    constructor(
        /**
         * instanceId refers to the ID for the particular instance of this item.
         */
        readonly instanceId: string,
        readonly itemType: string,
        private _attributes: ATTRIBUTE_DATA
    ) {}

    setBucketId(bucketId: string) {}
}

export function ItemAction(actionName: string, availableFunc: () => boolean, thisArg?: any) {
    function decorator(originalMethod: (self: Item<any>) => any, context: ClassMethodDecoratorContext<Item<any>>) {
        context.addInitializer(function init(this: Item<any>) {
            this.actions.push({
                name: actionName,
                available: availableFunc.bind(thisArg || this),
                action: originalMethod.bind(this)
            })
        })

        return originalMethod
    }

    return decorator
}

