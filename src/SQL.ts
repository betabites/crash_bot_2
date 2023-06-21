import * as mssql from "mssql"

interface PreparedArgument {
    name: string
    type: mssql.TYPES.Type,
    data: string | number | Date
}

export function SafeQuery(sql, params: PreparedArgument[] = []): Promise<any> {
    // {name: '', type: mssql.VarChar, data: '')
    return new Promise((resolve, reject) => {
        const ps = new mssql.PreparedStatement()
        let _params = {}
        for (let param of params) {
            ps.input(param.name, param.type)
            _params[param.name] = param.data
        }

        ps.prepare(sql, err => {
            if (err) {
                reject(err);
                return
            }

            ps.execute(_params, (err, result) => {
                if (err) {
                    reject(err);
                    return
                }
                ps.unprepare(err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(result)
                })
            })
        })
    })
}

export async function Connect() {
    await mssql.connect("Server=192.168.2.140,1433;Database=CrashBot;User Id=node_js;Password=rDmX#8rAXAFa&ppD;trustServerCertificate=true")
}