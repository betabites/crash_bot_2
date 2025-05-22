import {Effect} from "./abstracts/effect.js";

export class ArmourEffect extends Effect {
    constructor(public stackSize: number) {
        super();
    }

    mergeEffects(effects: this[]): void {
    }
}
