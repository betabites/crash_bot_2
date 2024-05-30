import {z} from "zod";
import {MANIFEST_SEARCH} from "./DestinyManifestDatabase.js";
import {type Loadout as DIMLoadout} from "@destinyitemmanager/dim-api-types"
import {v4 as uuidv4} from "uuid"

const test = {
    "data": {
        "destiny": {
            "page": {
                "buildPage": {
                    "__typename": "DestinyBuildPage",
                    "header": "",
                    "metadata": {
                        "title": "{{build-name}} - Destiny 2 {{class-name}} Build for {{build-type}} - Mobalytics",
                        "ogImage": "https://cdn.mobalytics.gg/assets/destiny-2/images/og-images/build-page/%7B%7Bsubclass-name%7D%7D-%7B%7Bclass-name%7D%7D-%7B%7Bbuild-type%7D%7D.jpg",
                        "description": "Check out our {{class-name}} build for Destiny 2. Everything you need to know about {{class-name}} abilities, aspects, fragments, mods, stats, Exotic Weapons and Armor. The best {{class-name}} builds for all subclasses by Mobalytics!",
                        "keywords": "",
                        "__typename": "DestinySeoMetaData"
                    },
                },
                "__typename": "DestinyPages"
            },
            "game": {
                "builds": {
                    "__typename": "DestinyBuildPagination",
                    "builds": [
                        {
                            "name": "Rest's Support Beam",
                            "screenshot": "https://cdn.mobalytics.gg/assets/destiny-2/images/builds-backgrounds/solar-warlock.png",
                            "class": {
                                "__typename": "DestinyClass",
                                "id": "warlock",
                                "name": "Warlock",
                            },
                            "damageType": {
                                "__typename": "DestinyDamageType",
                                "id": "solar",
                                "name": "Solar",
                                "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/damage-types/icons/DestinyDamageTypeDefinition_2a1773e10968f2d088b97c22b22bba9e.png",
                            },
                            "buildType": {
                                "__typename": "DestinyBuildType",
                                "name": "PvE",
                            },
                            "author": {
                                "__typename": "DestinyAuthor",
                                "name": "RestAssured",
                                "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/author/restassured.png",
                                "description": "",
                                "socialLinks": [
                                    {
                                        "__typename": "DestinyAuthorSocialLink",
                                        "link": "https://www.youtube.com/@RestAssuredYT",
                                        "type": {
                                            "name": "YouTube",
                                            "id": "youtube",
                                            "__typename": "DestinySocialLinkType"
                                        }
                                    }
                                ],
                            },
                            "superItems": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "2274196887-well-of-radiance",
                                    "name": "Well of Radiance",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/2f3615ddcd86ab7c50653d2d1847c3bf.png"
                                }
                            ],
                            "abilityItems": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "2979486801-phoenix-dive",
                                    "name": "Phoenix Dive",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/344563b4a5bee94734c4499ef83a6ac2.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "3686638442-burst-glide",
                                    "name": "Burst Glide",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/f7b19afecf6554f32225e80cc57d4fac.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "1470370538-incinerator-snap",
                                    "name": "Incinerator Snap",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/e9dee44a01ea409afe80a939b6341843.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "1841016428-healing-grenade",
                                    "name": "Healing Grenade",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/d7fa54aea967c101aeafcbc1163508d6.jpg"
                                }
                            ],
                            "aspectItems": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "83039195-icarus-dash",
                                    "name": "Icarus Dash",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/55a690bbd9cd53777df674a279422865.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "83039193-touch-of-flame",
                                    "name": "Touch of Flame",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/d6b44fe69ff876449e732b52b7d9d334.jpg"
                                }
                            ],
                            "fragmentItems": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "4180586737-ember-of-mercy",
                                    "name": "Ember of Mercy",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/5ca8c8de03f981b9c984a1f2bdea0f61.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "362132292-ember-of-benevolence",
                                    "name": "Ember of Benevolence",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/0b5cf537c6ad5d80cbdd3675d0e7134d.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "362132294-ember-of-empyrean",
                                    "name": "Ember of Empyrean",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/be99d52c12f9359fc948b4563f74e712.jpg"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "362132293-ember-of-singeing",
                                    "name": "Ember of Singeing",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/c9e392abb5417ecab2dccd85fe23c00f.jpg"
                                }
                            ],
                            "headMods": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "4255093903-solar-siphon",
                                    "name": "Solar Siphon",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/e68792457ae22cc3f3c7cd1c67caf297.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "554409585-heavy-ammo-finder",
                                    "name": "Heavy Ammo Finder",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/72ba07cae5f4d51328f7efc7c2c1755b.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "1274140735-heavy-ammo-scout",
                                    "name": "Heavy Ammo Scout",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/dce8a1f70e98285dd6535fee3c39cbf7.png"
                                }
                            ],
                            "armMods": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "1079896271-solar-loader",
                                    "name": "Solar Loader",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/5c8cc861df0028286d7f51f0c3f97c46.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "3685945823-focusing-strike",
                                    "name": "Focusing Strike",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/fe4edfb15da57cac5a49e3a246c16af4.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "377010989-impact-induction",
                                    "name": "Impact Induction",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/78ede7e0aa4ce2804699b24dd353bcb2.png"
                                }
                            ],
                            "chestMods": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "3194530172-solar-resistance",
                                    "name": "Solar Resistance",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/dc02248e7007397ecc6e4b1e141ec853.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "3410844187-void-resistance",
                                    "name": "Void Resistance",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/e45a4b8c071f2c41fe5f3cff65cc07f6.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "953234331-arc-resistance",
                                    "name": "Arc Resistance",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/076c30078d220424bc0deaccc9a9a96b.png"
                                }
                            ],
                            "legsMods": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "4087056174-recuperation",
                                    "name": "Recuperation",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/0b8f0b83b067f52aca8fe42b78e5ae3f.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "2194294579-better-already",
                                    "name": "Better Already",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/f4cea1c91001c8b8e8503298f9d8dc9c.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "1750845415-innervation",
                                    "name": "Innervation",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/35e4b93247e68ccafc83aa763abcdd9b.png"
                                }
                            ],
                            "classItems": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "4188291233-bomber",
                                    "name": "Bomber",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/c3f2da94d6cfb3c643932d3d4c41b4a0.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "4081595582-proximity-ward",
                                    "name": "Proximity Ward",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/f32b66eff97e9dd51bae87aaaff98fe9.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "11126525-powerful-attraction",
                                    "name": "Powerful Attraction",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/8a2d7ffac5f13973cab7c842edbebaf8.png"
                                }
                            ],
                            "artifactItems": [
                                {
                                    "__typename": "DestinyItem",
                                    "id": "2317325398-kindling-trigger",
                                    "name": "Kindling Trigger",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/abaf5494df7860b116e12f02ee0accc9.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "3547711350-flint-striker",
                                    "name": "Flint Striker",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/b01d02c95a86885c3da57f512a44a201.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "1328115226-rays-of-precision",
                                    "name": "Rays of Precision",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/e4f1cd438eb61d85c896294ad7fd0e0b.png"
                                },
                                {
                                    "__typename": "DestinyItem",
                                    "id": "51032917-revitalizing-blast",
                                    "name": "Revitalizing Blast",
                                    "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/71e60180bd32adc0a869a9d7384920d1.png"
                                }
                            ],
                            "statsPriority": [
                                {
                                    "__typename": "DestinyPrioritizedStat",
                                    "priority": 1,
                                    "stat": {
                                        "__typename": "DestinyStat",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/stats/icons/e26e0e93a9daf4fdd21bf64eb9246340.png",
                                    },
                                },
                                {
                                    "__typename": "DestinyPrioritizedStat",
                                    "priority": 2,
                                    "stat": {
                                        "__typename": "DestinyStat",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/stats/icons/d1c154469670e9a592c9d4cbdcae5764.png",
                                    },
                                },
                                {
                                    "__typename": "DestinyPrioritizedStat",
                                    "priority": 3,
                                    "stat": {
                                        "__typename": "DestinyStat",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/stats/icons/ea5af04ccd6a3470a44fd7bb0f66e2f7.png",
                                    },
                                },
                                {
                                    "__typename": "DestinyPrioritizedStat",
                                    "priority": 4,
                                    "stat": {
                                        "__typename": "DestinyStat",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/stats/icons/128eee4ee7fc127851ab32eac6ca91cf.png",
                                    },
                                },
                                {
                                    "__typename": "DestinyPrioritizedStat",
                                    "priority": 5,
                                    "stat": {
                                        "__typename": "DestinyStat",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/stats/icons/79be2d4adef6a19203f7385e5c63b45b.png",
                                    },
                                },
                                {
                                    "__typename": "DestinyPrioritizedStat",
                                    "priority": 6,
                                    "stat": {
                                        "__typename": "DestinyStat",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/stats/icons/202ecc1c6febeb6b97dafc856e863140.png",
                                    },
                                }
                            ],
                            "weapons": [
                                {
                                    "__typename": "DestinyDescribedItem",
                                    "item": {
                                        "__typename": "DestinyItem",
                                        "id": "4153087276-appetence",
                                        "name": "Appetence",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/c435d50b49198ebc9819093de64d1e75.jpg",
                                        "iconWatermarkUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/watermarks/a2fb48090c8bc0e5785975fab9596ab5.png",
                                        "rarity": {
                                            "__typename": "DestinyRarity",
                                            "id": "4008398120-legendary",
                                            "name": "Legendary",
                                        },
                                        "itemTypeAndTierDisplayName": "Legendary Trace Rifle",
                                    },
                                    "description": "This is used to proc **Cenotaph Mask**. Any trace rifle will work for this.",
                                },
                                {
                                    "__typename": "DestinyDescribedItem",
                                    "item": {
                                        "__typename": "DestinyItem",
                                        "id": "2907129557-sunshot",
                                        "name": "Sunshot",
                                        "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/f45a7d8e52bf0d88bbd43d4354878313.jpg",
                                        "iconWatermarkUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/watermarks/fb50cd68a9850bd323872be4f6be115c.png",
                                        "rarity": {
                                            "__typename": "DestinyRarity",
                                            "id": "2759499571-exotic",
                                            "name": "Exotic",
                                        },
                                        "itemTypeAndTierDisplayName": "Exotic Hand Cannon",
                                    },
                                    "description": "This is used for ad clear and to apply **scorch** with the artifact.",
                                }
                            ],
                            "armor": {
                                "__typename": "DestinyItem",
                                "id": "2374129871-cenotaph-mask",
                                "name": "Cenotaph Mask",
                                "iconUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/791e1f8a406356533b82a7adba087812.jpg",
                                "iconWatermarkUrl": "https://cdn.mobalytics.gg/assets/destiny-2/images/items/icons/watermarks/6026e9d64e8c2b19f302dafb0286897b.png",
                                "rarity": {
                                    "__typename": "DestinyRarity",
                                    "id": "2759499571-exotic",
                                    "name": "Exotic",
                                },
                                "itemTypeAndTierDisplayName": "Exotic Helmet",
                            },
                            "armorDescription": "Reloads your equipped trace rifle over time. Damaging a boss or champion marks that target for you and your team. When your team kills the marked target heavy ammo is generated for them and special is generated for you.",
                            "howItWorksDescription": "The goal of this build is to support your team with unlimited heavy, infinite healing, and amazing ad clear.\n\nWith **Cenotaph Mask**, you can mark targets with your trace rifle and when your team kills it **heavy** is made for them and **special** is made for you. Always make sure you are looking for enemies to mark and do it as soon as you can. Since the target also grants you special ammo, you can have the ready to use at all times while providing your team with unlimited heavy ammo.\n\nHealing is going to come from our **healing grenade**, **phoenix dive**, **well of radiance**, and **ember of mercy**. Taking **touch of flame** will allow your **healing grenade** to apply **x2 restoration** and **x2 cure** on you and your team. Using your **phoenix dive** near your team will also grant **x2 cure** for you and them. If your team manages to die you can revive them to proc **x1 restoration** on them and yourself with **ember of mercy**. When you heal from any of these ways, you are procing **ember of benevolence** for 400% increased ability regen.\n\nAd clear is going to come from **Sunshot** and your arfitact perks. Alone **Sunshot** is already very strong but when paired with the artifact perks it gets even crazier. **Flint striker** is going to allow you to become **radiant** on solar precision hits and rapid kills. While **radiant** your solar weapons can apply **scorch** with **kindling trigger** and this will play into the rest of your fragments. On top of the **Sunshot** explosions you also have **rays of precision** to cause **ignitions** on solar precision final blows. Finally, since you have a lot of ability regen, **revitalizing blast** is nice to apply **weaken** with your melee. You can now mark them with **Cenotaph** and debuff them with this.\n\nThe final things to round out the build are **ember of searing** so when you defeat a **scorched** target you make a **firesprite** and grant more **melee energy**. Picking up the **firesprite** will grant **grenade energy** and proc **x1 restoration** with **ember of mercy**. Finally, to keep your **radiant** and **restoration** up you have **ember of empyrean** to add time to them on every solar kill.\n",
                            "gameplayLoopDescription": "1. Use **Sunshot** for ad clear and to proc artifact perks\n2. Mark priority targets with **Cenotaph**\n3. Let your team get the final blow on the marked target to make **heavy** for them and **special** for you\n4. Use **healing grenade** and **phoenix dive** on teammates to proc **ember of benevolence**\n5. Pick up **firesprties** to grant **grenade energy** and proc **restoration **\n6. Get solar kills to keep **radiant** and **restoration** up\n7. Always look for targets to mark with **Cenotaph**\n",
                            "video": "",
                            "__typename": "DestinyBuild"
                        }
                    ]
                },
                "__typename": "DestinyGame"
            },
            "__typename": "DestinyQuery"
        }
    }
}

