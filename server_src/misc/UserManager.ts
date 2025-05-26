import {GuildMember} from "discord.js";
import {makeid} from "./Common.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";

export class CrashBotUser {
    readonly key: string;
    id: string | undefined
    data: {
        [key: string]: any
    } = {}
    constructor(key: string) {
        this.key = key;
    }

    static async NewKey(player_name: string, user: GuildMember | string) {
        let key = ""
        let id = typeof user === "string" ? user : user.id
        while (true) {
            key = makeid(10)
            if (!await this.CheckKey(key)) break
        }

        let req = await SafeQuery(`INSERT INTO dbo.Users (player_name, discord_id, avatar_url, shortcode)
                                   VALUES (@playername, @discordid, @avatarurl, @shortcode)`, [
            {name: "playername", type: mssql.TYPES.VarChar(30), data: player_name},
            {name: "discordid", type: mssql.TYPES.VarChar(30), data: id},
            {name: "avatarurl", type: mssql.TYPES.VarChar(200), data: typeof user === "string" ? "" : user.avatarURL()},
            {name: "shortcode", type: mssql.TYPES.VarChar(30), data: key}
        ])

        return key
    }

    static async CheckKey(key: string) {
        let req = await SafeQuery(`SELECT shortcode
                                   FROM dbo.Users
                                   WHERE shortcode = @shortcode`, [{
            name: "shortcode",
            type: mssql.TYPES.VarChar(20),
            data: key
        }])
        return req.recordset.length !== 0
    }

    static async ListPlayerNames(include_currency = true) {
        if (include_currency) {
            return (await SafeQuery(`SELECT player_name, avatar_url, currency
                                     FROM dbo.Users`, [])).recordset
        }
        else {
            (await SafeQuery(`SELECT player_name FROM dbo.Users`, [])).recordset
        }
    }

    async get() {
        let req = await SafeQuery(`SELECT *
                                   FROM dbo.Users
                                   WHERE shortcode = @shortcode`, [{
            name: "shortcode",
            type: mssql.TYPES.VarChar(10),
            data: this.key
        }])
        this.id = req.recordset[0].id
        this.data = {}
        for (let item of Object.keys(req.recordset[0])) this.data[item] = req.recordset[0][item]
        return req.recordset[0]
    }

    async getOwned() {
        if (!this.id) await this.get()
        return (await SafeQuery(`SELECT *
                                FROM dbo.ResourcePackItems
                                WHERE @ownerid`, [{name: "ownerid", type: mssql.TYPES.Int(), data: this.id || "Invalid user ID"}])).recordset
    }

    async addOwnership(path: string) {
        if (!this.id) await this.get()
        await SafeQuery(`INSERT INTO dbo.OwnedItems (owner_id, path)
                         VALUES (@ownerid, @path)`, [{
            name: "ownerid",
            type: mssql.TYPES.Int(),
            data: this.id || "invalid player ID"
        }, {name: "node:path", type: mssql.TYPES.VarChar(200), data: path}])
    }
}
