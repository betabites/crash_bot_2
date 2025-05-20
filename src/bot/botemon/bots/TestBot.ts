import {Bot, Enum} from "./abstracts/bot.js";

export class TestBot extends Bot {
    resistantTo: Enum<{ readonly ELECTRIC: "electric"; readonly POISON: "poison"; readonly PSYCHIC: "psychic"; readonly FIRE: "fire"; readonly WATER: "water"; readonly EARTH: "earth"; readonly ICE: "ice"; readonly AIR: "air"; readonly HOLY: "holy"; readonly NECROTIC: "necrotic"; readonly ARCANE: "arcane"; readonly COSMIC: "cosmic"; readonly CHAOS: "chaos"; readonly VOID: "void"; readonly BASS: "bass"; readonly RANGED: "ranged"; readonly MELEE: "melee"; }>[];
    vulnerableTo: Enum<{ readonly ELECTRIC: "electric"; readonly POISON: "poison"; readonly PSYCHIC: "psychic"; readonly FIRE: "fire"; readonly WATER: "water"; readonly EARTH: "earth"; readonly ICE: "ice"; readonly AIR: "air"; readonly HOLY: "holy"; readonly NECROTIC: "necrotic"; readonly ARCANE: "arcane"; readonly COSMIC: "cosmic"; readonly CHAOS: "chaos"; readonly VOID: "void"; readonly BASS: "bass"; readonly RANGED: "ranged"; readonly MELEE: "melee"; }>[];
    onTurnStart(): void {
        throw new Error("Method not implemented.");
    }
    display = {
        name: "TestBot",
        description: "TestBot",
    }

    static override async new(itemType: string, ownerId: string | null) {
        let attributes = {}
        let newId = await this._newInternal(itemType, ownerId, attributes)
        return new TestBot(newId, itemType, attributes)
    }
}
