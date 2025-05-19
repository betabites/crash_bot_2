import {Bot, DamageTypes, ItemAttackAction} from "./abstracts/bot.ts";
import {STIEffect} from "../effects/STIEffect.ts";
import {ProneEffect} from "../effects/ProneEffect.ts";
import {PetrifyEffect} from "../effects/PetrfyEffect.ts";

export class ProstoBot extends Bot {
    display = {
        name: "Prostitute Bot",
        description: "A suspiciously simple bot found in your parents room.",
    }

    resistantTo = [DamageTypes.MELEE, DamageTypes.RANGED, DamageTypes.PSYCHIC];
    vulnerableTo = [DamageTypes.HOLY, DamageTypes.ELECTRIC, DamageTypes.ICE];

    onTurnStart(): void {}

    @ItemAttackAction("Slap", () => true)
    onSlap(target: Bot) {
        target.damage(DamageTypes.MELEE, this, 1)
        this.setAttribute("mana", v => v + 1)
    }

    @ItemAttackAction("Prone", (self) => self.getAttribute("mana") >= 3)
    onProne(target: Bot) {
        target.applyEffect(ProneEffect, 3)
        this.setAttribute("mana", v => v - 3)
    }

    @ItemAttackAction("Infect", (self, target) => !!target.hasEffect(ProneEffect))
    onInfect(target: Bot) {
        target.applyEffect(STIEffect, 3)
    }

    @ItemAttackAction("Bondage", (self, target) => !!target.hasEffect(ProneEffect)
        && self.getAttribute("mana") >= 3
    )
    onBondage(target: Bot) {
        target.applyEffect(PetrifyEffect, 3)
        this.setAttribute("mana", v => v - 3)
    }
}
