export abstract class Effect {
    abstract mergeEffects(effects: this[]): void;
}
