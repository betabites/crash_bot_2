import {Bot, DamageTypes, ItemAttackAction} from "./abstracts/bot.ts";
import {BenchPressedEffect} from "../effects/BenchPressedEffect.ts";
import {SpinEffect} from "../effects/SpinEffect.ts";

export class GymBot extends Bot {
    display = {
        name: "Gym Bot",
        description: "The biggest of chads. This guy could probably pick someone up by the neck with one hand, and solve a crossword in the other.",
    }

    resistantTo = [DamageTypes.MELEE, DamageTypes.RANGED, DamageTypes.EARTH];
    vulnerableTo = [DamageTypes.HOLY, DamageTypes.AIR, DamageTypes.NECROTIC];

    onTurnStart(): void {}

    @ItemAttackAction("Bench-press", (self) => self.getAttribute("mana") >= 1)
    onBenchPress(target: Bot) {
        target.applyEffect(BenchPressedEffect)
        this.setAttribute("mana", v => v - 1)
    }

    @ItemAttackAction("Spin", () => true)
    onSpin(target: Bot) {
        target.applyEffect(SpinEffect)
    }

    @ItemAttackAction("Shot-put", (self, target) => (self.hasEffect(SpinEffect)?.count ?? 0) >= 1)
    onInfect(target: Bot) {
        let spinCount = this.hasEffect(SpinEffect)?.count ?? 0
        if (spinCount == 0) throw new Error("Spin effect not found")

        let damage = target.rollForDamage(spinCount, 1 + (spinCount * 2), DamageTypes.MELEE, this)
        target.damage(DamageTypes.MELEE, this, damage)
        this.clearEffect(SpinEffect)
    }

    @ItemAttackAction("Karate", () => true)
    onKarate(target: Bot) {
        let damage = target.rollForDamage(-2, 3, DamageTypes.MELEE, this)
        if (damage > 0) target.damage(DamageTypes.MELEE, this, damage)
        else if (damage < 0) this.damage(DamageTypes.MELEE, this, -damage)
    }
}
