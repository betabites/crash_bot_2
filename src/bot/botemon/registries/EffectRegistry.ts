import {Effect} from "../effects/abstracts/effect.ts";

export class EffectRegistry<REGISTRY extends Record<string, typeof Effect>> {
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

    createItem<KEY extends keyof REGISTRY>(key: KEY) {
        let constructor = this.getConstructor(key)
        return new constructor(key as string)
    }
}
