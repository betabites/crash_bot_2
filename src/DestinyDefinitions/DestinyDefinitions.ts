export enum ItemType {
    None = 0,
    Currency = 1,
    Armor = 2,
    Weapon = 3,
    Message = 7,
    Engram = 8,
    Consumable = 9,
    ExchangeMaterial = 10,
    MissionReward = 11,
    QuestStep = 12,
    QuestStepComplete = 13,
    Emblem = 14,
    Quest = 15,
    Subclass = 16,
    ClanBanner = 17,
    Aura = 18,
    Mod = 19,
    Dummy = 20,
    Ship = 21,
    Vehicle = 22,
    Emote = 23,
    Ghost = 24,
    Package = 25,
    Bounty = 26,
    Wrapper = 27,
    SeasonalArtifact = 28,
    Finisher = 29,
    Pattern = 30
}
export interface DisplayProperties {
    description: string;
    icon: string;
    hasIcon: boolean;
}

export interface ItemDisplayProperties extends DisplayProperties {
    name: string
}

interface BackgroundColor {
    colorHash: number;
    red: number;
    green: number;
    blue: number;
    alpha: number;
}

interface Action {
    verbName: string;
    verbDescription: string;
    isPositive: boolean;
    requiredCooldownSeconds: number;
    requiredItems: any[];
    progressionRewards: any[];
    actionTypeLabel: string;
    rewardSheetHash: number;
    rewardItemHash: number;
    rewardSiteHash: number;
    requiredCooldownHash: number;
    deleteOnAction: boolean;
    consumeEntireStack: boolean;
    useOnAcquire: boolean;
}

interface Inventory {
    maxStackSize: number;
    bucketTypeHash: number;
    recoveryBucketTypeHash: number;
    tierTypeHash: number;
    isInstanceItem: boolean;
    nonTransferrableOriginal: boolean;
    tierTypeName: string;
    tierType: number;
    expirationTooltip: string;
    expiredInActivityMessage: string;
    expiredInOrbitMessage: string;
    suppressExpirationWhenObjectivesComplete: boolean;
}

export interface AnimatedDisplayProperties extends DisplayProperties {
    name?: string
    iconSequences: {
        frames: string[]
    }[]
}

interface Stat {
    statHash: number;
    value: number;
    minimum: number;
    maximum: number;
    displayMaximum: number;
}

interface EquippingBlock {
    uniqueLabel: string;
    uniqueLabelHash: number;
    equipmentSlotTypeHash: number;
    attributes: number;
    equippingSoundHash: number;
    hornSoundHash: number;
    ammoType: number;
    displayStrings: string[];
}

interface TranslationBlock {
    weaponPatternHash: number;
    defaultDyes: any[];
    lockedDyes: { channelHash: number; dyeHash: number }[];
    customDyes: any[];
    arrangements: { classHash: number; artArrangementHash: number }[];
    hasGeometry: boolean;
}

interface Quality {
    itemLevels: any[];
    qualityLevel: number;
    infusionCategoryName: string;
    infusionCategoryHash: number;
    infusionCategoryHashes: number[];
    progressionLevelRequirementHash: number;
    currentVersion: number;
    versions: { powerCapHash: number }[];
    displayVersionWatermarkIcons: string[];
}

interface Objective {
    displayOnItemPreviewScreen: boolean;
}

interface Objectives {
    objectiveHashes: number[];
    displayActivityHashes: number[];
    requireFullObjectiveCompletion: boolean;
    questlineItemHash: number;
    narrative: string;
    objectiveVerbName: string;
    questTypeIdentifier: string;
    questTypeHash: number;
    completionRewardSiteHash: number;
    nextQuestStepRewardSiteHash: number;
    timestampUnlockValueHash: number;
    isGlobalObjectiveItem: boolean;
    useOnObjectiveCompletion: boolean;
    inhibitCompletionUnlockValueHash: number;
    perObjectiveDisplayProperties: Objective[];
    displayAsStatTracker: boolean;
}

interface SocketEntry {
    socketTypeHash: number;
    singleInitialItemHash: number;
    reusablePlugItems: any[];
    preventInitializationOnVendorPurchase: boolean;
    preventInitializationWhenVersioning: boolean;
    hidePerksInItemTooltip: boolean;
    plugSources: number;
    reusablePlugSetHash: number;
    overridesUiAppearance: boolean;
    defaultVisible: boolean;
}

interface IntrinsicSocket {
    plugItemHash: number;
    socketTypeHash: number;
    defaultVisible: boolean;
}

interface SocketCategory {
    socketCategoryHash: number;
    socketIndexes: number[];
}

interface Sockets {
    detail: string;
    socketEntries: SocketEntry[];
    intrinsicSockets: IntrinsicSocket[];
    socketCategories: SocketCategory[];
}

interface TalentGrid {
    talentGridHash: number;
    itemDetailString: string;
    hudDamageType: number;
}

interface InvestmentStat {
    statTypeHash: number;
    value: number;
    isConditionallyActive: boolean;
}

interface InvestmentStats extends Array<InvestmentStat> {}

export interface Item {
    id: number,
    displayProperties: ItemDisplayProperties;
    tooltipNotifications: any[];
    collectibleHash: number;
    backgroundColor: BackgroundColor;
    screenshot: string;
    itemTypeDisplayName: string;
    flavorText: string;
    uiItemDisplayStyle: string;
    itemTypeAndTierDisplayName: string;
    displaySource: string;
    action: Action;
    inventory: Inventory;
    stats: {
        disablePrimaryStatDisplay: boolean;
        statGroupHash: number;
        stats: { [key: string]: Stat };
        hasDisplayableStats: boolean;
        primaryBaseStatHash: number;
    };
    equippingBlock: EquippingBlock;
    translationBlock: TranslationBlock;
    preview: any;
    quality: Quality;
    objectives: Objectives;
    acquireRewardSiteHash: number;
    acquireUnlockHash: number;
    sockets: Sockets;
    talentGrid: TalentGrid;
    investmentStats: InvestmentStats;
    perks: any[];
    loreHash: number;
    summaryItemHash: number;
    allowActions: boolean;
    doesPostmasterPullHaveSideEffects: boolean;
    nonTransferrable: boolean;
    itemCategoryHashes: number[];
    specialItemType: number;
    itemType: number;
    itemSubType: number;
    classType: number;
    breakerType: number;
    equippable: boolean;
    damageTypeHashes: number[];
    damageTypes: number[];
    defaultDamageType: number;
    defaultDamageTypeHash: number;
    isWrapper: boolean;
    traitIds: string[];
    traitHashes: number[];
    hash: number;
    index: number;
    redacted: boolean;
    blacklisted: boolean;
}