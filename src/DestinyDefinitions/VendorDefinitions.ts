import {DisplayProperties, ItemDisplayProperties} from "./DestinyDefinitions.js";

enum VendorProgressionTypes {
    Default,
    Ritual,
    NoSeasonalRefresh
}

enum VendorReplyType {
    Accept,
    Decline,
    Complete
}

enum VendorInteractionTypes {
    Unknown,
    Undefined,
    QuestComplete,
    QuestContinue,
    ReputationPreview,
    RankUpReward,
    TokenTurnIn,
    QuestAccept,
    ProgressTab,
    End,
    Start
}

enum RefundPolicies {
    NotRefundable,
    DeletesItem,
    RevokesLicense
}

interface VendorDisplayProperties extends DisplayProperties {
    largeIcon: string,
    subtitle: string,
    originalIcon: string,
    requirementsDisplay: [],
    smallTransparentIcon: string,
    mapIcon: string,
    name: string,
    largeTransparentIcon: string
}

interface VendorCategory {
    categoryIndex: number,
    sortValue: number,
    categoryHash: number,
    quantityAvailable: number,
    showUnavailableItems: boolean,
    hideIfNoCurrency: boolean,
    hideFromRegularPurchase: boolean,
    buyStringOverride: string,
    disabledDescription: string,
    vendorItemIndexes: number[],
    isPreview: boolean,
    isDisplayOnly: boolean,
    resetIntervalMinutesOverride: number,
    resetOffsetMinutesOverride: number,
    tempItems?: any[]
}

interface VendorInteraction {
    interactionIndex: number,
    replies: {
        itemRewardsSelection: number,
        rewardSiteHash: number,
        reply: string,
        replyType: VendorReplyType
    }[],
    vendorCategoryIndex: number,
    questlineItemhash: number,
    sackInteractionList: [],
    uiInteractionType: number,
    interactionType: VendorInteractionTypes,
    rewardBlockLabel: string,
    rewardVendoeCategoryIndex: number,
    flavorLineOne: string,
    flavorLineTwo: string,
    headerDisplayProperties: ItemDisplayProperties,
    instructions: string
}

interface VendorCurrency {
    scalarDenominator: number,
    itemHash: number,
    quantity: number,
    hasConditionalVisibility: boolean
}

interface VendorItem {
    vendorItemIndex: number,
    itemHash: number,
    quantity: number,
    failiureIndexes: number[],
    priceOverrideEnabled: boolean,
    currencies: VendorCurrency[],
    refundPolicy: RefundPolicies,
    refundTimeLimit: number,
    rewardAdjusterPointerHash: number,
    creationLevels: {
        level: number
    }[],
    displayCategoryIndex: number,
    seedOverride: number,
    categoryIndex: number,
    originalCategoryIndex: number,
    weight: number,
    minimumLevel: number,
    maximumLevel: number,
    licenseUnlockHash: number,
    action: {
        executeSeconds: number,
        isPositive: boolean
    },
    displayCategory: string,
    inventoryBucketHash: number,
    visibilityScope: number,
    purchasableScope: number,
    exclusivity: number,
    sortValue: number,
    expirationTooltip: string,
    redirectToSaleIndexes: [],
    socketOverrides: []
}

interface VendorLocation {
    destinationHash: number,
    backgroundImagePath: string
}

export interface VendorDefinition {
    displayProperties: VendorDisplayProperties
    vendorProgressionType: VendorProgressionTypes,
    displayItemHash: number,
    inhibitBuying: boolean,
    factionHash: number,
    resetIntervalMinutes: number,
    resetOffsetMinutes: number,
    failiureStrings: string[],
    unlockRanges: [],
    vendorIdentifier: string,
    enabled: boolean,
    visible: boolean,
    consolidateCategories: boolean,
    unlockValueHash: number,
    actions: [],
    categories: VendorCategory[],
    originalCategories: VendorCategory[],
    displayCategories: VendorCategory[],
    interactions: VendorInteraction[],
    itemList: VendorItem[],
    services: [],
    acceptedItems: [],
    returnWithVendorRequest: boolean,
    locations: VendorLocation[],
    groups: {
        vendorGroupHash: number
    }[],
    ignoreSlateItemHashes: [],
    hash: number,
    index: number,
    redacted: boolean,
    blacklisted: boolean
}