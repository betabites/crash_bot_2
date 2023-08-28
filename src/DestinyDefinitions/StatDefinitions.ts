import {AnimatedDisplayProperties} from "./DestinyDefinitions.js";

enum DestinyStatAggregationType {
    CharacterAverage,
    Character,
    Item
}

enum StatCategory {
    Gameplay,
    Weapon,
    Defense,
    Primary
}

export interface StatDefinition {
    displayProperties: AnimatedDisplayProperties,
    aggregationType: DestinyStatAggregationType,
    hasComputedBlock: boolean,
    statCateogry: StatCategory,
    interpolate: boolean,
    hash: number,
    index: number,
    redacted: boolean,
    blacklisted: boolean
}