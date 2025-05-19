import {Effect} from "./effect.ts";

/**
 * A turn-based effect is an effect that is based around the turns in a battle. As soon as the battle is over,
 * all remaining turn-based effects immediately perish.
 */
export class TurnBasedEffect extends Effect {
    constructor(public turns: number) {
        super();
    }

    mergeEffects(effects: TurnBasedEffect[]): this {
        this.turns += effects.reduce((previousValue, currentValue) => previousValue + currentValue.turns, 0)
        return this;
    }
}
