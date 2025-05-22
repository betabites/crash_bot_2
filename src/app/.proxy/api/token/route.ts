// app/.proxy/api/token/route.ts
import {NextResponse} from 'next/server'

const DISCORD_CLIENT_ID = "689226786961489926"
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? ""

if (!DISCORD_CLIENT_SECRET) {
    throw new Error('DISCORD_CLIENT_SECRET is not defined')
}

export async function POST(request: Request) {
    try {
        const { code } = await request.json()

        if (!code) {
            return NextResponse.json(
                { error: 'Authorization code is required' },
                { status: 400 }
            )
        }

        console.log({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            // redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}`, // Adjust this to match your OAuth redirect URI
        })
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                // redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}`, // Adjust this to match your OAuth redirect URI
            }),
        })

        const data = await tokenResponse.json()

        if (!tokenResponse.ok) {
            return NextResponse.json(
                { error: 'Failed to exchange code for token', details: data },
                { status: tokenResponse.status }
            )
        }

        return NextResponse.json(data)
    } catch (error) {
        console.error('Token exchange error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}