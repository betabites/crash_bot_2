import {Bot, DamageTypes, ItemAttackAction} from "./abstracts/bot.js";
import {ProneEffect} from "../effects/ProneEffect.js";

export class PreistBot extends Bot {
    display = {
        name: "Preist Bot",
        description: "Holy art thou whomstith equip Priest Bot in their arsonry. Winnith as they may, thou art",
    }

    resistantTo = [DamageTypes.HOLY, DamageTypes.BASS, DamageTypes.PSYCHIC];
    vulnerableTo = [DamageTypes.FIRE, DamageTypes.ARCANE, DamageTypes.CHAOS];

    onTurnStart(): void {}

    @ItemAttackAction("Pray the gay away", (self) => self.getAttribute("mana") >= 3)
    onPray(target: Bot) {
        this.setAttribute("mana", v => v - 3)
        // ...
    }


    @ItemAttackAction("Communion", (self, target) => true)
    onInfect(target: Bot) {
        // All bots currently in your party get +1 mana. Bots vulnerable to holy get +2 instead
    }

    @ItemAttackAction("Baptisim", (self, target) => !!target.hasEffect(ProneEffect)
        && self.getAttribute("mana") >= 3
    )
    onBondage(target: Bot) {
        // Deal 1-6 water damage (disadvantage). +1 mana if 4 or more damage is done.
    }
}