interface DIMLoadoutParameters {
    artifactUnlocks: {
        unlockedItemHashes: string[]
    }
    exoticArmorHash?: string,
    autoStatMods: boolean,
    mods: string[]
}

interface DIMLoadoutEquipped {
    hash: string,
    socketOverrides?: {
        [key: string]: string
    }
}

const classes = ["titan", "hunter", "warlock", "unknown"]

// Links known supers (such as Well of Radiance) to their respective subclass
const KNOWN_SUBCLASSES = {

}

const DESTINY_ITEM_SCHEMA = z.object({
    id: z.string(),
    name: z.string(),
    iconUrl: z.string(),
    iconWatermarkUrl: z.string().optional(),
    rarity: z.object({
        id: z.string(),
        name: z.string()
    }).optional(),
    itemTypeAndTierDisplayName: z.string().optional()
})
export const DESTINY_BUILD_SCHEMA = z.object({
    name: z.string(),
    screenshot: z.string(),
    class: z.object({
        id: z.enum(["warlock", "titan", "hunter"]),
        name: z.enum(["Warlock", "Titan", "Hunter"])
    }),
    damageType: z.object({
        id: z.string(),
        name: z.string(),
        iconUrl: z.string()
    }),
    buildType: z.object({
        name: z.string()
    }),
    author: z.object({
        name: z.string(),
        iconUrl: z.string(),
        description: z.string(),
        socialLinks: z.array(z.object({
            link: z.string(),
            type: z.object({
                name: z.string(),
                id: z.string()
            })
        }))
    }),
    superItems: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    abilityItems: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    aspectItems: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    fragmentItems: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    headMods: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    armMods: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    chestMods: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    legsMods: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    classItems: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    artifactItems: z.array(DESTINY_ITEM_SCHEMA).nullable(),
    statsPriority: z.array(z.object({
        priority: z.number(),
        stat: z.object({
            iconUrl: z.string()
        })
    })),
    weapons: z.array(z.object({
        item: z.object({
            id: z.string(),
            name: z.string(),
            iconUrl: z.string(),
            iconWatermarkUrl: z.string(),
            rarity: z.object({
                id: z.string(),
                name: z.string()
            }),
            itemTypeAndTierDisplayName: z.string()
        }),
        description: z.string()
    })),
    armor: DESTINY_ITEM_SCHEMA,
    armorDescription: z.string(),
    howItWorksDescription: z.string(),
    gameplayLoopDescription: z.string(),
    video: z.string()
})

