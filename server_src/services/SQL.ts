import pkg from 'mssql';
import mssql, {config, ISqlType} from 'mssql';
import {deepStrictEqual} from "node:assert"
import {surfaceFlatten} from "../bot/utilities/surfaceFlatten.js";
import dotenv from "dotenv";
import {AsyncLocalStorage} from 'node:async_hooks';
import {ChannelType} from "discord.js";

const {connect} = pkg;
dotenv.config()
const sql_config: config = {
    user: process.env["MSSQL_USERNAME"] ?? '',
    password: process.env["MSSQL_PASSWORD"] ?? '',
    server: process.env["MSSQL_SERVER"] ?? '',
    database: process.env["MSSQL_DATABASE"] ?? '',
    options: {
        trustServerCertificate: true
    },
    pool: {
        max: 10, // Maximum number of connections in the pool
        min: 0,  // Minimum number of connections in the pool
        idleTimeoutMillis: 30000, // How long a connection can be idle before being removed from the pool
    }
}

class SQLParameterOverride {
    readonly data: any;
    readonly type: ISqlType;
    constructor(type: mssql.ISqlType, data: any) {
        this.data = data
        this.type = type
    }

}
type SQLParameter = string | number | Date | null | boolean
type SQLParameterWithUnsafe = SQLParameter | UnsafeParam
type SQLQueryObject = {
    query: string,
    params: (PreparedArgument & {type: ISqlType})[]
}

interface PreparedArgument {
    name: string
    type: ISqlType,
    data: SQLParameterWithUnsafe
}
const UnsafeSymbol = Symbol("SQL unsafe param")
type PreparedArgumentUnsafe = Omit<PreparedArgument, "type"> & { type: typeof UnsafeSymbol | ISqlType }

type UnsafeParam = {
    [UnsafeSymbol]: string
}

export function UNSAFE_SQL_PARAM<T extends { toString(): string }>(parameter: T) {
    return {
        [UnsafeSymbol]: parameter.toString()
    }
}

/**
 * @deprecated All new code should use the contextual SQL API
 * @param query
 * @constructor
 */
export default async function SafeQuery<T = any>(query: SQLQueryObject): Promise<pkg.IResult<T>>
export default async function SafeQuery<T = any>(query: string, params: PreparedArgument[]): Promise<pkg.IResult<T>>
export default async function SafeQuery<T = any>(query: SQLQueryObject | string, params?: PreparedArgument[]): Promise<pkg.IResult<T>> {
    // {name: '', type: mssql.VarChar, data: '')
    let pool = await connect(sql_config)

    let request = pool.request()

    for (let param of (typeof query === "string" ? params as PreparedArgument[] : query.params)) request.input(param.name, param.type, param.data)
    let res
    try {
        res = await request.query(typeof query === "string" ? query : query.query)
    } catch (e) {
        console.error("SQL ERROR")
        console.error(e)
        throw e
    }
    return res
}

export type SafeTransactionQueryFunc<T = unknown> = (sql: SQLQueryObject) => Promise<pkg.IResult<T>>
type MaybePromise<T> = Promise<T> | T

const sqlContext = new AsyncLocalStorage<{sql: SafeTransactionQueryFunc}>();

export async function SafeTransaction<T extends unknown>(handler: (queryFunc: SafeTransactionQueryFunc) => MaybePromise<T>) {
    let pool = await connect(sql_config)
    let transaction = pool.transaction()
    let promises: Promise<unknown>[] = []
    await transaction.begin()

    const queryFunc: SafeTransactionQueryFunc = <T = unknown>(query: SQLQueryObject): Promise<pkg.IResult<T>> => {
        let request = pool.request()
        for (let param of query.params) request.input(param.name, param.type, param.data)
        let promise = request.query(query.query)
        promises.push(promise)
        return promise
    }

    try {
        let res = await handler(queryFunc);
        // Ensure all outstanding promises are settled first
        await Promise.allSettled(promises)
        if (res === false) {
            throw new Error("Transaction cancelled")
        }
        await transaction.commit()
        return res
    } catch (e) {
        console.error("A database transaction step failed")
        console.error(e)
        await transaction.rollback()
        throw e
    }
}

function determineSqlType(item: SQLParameterWithUnsafe): PreparedArgumentUnsafe["type"] {
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
            else if (item[UnsafeSymbol]) return UnsafeSymbol
            else throw new Error("Cannot find corresponding SQL type for: " + item)
    }
}

export function override(type: ISqlType, data: any) {
    return new SQLParameterOverride(type, data)
}

/**
 * @deprecated All new code should use the contextual SQL API
 * @param strings
 * @param args
 */
