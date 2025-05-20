import {Bot, DamageTypes, ItemAction, ItemAttackAction, roll} from "../abstracts/bot.js";
import {PoisonEffect} from "../../effects/PoisonEffect.js";
import {ArmourEffect} from "../../effects/ArmourEffect.js";

export class Niraspid extends Bot {
    display = {
        name: "Niraspid",
        description: "Niraspid was designed with the purpose to take over animals in the Arachnid animal class due to a large portion of the population having a phobia of said creatures. With this purpose in mind the designers made a simple design having eight legs. The Niraspid prototypes work unlike others from the arachnid species where it uses silk to cover itself and then lies in wait for insects and bugs to gather before disposing of them. This armour-like silk also protects the robot from tamperings and extreme temperatures.\n" +
            "Innate Abilities: Mending: Niraspid gains 1 Health at the start of each turn.",
    }
    resistantTo = [DamageTypes.POISON, DamageTypes.ICE, DamageTypes.ARCANE];
    vulnerableTo = [DamageTypes.FIRE, DamageTypes.NECROTIC, DamageTypes.COSMIC];

    onTurnStart() {
        this.setAttribute("health", v => v + 1)
    }

    @ItemAttackAction("Scratch", () => true)
    onScratch(target: Bot) {
        let damage = target.rollForDamage(1, 3, DamageTypes.POISON, this)
        target.damage(DamageTypes.POISON, this, damage)
    }

    @ItemAttackAction("Poison Bite", (self) => self.getAttribute("mana") >= 4)
    onPoisonBite(target: Bot) {
        let damage = target.rollForDamage(1, 3, DamageTypes.POISON, this)
        let targetDied = target.damage(DamageTypes.POISON, this, damage)
        if (!targetDied) target.applyEffect(PoisonEffect, 2)

        this.setAttribute("mana", v => v - 4)
    }

    @ItemAction("Harden", () => true)
    onHarden() {
        this.applyEffect(ArmourEffect, 2 + roll(2))
        this.setAttribute("mana", v => v + 3)
    }

    @ItemAttackAction("Infestation", (self, target) =>
        target.damageHistory.at(-1)?.type === DamageTypes.MELEE
        && self.getAttribute("mana") >= 2
    )
    onInfestation(target: Bot) {
        target.applyEffect(PoisonEffect, 3)
        this.setAttribute("mana", v => v - 2)
    }
}
