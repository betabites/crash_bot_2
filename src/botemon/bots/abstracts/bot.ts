import {InventoryItem} from "../../items/abstracts/InventoryItem.js";
import {Item} from "../../items/abstracts/Item.js";

type BasicBotAttributes = {
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    level: number;
}

export const DamageTypes = {
    // STATUS EFFECTS
    ELECTRIC: "electric",   // Electrical damage, may cause shock or stun effects
    POISON: "poison",       // Toxic damage over time
    PSYCHIC: "psychic",     // Mental damage that affects the mind

    // ELEMENTS
    FIRE: "fire",          // Heat-based damage, may cause burning
    WATER: "water",        // Water-based damage, may cause drowning effects
    EARTH: "earth",        // Physical damage from earth and stone
    ICE: "ice",            // Cold-based damage, may cause freezing
    AIR: "air",            // Wind-based damage, may affect movement

    // MAGIC
    HOLY: "holy",         // Sacred damage, effective against undead/evil
    NECROTIC: "necrotic", // Death-based damage, drains life force
    ARCANE: "arcane",     // Pure magical energy damage
    COSMIC: "cosmic",     // Damage from stars and space, ignores armor
    CHAOS: "chaos",       // Unpredictable damage, can have random effects
    VOID: "void",         // Damage from nothingness, may delete parts
    BASS: "bass",         // Sound-based damage, extra effect if drops

    // COMBAT
    RANGED: "ranged",     // Physical damage from projectiles
    MELEE: "melee",       // Physical damage from close combat
} as const

export type Enum<T extends Record<string, any>> = T[keyof T];
export type DamageSource = Item<any> | null;

export abstract class Bot extends InventoryItem<BasicBotAttributes> {
    abstract resistantTo: Enum<typeof DamageTypes>[]
    abstract vulnerableTo: Enum<typeof DamageTypes>[]

    /**
     * Runs whenever damage is attempted on this entity. Returns the number of hit points damage actually incurred.
     * @return number
     */
    abstract damage(
        damageType: Enum<typeof DamageTypes>,
        source: DamageSource,
        /**
         * The guaranteed minimum number of hit point damage that will be done
         */
        minHitPoints: number,
        /**
         * The maximum number of a additional hit points that *may* be incurred.
         */
        potentialHitPoints: number,
    ): number
}

export function ItemAction(actionName: string, availableFunc: () => boolean, thisArg?: any) {
    function decorator(originalMethod: () => any, context: ClassMethodDecoratorContext<Item<any>>) {
        context.addInitializer(function init(this: Bot) {
            this.actions.push({
                name: actionName,
                available: availableFunc.bind(this),
                action: originalMethod.bind(this)
            })
        })

        return originalMethod
    }

    return decorator
}

export function ItemAttackAction(actionName: string, availableFunc: () => boolean, thisArg?: any) {
    function decorator(originalMethod: (target:Bot) => any, context: ClassMethodDecoratorContext<Item<any>>) {
        context.addInitializer(function init(this: Bot) {
            this.actions.push({
                name: actionName,
                available: availableFunc.bind(this),
                action: originalMethod.bind(this)
            })
        })

        return originalMethod
    }

    return decorator
}
