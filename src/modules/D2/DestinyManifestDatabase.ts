import sqlite3 from "sqlite3";
import {getDestinyManifest} from "bungie-net-core/lib/endpoints/Destiny2/index.js";
import {BasicBungieClient} from "bungie-net-core/lib/client.js";
import {
    DestinyActivityDefinition, DestinyDestinationDefinition,
    DestinyInventoryItemDefinition,
    DestinyStatDefinition,
    DestinyVendorDefinition
} from "bungie-net-core/lib/models/index.js";
import {groupItemsWithMatchingNames} from "../../utilities/groupItemsWithMatchingNames.js";
import {surfaceFlatten} from "../../utilities/surfaceFlatten.js";

const client = new BasicBungieClient();

export function levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;

    // Create a matrix to store the distances
    const dp = Array.from(Array(m + 1), () => Array(n + 1).fill(0));

    // Initialize the first row and column
    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }

    // Compute the distances
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,    // Deletion
                    dp[i][j - 1] + 1,    // Insertion
                    dp[i - 1][j - 1] + 1 // Substitution
                );
            }
        }
    }

    // Return the Levenshtein distance
    return dp[m][n];
}


export const destinyManifestDatabase = new sqlite3.Database("./assets/destiny/manifest.db", (err) => {
    if (err) {
        console.error(err)
    }
    else {
        console.log("Connected to my database!")
    }
})

export function getManifest() {
    return getDestinyManifest(client)
}

type SQLParameter = string | number | Date | null | boolean
type SQLParameterWithArray = SQLParameter | SQLParameterWithArray[]
type SQLQueryObject = { query: string, params: SQLParameter[] }

function parseArgument(arg: SQLParameterWithArray): {values: SQLParameter[], string: string} {
    if (Array.isArray(arg)) {
        let items = arg.map(i => parseArgument(i))
        let values = surfaceFlatten(items.map(i => i.values))
        let string = "(" + values.map(i => "?").join(", ") + ")"
        return {values, string}
    } else {
        return {
            values: [arg],
            string: "?"
        }
    }
}

export function sqlite(strings: TemplateStringsArray, ...args: SQLParameterWithArray[]): SQLQueryObject {
    // @ts-ignore
    let params: SQLParameter[] = []
    let query = ""
    for (let part in strings) {
        query += strings[part];
        const i = parseInt(part)
        if (i < args.length) {
            let arg = parseArgument(args[i])
            console.log(arg)
            query += arg.string;
            params.push(...arg.values)
        }
    }
    return {query, params: params}
}