export function sql(strings: TemplateStringsArray, ...args: (SQLParameterWithUnsafe | SQLParameterOverride | (SQLParameter | SQLParameterOverride)[])[]): SQLQueryObject {
    let params: (PreparedArgumentUnsafe | PreparedArgument[])[] = []
    args.forEach((arg, index) => {
        if (Array.isArray(arg)) {
            params.push(arg.map((subArg, subIndex) => {
                if (subArg instanceof SQLParameterOverride) {
                    return {
                        name: `param${index}_${subIndex}`,
                        type: subArg.type,
                        data: subArg.data
                    };
                }
                else {
                    let type = determineSqlType(subArg)
                    if (type === UnsafeSymbol) throw new Error("Cannot parse unsafe parameters in an input array")
                    return {
                        name: `param${index}_${subIndex}`,
                        type,
                        data: subArg
                    };
                }
            }))
        }
        else {
            if (arg instanceof SQLParameterOverride) {
                params.push({
                    name: `param${index}`,
                    type: arg.type,
                    data: arg.data
                });
            }
            else {
                params.push({
                    name: `param${index}`,
                    type: determineSqlType(arg),
                    data: arg
                });
            }
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
            // @ts-expect-error
            if (paramPart.type === UnsafeSymbol) query += paramPart.data[UnsafeSymbol]
            else query += `@${paramPart.name}`;
        }
    }
    // @ts-ignore
    return {query, params: surfaceFlatten(params.filter(i => Array.isArray(i) || i.type !== UnsafeSymbol))}
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

    async #buildQueryPart(rows: T[]) {
        let existing_items = await SafeQuery<any>(`SELECT ${
            (this.rowKey ? [...this.keys, this.rowKey] : this.keys).join(", ")
        }
                                                   FROM dbo.UserAchievements
                                                   WHERE ${(this.keys as string[]).map(
            key => key + " IN (" + makeUnique(rows.map(rows => convertToSQLValue(rows[key]))).join(",") + ")"
        ).join(" AND ")}`, [])
        let update_items: T[] = []
        let insert_items: T[] = []
        for (let row of rows) {
            let existing_item = existing_items.recordset.find(i => {
                let matches = true
                for (let key of this.keys) if (i[key] !== row[key]) {
                    matches = false
                    break
                }
                return matches
            })
            // @ts-ignore
            if (this.rowKey && existing_item) row[this.rowKey] = existing_item[this.rowKey]
            try {
                deepStrictEqual(row, existing_item)
            } catch (e) {
                // Items do not match
                if (existing_item) update_items.push(row)
                else insert_items.push(row)
            }
        }

        let sql: string[] = []

        if (update_items.length !== 0 && this.rowKey) {
            sql.push(`UPDATE dbo.${this.tableName}
                      SET ${Object.keys(rows[0]).filter(i => i !== this.rowKey).map(field => field + " = t." + field).join(", ")}
                      FROM dbo.${this.tableName} AS e
                               INNER JOIN (VALUES ${update_items.map(item => "(" + Object.values(item).join(", ") + ")")}) t (${Object.keys(update_items[0]).join(", ")})
                                          ON t.id = e.id
                      WHERE e.${this.rowKey} IN (${update_items.map(i => i.id).join(", ")})
            `)
        }

        if (insert_items.length !== 0) {
            sql.push(`INSERT INTO ${this.tableName}
                          (${Object.keys(insert_items[0]).join(", ")})
                      VALUES ${insert_items.map(item => {
                return "(" + Object.values(item).join(", ") + ")"
            }).join(", ")}
            `)
        }
        return sql
    }

    async buildQuery() {
        let sql: string[] = []
        while (this.rows.length !== 0) {
            let results = await this.#buildQueryPart(this.rows.splice(0, 1000))
            results.forEach(result => sql.push(result))
        }
        return sql.join("; ")
    }
}

function generateInsertStatement(items: Record<string, string>[]) {
    let keys = new Set<string>()
    for (let item of items) for (let key of Object.keys(item)) keys.add(key)

    let keys_array = Array.from(keys)
    let values = items.map(item => {
        keys_array.map(key => item[key] ? item[key] : "NULL").join(", ")
    })
}

function makeUnique<T = any>(array: T[]) {
    return Array.from(new Set(array))
}

//
//
//      CONTEXTUAL SQL API
//      All new code should use the
//
//

export async function useSQLContext<T>(func: () => T ): Promise<Awaited<T>> {
    return await SafeTransaction(async (queryFunc) => {
        return sqlContext.run({sql: queryFunc}, func)
    })
}

export function contextSQL<T>(...params: Parameters<typeof sql>) {
    const query = sql(...params)
    console.log(sqlContext.getStore())
    let handler = sqlContext.getStore()?.sql ?? SafeQuery
    return handler(query) as Promise<pkg.IResult<T>>
}

export function SQLContextWrapper<ARGS extends any[], T>(originalMethod: (...args: ARGS) => T, context: ClassMethodDecoratorContext<any>) {
    function replacementMethod(this: any, ...args: ARGS) {
        // console.log(thisArg)
        let self = this
        return useSQLContext(() => originalMethod.call(this, ...args))
    }

    return replacementMethod
}