async function fetchSubClassFromSuper(superItemHashID: number) {
    let [superItemData] = await MANIFEST_SEARCH.items.byHash([superItemHashID])
    if (!superItemData.plug) return null
    let [socketTypeDefinition] = await MANIFEST_SEARCH.socketTypeDefintions.byPlugWhitelist([
        superItemData.plug.plugCategoryHash
    ])
    let [subclassData] = await MANIFEST_SEARCH.items.bySocketType([socketTypeDefinition.hash])
    return subclassData
    // Read and search for the plug
}

export async function mobaltyicsToDIMLoadout(build: z.infer<typeof DESTINY_BUILD_SCHEMA>) {
    console.log(build.class.id)
    const dimLoadoutTemplate: DIMLoadout = {
        id: uuidv4(),
        "clearSpace": false,
        "unequipped": [],
        "name": `Loadout:+${build.name}`,
        "classType": classes.indexOf(build.class.id),
        "parameters": {
            "artifactUnlocks": {
                seasonNumber: 23,
                "unlockedItemHashes": [
                    ...build.artifactItems?.map(i => extractItemID(i.id)) ?? []
                ]
            },
            "autoStatMods": true,
            "mods": [
                ...build.headMods?.map(i => extractItemID(i.id)) ?? [],
                ...build.armMods?.map(i => extractItemID(i.id)) ?? [],
                ...build.chestMods?.map(i => extractItemID(i.id)) ?? [],
                ...build.legsMods?.map(i => extractItemID(i.id)) ?? [],
                ...build.classItems?.map(i => extractItemID(i.id)) ?? [],
            ]
        },
        "equipped": [
            ...build.weapons.map(i => ({
                hash: extractItemID(i.item.id)
            })), // WEAPONS
            {
                hash: extractItemID(build.armor.id)
            },
        ]
    }
    if (build.superItems) {
        for (let item of build.superItems) {
            let superData = await fetchSubClassFromSuper(parseInt(build.superItems[0].id))
            if (!superData) continue

            let socketOverridesRaw = await MANIFEST_SEARCH.items.byHash([
                ...build.abilityItems ?? [],
                item,
                ...build.fragmentItems ?? [],
                ...build.abilityItems ?? []
            ].map(i => extractItemID(i.id)))

            let sockets = superData.sockets?.socketEntries ?? []
            let socketOverrides: {[key: string]: number} = {}

            let socketTypes = await MANIFEST_SEARCH.socketTypeDefintions.byHash(sockets.map(socket => socket.socketTypeHash))

            for (let i in sockets) {
                let socketType = socketTypes.find(
                    t => t.hash === sockets[i].socketTypeHash
                )
                if (!socketType) continue

                let suitableItem = socketOverridesRaw.find(item =>
                    socketType.plugWhitelist.find(plug => item.plug?.plugCategoryHash === plug.categoryHash)
                )
                if (!suitableItem) continue

                socketOverrides[i] = suitableItem.hash
                socketOverridesRaw.splice(socketOverridesRaw.indexOf(suitableItem), 1)
            }

            dimLoadoutTemplate.equipped.push({
                hash: extractItemID(superData.hash.toString()),
                socketOverrides
            })
        }
    }
    return dimLoadoutTemplate
}

function extractItemID(id: string) {
    return parseInt(id.replace(/[^0-9]/g, ""))
}
