import {InventoryItem} from "../../items/abstracts/InventoryItem.js";
import {Item} from "../../items/abstracts/Item.js";
import {Effect} from "../../effects/abstracts/effect.js";

export type BasicBotAttributes = {
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
    #effects: Effect[] = []
    damageHistory: {hp: number, type: Enum<typeof DamageTypes>}[] = []

    abstract onTurnStart(): void

    /**
     * Runs whenever damage is attempted on this entity. Returns true if the bot died.
     * @return number
     */
    damage(
        damageType: Enum<typeof DamageTypes>,
        source: DamageSource,
        hitPoints: number,
    ) {
        this.damageHistory.push({hp: hitPoints, type: damageType})
        return false
    }

    rollForDamage(
        minDamage: number,
        maxDamage: number,
        damageType: Enum<typeof DamageTypes>,
        source: DamageSource,
    ) {
        let diff = maxDamage - minDamage
        if (diff <= 0) return minDamage
        if (this.resistantTo.includes(damageType)) {
            // Roll a disadvantage against the attacker
            return Math.min(roll(diff), roll(diff)) + minDamage
        } else if (this.vulnerableTo.includes(damageType)) {
            // Roll an advantage against the attacker
            return Math.max(roll(diff), roll(diff)) + minDamage
        }
        return roll(diff) + minDamage
    }

    applyEffect<EFFECT extends Effect, ARGS extends any[]>(constructor: new (...args: ARGS) => EFFECT, ...args: ARGS) {
        let existingEffect = this.hasEffect(constructor)
        if (existingEffect) existingEffect.mergeEffects([new constructor(...args)])
        else this.#effects.push(new constructor(...args))
    }

    hasEffect<ARGS extends any[], EFFECT extends Effect>(effect: new (...args: ARGS) => EFFECT) {
        return this.#effects.find(e => e instanceof effect) as EFFECT | undefined
    }

    clearEffect(effectConstructor: new (...args: any[]) => Effect) {
        let effect = this.hasEffect(effectConstructor)
        if (!effect) return
        this.#effects.splice(this.#effects.indexOf(effect), 1)
    }

    evolve(newBotConstructor: typeof Bot) {}
}

/**
 * roll returns a randome rounded number anywhere between 0 and maxDiceNumber
 * @param maxDiceNumber
 */
export function roll(maxDiceNumber: number) {
    return Math.floor(Math.random() * (maxDiceNumber + 1));
}

export function ItemAction(actionName: string, availableFunc: (thisBot: Bot, target: Bot) => boolean) {
    function decorator(originalMethod: () => any, context: ClassMethodDecoratorContext<Bot>) {
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

export function ItemAttackAction(actionName: string, availableFunc: (self: Bot, target: Bot) => boolean) {
    function decorator(originalMethod: (target:Bot) => any, context: ClassMethodDecoratorContext<Bot>) {
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
