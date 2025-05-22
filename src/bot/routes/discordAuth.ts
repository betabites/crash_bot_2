import express from "express";
import console from "console";
import fetch from "node-fetch";

export const DISCORD_AUTH_ROUTER = express.Router()

const REDIRECT_URI = "https://" + process.env["DOMAIN"] + "/discord/auth/authorised"

DISCORD_AUTH_ROUTER.get("/login", async (req, res, next) => {
    try {
        const params = new URLSearchParams()
        params.set("client_id", process.env.DISCORD_CLIENT_ID || "")
        params.set("redirect_uri", REDIRECT_URI)
        params.set("response_type", "code")
        params.set("scope", "identify")
        res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`)
    } catch (e) {
        next(e)
    }
})

DISCORD_AUTH_ROUTER.get("/authorised", async (req, res, next) => {
    const token_url = "https://discord.com/api/oauth2/token"
    const code = req.query.code as string
    console.log(req.url)
    const params = new URLSearchParams()
    params.set("grant_type", "authorization_code")
    params.set("code", code)
    params.set("redirect_uri", REDIRECT_URI)
    params.set("client_id", process.env.DISCORD_CLIENT_ID || "")
    params.set("client_secret", process.env.DISCORD_SECRET || "")

    const response = await fetch(token_url, {
        method: "post",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
    })
    const data = await response.text()
    console.log(data)

    console.log(req.body)
})
