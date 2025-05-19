import {Item} from "../items/abstracts/Item.ts";

type RegistryItem<DATA extends Record<string, any>> = typeof Item<DATA>

export class ItemRegistry<REGISTRY extends Record<string, RegistryItem<any>>> {
    #registry = new Map<keyof REGISTRY, REGISTRY[string]>()

    constructor(
        registry: REGISTRY
    ) {
        for (let key in registry) {
            this.#registry.set(key as keyof REGISTRY, registry[key])
        }
    }

    getConstructor<KEY extends keyof REGISTRY>(key: KEY): REGISTRY[KEY] {
        let res = this.#registry.get(key)
        if (!res) throw new Error(`Item type ${key.toString()} not found in registry`)
        return res as REGISTRY[KEY]
    }

    createItem<KEY extends keyof REGISTRY>(key: KEY, ownerId: string | null = null) {
        let constructor = this.getConstructor(key)
        return constructor.new(key as string, ownerId)
    }
}
