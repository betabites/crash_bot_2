import {BaseModule} from "./BaseModule.js";
import SteamAPI from 'steamapi';
import {Client} from "discord.js";
import express from "express";
import SafeQuery, {sql} from "../services/SQL.js";
import cookieParser from "cookie-parser";
import console from "console";
import fetch from "node-fetch";
import {getMembershipDataForCurrentUser} from "bungie-net-core/lib/endpoints/User/index.js";
import {D2_ROUTER, syncD2Achievements} from "./D2.js";

const STEAM = new SteamAPI(process.env["STEAM_API_KEY"] || "")
const STEAM_ROUTER = express.Router()

export class SteamModule extends BaseModule {
    constructor(client: Client) {
        super(client);
    }
}

STEAM_ROUTER.get("/login", async (req, res, next) => {
    try {
        const discord_id = req.query.discord_id as string
        const user = await SafeQuery(sql`SELECT discord_id
                                         FROM dbo.Users
                                         WHERE discord_id = ${discord_id}`)
        if (user.recordset.length === 0) throw new Error("User does not exist in DB")
        const redirect_params = new URLSearchParams()
        redirect_params.set("discord_id", discord_id)
        res.cookie("discord_id", discord_id)

        const params = new URLSearchParams()
        params.set("client_id", "44873")
        params.set("redirect_uri", "https://joemamadf7.jd-data.com/destiny/authorised?" + redirect_params.toString())
        params.set("response_type", "code")
        res.redirect(`https://www.bungie.net/en/OAuth/Authorize?${params.toString()}`)
    } catch (e) {
        next(e)
    }
})

STEAM_ROUTER.get("/authorised", cookieParser(), async (req, res, next) => {
    try {
        console.log(req.cookies)
        const discord_id = req.cookies["discord_id"]

        const token_url = "https://www.bungie.net/platform/app/oauth/token/"
        const code = req.query.code as string
        const params = new URLSearchParams()
        params.set("grant_type", "authorization_code")
        params.set("code", code)
        params.set("redirect_uri", req.url)
        // params.set("client_id", "44873")
        // params.set("client_secret", BUNGIENET_SECRET)
        console.log(token_url)
        const response = await fetch(token_url, {
            method: "post",
            headers: {
                // "Accept": "application/json",
                'Content-Type': 'application/x-www-form-urlencoded',
                // "Authorization": "Basic " + Buffer.from("44873:" + process.env.BUNGIE_CLIENT_SECRET).toString("base64")
            },
            body: params
        })
        const data = await response.text()
        if (!data) throw new Error("No data returned")
        console.log(data)
        let typedData: { access_token: string, refresh_token: string } = JSON.parse(data)
        if (!typedData.access_token || !typedData.refresh_token) throw new Error("Failed to validate")
        const access_token = typedData.access_token
        const refresh_token = typedData.refresh_token

        const client = getClient(typedData.access_token)
        const d2User = await getMembershipDataForCurrentUser(client)
        console.log(d2User)

        if (!d2User.Response.primaryMembershipId) throw new Error("Bungie account does not have a primary membership ID")
        await SafeQuery(sql`UPDATE dbo.Users
                            SET D2_AccessToken=${access_token},
                                D2_RefreshToken=${refresh_token},
                                D2_MembershipId=${d2User.Response.primaryMembershipId}
                            WHERE discord_id = ${discord_id}`)
        // Save access_token and refresh_token for future use
        console.log(access_token, refresh_token)
        res.send("Thank you for connecting your Bungie.NET account! You can now use Crash Bot to view better stats from Destiny 2. Stats may take a minute or two to fully appear while we sync your data.")

        syncD2Achievements(discord_id)
    } catch (e) {
        next(e)
    }
})