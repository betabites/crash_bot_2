import {Effect} from "./abstracts/effect.ts";

export class SpinEffect extends Effect {
    count = 1
    mergeEffects(effects: this[]): void {
        for (let effect of effects) this.count += effect.count;
    }
}