export const MANIFEST_SEARCH = {
    custom<T = unknown>(sql: SQLQueryObject | string): Promise<T[]> {
        const topTrace = new Error()
        return new Promise((resolve, reject) => {
            let sqlParsed = ""
            let params: SQLParameter[] = []
            if (typeof sql === "string") sqlParsed = sql
            else {
                sqlParsed = sql.query
                params = sql.params
            }
            destinyManifestDatabase.all<T>(sqlParsed, params, (err, rows) => {
                if (err) {
                    console.log(sqlParsed)
                    console.trace()
                    if (err instanceof Error) {
                        err.stack += "\n" + topTrace.stack
                    }
                    reject(err)
                }
                else resolve(rows)
            });
        })
    },

    async customParseJSON<T = unknown>(sql: SQLQueryObject | string): Promise<T[]> {
        let rows = await MANIFEST_SEARCH.custom<{ json: string }>(sql)
        return rows.map(row => JSON.parse(row.json))
    },

    items: {
        async byName(name: string, limit: number = 100): Promise<Iterable<(DestinyInventoryItemDefinition & {
            distance: number
        })[]>> {
            let items = (await MANIFEST_SEARCH.customParseJSON<DestinyInventoryItemDefinition>(
                sqlite`SELECT *
                       FROM "DestinyInventoryItemDefinition"
                       WHERE json_extract(json, "$.displayProperties.name") LIKE "%" || ${name} || "%" LIMIT ${limit}`
            ))
                .map(row => ({
                    ...row,
                    distance: levenshteinDistance(row.displayProperties.name, name)
                }))
                .sort((a, b) => {
                    // @ts-ignore
                    if (a.distance > b.distance) {
                        return 1
                    }
                    // @ts-ignore
                    else if (a.distance < b.distance) {
                        return -1
                    }
                    else return 0
                })
            return groupItemsWithMatchingNames(items, (i) => i.displayProperties.name)
        },
        byHash(hash: number[]) {
            return MANIFEST_SEARCH.customParseJSON<DestinyInventoryItemDefinition>(sqlite`SELECT *
                                                                                          FROM "DestinyInventoryItemDefinition"
                                                                                          WHERE json_extract(json, "$.hash") IN ${hash}`)
        }
    },

    activities: {
        async byName(name: string, limit: number = 100): Promise<Iterable<(DestinyActivityDefinition & {
            distance: number
        })[]>> {
            let items = (await MANIFEST_SEARCH.customParseJSON<DestinyActivityDefinition>(
                sqlite`SELECT *
                       FROM "DestinyActivityDefinition"
                       WHERE json_extract(json, "$.displayProperties.name") LIKE "%" || ${name} || "%" LIMIT ${limit}`
            ))
                .map(row => ({
                    ...row,
                    distance: levenshteinDistance(row.displayProperties.name, name)
                }))
                .sort((a, b) => {
                    // @ts-ignore
                    if (a.distance > b.distance) {
                        return 1
                    }
                    // @ts-ignore
                    else if (a.distance < b.distance) {
                        return -1
                    }
                    else return 0
                })
            return groupItemsWithMatchingNames(items, (i) => i.displayProperties.name)
        },
    },

    vendors: {
        async all(limit: number = Infinity) {
            let items = (await (
                limit === Infinity ? MANIFEST_SEARCH.customParseJSON<DestinyVendorDefinition>(
                    sqlite`SELECT *
                           FROM "DestinyVendorDefinition"`
                ) : MANIFEST_SEARCH.customParseJSON<DestinyVendorDefinition>(
                    sqlite`SELECT *
                           FROM "DestinyVendorDefinition" LIMIT ${limit}`
                )
            ))
                .sort((a, b) => {
                    // @ts-ignore
                    if (a.distance > b.distance) {
                        return 1
                    }
                    // @ts-ignore
                    else if (a.distance < b.distance) {
                        return -1
                    }
                    else return 0
                })
            return groupItemsWithMatchingNames(items, (i) => i.displayProperties.name)
        },
        async byName(name: string, limit: number = 100): Promise<Iterable<DestinyVendorDefinition[]>> {
            let items = (await MANIFEST_SEARCH.customParseJSON<DestinyVendorDefinition>(
                sqlite`SELECT *
                       FROM "DestinyVendorDefinition"
                       WHERE json_extract(json, "$.displayProperties.name") LIKE "%" || ${name} || "%" LIMIT ${limit}`
            ))
                .map(row => ({
                    ...row,
                    distance: levenshteinDistance(row.displayProperties.name, name)
                }))
                .sort((a, b) => {
                    // @ts-ignore
                    if (a.distance > b.distance) {
                        return 1
                    }
                    // @ts-ignore
                    else if (a.distance < b.distance) {
                        return -1
                    }
                    else return 0
                })
            return groupItemsWithMatchingNames(items, (i) => i.displayProperties.name)
        },
        byHash(hash: number[]) {
            return MANIFEST_SEARCH.customParseJSON<DestinyVendorDefinition>(sqlite`SELECT *
                                                                                   FROM "DestinyVendorDefinition"
                                                                                   WHERE json_extract(json, "$.hash") IN ${hash}`)
        }
    },

    stats: {
        byHash(hash: number[]) {
            return MANIFEST_SEARCH.customParseJSON<DestinyStatDefinition>(sqlite`SELECT *
                                                                                 FROM "DestinyStatDefinition"
                                                                                 WHERE json_extract(json, "$.hash") IN ${hash}`)
        }
    },

    destinations: {
        byHash(hash: number[]) {
            return MANIFEST_SEARCH.customParseJSON<DestinyDestinationDefinition>(sqlite`SELECT *
                                                                                          FROM "DestinyDestinationDefinition"
                                                                                          WHERE json_extract(json, "$.hash") IN ${hash}`)
        }
    },
}