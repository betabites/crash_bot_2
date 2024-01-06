import pkg, {config} from 'mssql';

const {PreparedStatement, ConnectionPool, connect} = pkg;
const sql_config: config = {
    user: "node_js",
    password: "rDmX#8rAXAFa&ppD",
    server: "192.168.2.140",
    database: "CrashBot",
    options: {
        trustServerCertificate: true
    },
    pool: {
        max: 10, // Maximum number of connections in the pool
        min: 0,  // Minimum number of connections in the pool
        idleTimeoutMillis: 30000, // How long a connection can be idle before being removed from the pool
    }
}
import {ISqlType, ISqlTypeFactory} from "mssql";
import mssql from "mssql";
import {deepStrictEqual} from "assert"
import {surfaceFlatten} from "../utilities/surfaceFlatten.js";

type SQLParameter = string | number | Date | null | boolean
type SQLQueryObject = { query: string, params: PreparedArgument[] }

interface PreparedArgument {
    name: string
    type: ISqlType,
    data: SQLParameter
}

export default async function SafeQuery<T = any>(query: SQLQueryObject): Promise<pkg.IResult<T>>
export default async function SafeQuery<T = any>(query: string, params: PreparedArgument[]): Promise<pkg.IResult<T>>
export default async function SafeQuery<T = any>(query: SQLQueryObject | string, params?: PreparedArgument[]): Promise<pkg.IResult<T>> {
    // {name: '', type: mssql.VarChar, data: '')
    let pool = await connect(sql_config)

    let request = pool.request()
    for (let param of (typeof query === "string" ? params as PreparedArgument[] : query.params)) request.input(param.name, param.type, param.data)
    return await request.query(typeof query === "string" ? query : query.query)
}


function determineSqlType(item: SQLParameter) {
    switch (typeof item) {
        case "bigint":
            return mssql.TYPES.BigInt()
        case "number":
            return mssql.TYPES.Int()
        case "boolean":
            return mssql.TYPES.Bit()
        case "string":
            return mssql.TYPES.VarChar()
        default:
            if (item instanceof Date) return mssql.TYPES.DateTime2()
            else if (item === null) return mssql.TYPES.Bit()
            else throw new Error("Cannot find corresponding SQL type for: " + item)
    }
}

export function sql(strings: TemplateStringsArray, ...args: (SQLParameter | SQLParameter[])[]): SQLQueryObject {
    let params: (PreparedArgument | PreparedArgument[])[] = []
    args.forEach((arg, index) => {
        if (Array.isArray(arg)) {
            params.push(arg.map((subArg, subIndex) => {
                return {
                    name: `param${index}_${subIndex}`,
                    type: determineSqlType(subArg),
                    data: subArg
                };
            }))
        } else {
            params.push({
                name: `param${index}`,
                type: determineSqlType(arg),
                data: arg
            });
        }
    });
    let query = ""
    for (let part in strings) {
        query += strings[part];
        let paramPart = params[part]
        if (Array.isArray(paramPart)) {
            query += "(" + (paramPart as PreparedArgument[]).map(item =>
                `@${item.name}`
            ).join(", ") + ")"
        }
        else if (paramPart) {
            query += `@${paramPart.name}`;
        }
    }
    return {query, params: surfaceFlatten(params)}
}

type IPutColumns = { [key: string]: SQLParameter }

function convertToSQLValue(item: SQLParameter) {
    switch (typeof item) {
        case "bigint":
            return item
        case "number":
            return item
        case "boolean":
            return item
        case "string":
            return `'${item}'`
        default:
            console.log(item, typeof item)
            throw new Error("Unsupported type")
    }
}

export class PutOperation<T extends IPutColumns> {
    readonly keys: (keyof T)[] = []
    private rows: T[] = []
    readonly tableName: string;
    readonly rowKey: null | string

    constructor(tableName: string, keys: (keyof T)[], rowKey: null | string = null) {
        this.tableName = tableName
        this.keys = keys
        this.rowKey = rowKey
    }

    addRows(rows: T[]) {
        this.rows = this.rows.concat(...rows)
    }

    addRow(row: T) {
        this.rows.push(row)
    }

    clear() {
        this.rows = []
    }

    async buildQuery() {
        let existing_items = await SafeQuery<any>(`SELECT ${
                (this.rowKey ? [...this.keys, this.rowKey] : this.keys).join(", ")
        }
                                                   FROM dbo.UserAchievements
                                                   WHERE ${(this.keys as string[]).map(
                                                           key => key + " IN (" + makeUnique(this.rows.map(rows => convertToSQLValue(rows[key]))).join(",") + ")"
                                                   ).join(" AND ")}`, [])
        let update_items: T[] = []
        let insert_items: T[] = []
        for (let row of this.rows) {
            let existing_item = existing_items.recordset.find(i => {
                let matches = true
                for (let key of this.keys) if (i[key] !== row[key]) {
                    matches = false
                    break
                }
                return matches
            })
            // @ts-ignore
            if (this.rowKey) row[this.rowKey] = existing_item[this.rowKey]
            try {
                deepStrictEqual(row, existing_item)
            } catch (e) {
                // Items do not match
                if (existing_item) update_items.push(row)
                else insert_items.push(row)
            }
        }

        let sql: string[] = []
        // if (this.rowKey) for (let item of update_items) {
        //     sql.push(`UPDATE ${this.tableName}
        //               SET ${
        //                           Object.keys(item).map(key => {
        //                               return key + "=" + item[key]
        //                           }).join(", ")
        //                   }
        //               WHERE ${this.rowKey} = ${convertToSQLValue(item[this.rowKey])}
        //     `)
        // }
        // else for (let item of update_items) {
        //     sql.push(`UPDATE ${this.tableName}
        //               SET ${
        //         Object.keys(item).map(key => {
        //             return key + "=" + item[key]
        //         }).join(", ")
        //     }
        //               WHERE ${(this.keys as string[]).map(key => key + " = " + item[key]).join(" AND ")}
        //     `)
        // }

        if (update_items.length !== 0 && this.rowKey) {
            sql.push(`UPDATE dbo.${this.tableName}
                      SET ${Object.keys(this.rows[0]).filter(i => i !== this.rowKey).map(field => field + " = t." + field).join(", ")}
                      FROM dbo.${this.tableName} AS e
                               INNER JOIN (VALUES ${update_items.map(item => "(" + Object.values(item).join(", ") + ")")}) t (${Object.keys(update_items[0]).join(", ")})
                                          ON t.id = e.id
                      WHERE e.${this.rowKey} IN (${update_items.map(i => i.id).join(", ")})
            `)
        }

        if (insert_items.length !== 0) {
            sql.push(`INSERT INTO ${this.tableName}
                          (${Object.keys(this.rows[0]).join(", ")})
                      VALUES ${insert_items.map(item => {
                          return "(" + Object.values(item).join(", ") + ")"
                      }).join(", ")}
            `)
        }

        return sql.join("; ")
    }
}

function makeUnique<T = any>(array: T[]) {
    return Array.from(new Set(array))
}