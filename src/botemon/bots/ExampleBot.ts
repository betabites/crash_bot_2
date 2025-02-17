export class EarthBot extends Bot {
    display = {
        name: "Earth Bot",
        description: "A robot made of earthly elements",
    }

    resistantTo = ["electric", "psychic", "ranged", "melee"]
    vulnerableTo = ["fire", "holy", "water"]

    /**
     * @ItemAction defines 2 things. The name of the attack, and the requirements to use it. In this case, the
     * 'earthquake' attack requires at least 10 mana.
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
    onRockslide(target: Bot) {/* ... */}

    @ItemAttackAction("sandstorm", () => this.getAttribute("mana") >= 10)
    onSandstorm(target: Bot) {/* ... */}

    @ItemAttackAction("crystalize", () => this.getAttribute("mana") >= 15)
    onCrystalize(target: Bot) {/* ... */}

    @ItemAttackAction("mudSplash", () => this.getAttribute("mana") >= 5)
    onMudSplash(target: Bot) {/* ... */}

    @ItemAttackAction("fossilCrush", () => this.getAttribute("mana") >= 20)
    onFossilCrush(target: Bot) {/* ... */}

    @ItemAttackAction("mineralBurst", () => this.getAttribute("mana") >= 12)
    onMineralBurst(target: Bot) {/* ... */}
}
