import pkg, {config} from 'mssql';
const { PreparedStatement, ConnectionPool, connect } = pkg;
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

interface PreparedArgument {
    name: string
    type: ISqlType,
    data: string | number | Date | null
}

export default async function SafeQuery<T = any>(sql: string, params: PreparedArgument[] = []): Promise<pkg.IResult<T>> {
    // {name: '', type: mssql.VarChar, data: '')
    let pool = await connect(sql_config)

    let request = pool.request()
    for (let param of params) request.input(param.name, param.type, param.data)
    return await request.query(sql)
}