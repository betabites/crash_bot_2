import {Bot, DamageSource, DamageTypes, Enum, ItemAttackAction} from "./abstracts/bot.js";

export class EarthBot extends Bot {
    display = {
        name: "Earth Bot",
        description: "A robot made of earthly elements",
    }

    resistantTo: Enum<typeof DamageTypes>[] = ["electric", "psychic", "ranged", "melee"]
    vulnerableTo: Enum<typeof DamageTypes>[] = ["fire", "holy", "water"]

    /**
     * @ItemAction defines 2 things. The name of the attack, and the requirements to use it.
     * @param target
     */
    @ItemAttackAction("earthquake", () => this.getAttribute("mana") >= 10)
    onEarthquake(target: Bot) {
        target.damage(
            "earth", // The type of damage to do
            this,    // The source of the damage (should always be 'this')
            3,       // The minimum amount of damage that is always done
            5        // The maximum potential number of hit points to do in addition to the minimum
        )
        this.setAttribute("mana", v => v - 10);
    }

    @ItemAttackAction("rockslide", () => true)
    onRockslide(target: Bot) {
        target.damage(
            "earth",
            this,
            4,
            6
        )
    }

    @ItemAttackAction("sandstorm", () => this.getAttribute("mana") >= 10)
    onSandstorm(target: Bot) {
        // Area effect attack that does both earth and air damage
        target.damage(
            "earth",
            this,
            2,
            3
        )
        target.damage(
            "air",
            this,
            2,
            3
        )
        this.setAttribute("mana", v => v - 10);
    }

    @ItemAttackAction("crystalize", () => this.getAttribute("mana") >= 15)
    onCrystalize(target: Bot) {
        // Converts earth energy to arcane crystals
        target.damage(
            "arcane",
            this,
            5,
            8
        )
        this.setAttribute("mana", v => v - 15);
    }

    @ItemAttackAction("mudSplash", () => this.getAttribute("mana") >= 5)
    onMudSplash(target: Bot) {
        // Combines earth and water damage
        target.damage(
            "earth",
            this,
            2,
            4
        )
        target.damage(
            "water",
            this,
            1,
            3
        )
        this.setAttribute("mana", v => v - 5);
    }

    @ItemAttackAction("fossilCrush", () => this.getAttribute("mana") >= 20)
    onFossilCrush(target: Bot) {
        // Ancient earth power combines earth and necrotic damage
        target.damage(
            "earth",
            this,
            3,
            5
        )
        target.damage(
            "necrotic",
            this,
            2,
            4
        )
        this.setAttribute("mana", v => v - 20);
    }

    @ItemAttackAction("mineralBurst", () => this.getAttribute("mana") >= 12)
    onMineralBurst(target: Bot) {
        // Crystalline explosion that does earth and glitch damage
        target.damage(
            "earth",
            this,
            3,
            4
        )
        target.damage(
            "glitch",
            this,
            2,
            6
        )
        this.setAttribute("mana", v => v - 12);
    }

    damage(damageType: Enum<typeof DamageTypes>, source: DamageSource, minHitPoints: number, potentialHitPoints: number): number {
        return 0;
    }
}
