export const JSONLoadoutSchema = {
    "additionalProperties": false,
    "properties": {
        "classType": {
            "enum": [
                0,
                1,
                2,
                3
            ],
            "type": "number"
        },
        "emblemHash": {
            "description": "DestinyInventoryItemDefinition hash of an emblem to use as\nan icon for this loadout.",
            "type": "number"
        },
        "equipped": {
            "description": "List of equipped items in the loadout",
            "items": {
                "additionalProperties": false,
                "properties": {
                    "amount": {
                        "description": "Optional amount (for consumables), default to zero",
                        "type": "number"
                    },
                    "craftedDate": {
                        "description": "UTC epoch seconds timestamp of when the item was crafted. Used to\nmatch up items that have changed instance ID from being reshaped since they\nwere added to the loadout.",
                        "type": "number"
                    },
                    "hash": {
                        "description": "DestinyInventoryItemDefinition hash of the item",
                        "type": "number"
                    },
                    "id": {
                        "description": "itemInstanceId of the item (if it's instanced)",
                        "type": "string"
                    },
                    "socketOverrides": {
                        "additionalProperties": false,
                        "description": "The socket overrides for the item. These signal what DestinyInventoryItemDefinition\n(by it's hash) is supposed to be socketed into the given socket index.",
                        "patternProperties": {
                            "^[0-9]+$": {
                                "type": "number"
                            }
                        },
                        "type": "object"
                    }
                },
                "required": [
                    "hash"
                ],
                "type": "object"
            },
            "type": "array"
        },
        "name": {
            "type": "string"
        },
        "parameters": {
            "additionalProperties": false,
            "description": "Parameters that explain how this loadout was chosen (in Loadout Optimizer)\nand at the same time, how this loadout should be configured when equipped.\nThis can be used to re-load a loadout into Loadout Optimizer with its\nsettings intact, or to equip the right mods when applying a loadout if AWA is\never released.\n\nOriginally this was meant to model parameters independent of specific items,\nas a means of sharing Loadout Optimizer settings between users, but now we\njust share whole loadouts, so this can be used for any sort of parameter we\nwant to add to loadouts.\n\nAll properties are optional, but most have defaults specified in\ndefaultLoadoutParameters that should be used if they are undefined.",
            "properties": {
                "artifactUnlocks": {
                    "additionalProperties": false,
                    "description": "The artifact unlocks relevant to this build.",
                    "properties": {
                        "seasonNumber": {
                            "description": "The season this set of artifact unlocks was chosen from.",
                            "type": "number"
                        },
                        "unlockedItemHashes": {
                            "description": "The item hashes of the unlocked artifact perk items.",
                            "items": {
                                "type": "number"
                            },
                            "type": "array"
                        }
                    },
                    "required": [
                        "seasonNumber",
                        "unlockedItemHashes"
                    ],
                    "type": "object"
                },
                "exoticArmorHash": {
                    "description": "The InventoryItemHash of the pinned exotic, if any was chosen.",
                    "type": "number"
                },
                "includeRuntimeStatBenefits": {
                    "description": "When calculating loadout stats, should \"Font of ...\" mods be assumed active\nand their runtime bonus stats be included?",
                    "type": "boolean"
                },
                "mods": {
                    "description": "The mods that will be used with this loadout. Each entry is an inventory\nitem hash representing the mod item. Hashes may appear multiple times.\nThese are not associated with any specific item in the loadout - when\napplying the loadout we should automatically determine the minimum of\nchanges required to match the desired mods, and apply these mods to the\nequipped items.",
                    "items": {
                        "type": "number"
                    },
                    "type": "array"
                },
                "modsByBucket": {
                    "additionalProperties": false,
                    "description": "Mods that must be applied to a specific bucket hash. In general, prefer to\nuse the flat mods list above, and rely on the loadout function to assign\nmods automatically. However there are some mods like shaders which can't\nbe automatically assigned to the right piece. These only apply to the equipped\nitem.",
                    "patternProperties": {
                        "^[0-9]+$": {
                            "items": {
                                "type": "number"
                            },
                            "type": "array"
                        }
                    },
                    "type": "object"
                },
                "query": {
                    "description": "A search filter applied while editing the loadout in Loadout Optimizer,\nwhich constrains the items that can be in the loadout.",
                    "type": "string"
                },
                "statConstraints": {
                    "additionalProperties": false,
                    "description": "A constraint on the values an armor stat can take",
                    "properties": {
                        "maxTier": {
                            "description": "The maximum tier value for the stat. 10 if unset.",
                            "type": "number"
                        },
                        "minTier": {
                            "description": "The minimum tier value for the stat. 0 if unset.",
                            "type": "number"
                        },
                        "statHash": {
                            "description": "The stat definition hash of the stat",
                            "type": "number"
                        }
                    },
                    "required": [
                        "statHash"
                    ],
                    "type": "object"
                }
            },
            "type": "object"
        },
    },
    "required": [
        "classType",
        "equipped",
        "name"
    ],
    "type": "object"
}

