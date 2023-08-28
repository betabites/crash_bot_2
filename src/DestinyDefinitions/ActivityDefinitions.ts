import {DisplayProperties, ItemDisplayProperties} from "./DestinyDefinitions.js";

interface SelectionScreenDisplayProperties extends Partial<DisplayProperties> {}

interface ActivityChallenge {
    rewardSiteHash: number,
    inhibitRewardsUnlockHash: number,
    objectiveHash: number,
    dummyRewards: ActivityDummyReward[]
}

interface ActivityDummyReward {
    itemHash: number,
    quantity: number,
    hasConditionalVisibility: boolean
}

interface ActivityMatchmaking {
    isMatchmade: boolean,
    minParty: number,
    maxParty: number,
    maxPlayers: number,
    requiresGuardianOath: boolean
}

interface ActivityInsertionPoint {
    phaseHash: number,
    unlockHash: number
}

interface ActivityReward {
    rewardItems: ActivityRewardItem[]
}

interface ActivityRewardItem {
    itemHash: number,
    quantity: number,
    hasConditionalVisibility: boolean
}

interface ActivityModifier {
    activityModifierHash: number
}

export interface ActivityDefinition {
    displayProperties: ItemDisplayProperties,
    originalDisplayProperties: ItemDisplayProperties,
    selectionScreenDisplayProperties: SelectionScreenDisplayProperties,
    releaseIcon: string,
    releaseTime: number,
    completeUnlockHash: number,
    tier: number,
    pgcrImage: string,
    rewards: ActivityReward[],
    modifiers: ActivityModifier[],
    isPlaylist: boolean,
    challenges: ActivityChallenge[],
    optionalUnlockStrings: [],
    inheritFromFreeRoam: boolean,
    suppressOtherReqards: boolean,
    playlistItems: [],
    matchmaking: ActivityMatchmaking,
    loadouts: [],
    activityModeHashes?: number[],
    activityModeTypes?: number[],
    isPvP: boolean,
    insertionPoints: ActivityInsertionPoint[],
    activityLocationMappings: [],
    hash: number,
    index: number,
    redacted: boolean,
    blacklisted: boolean
}