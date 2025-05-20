"use client"

import {createContext, type ReactNode} from "react";
import {DiscordSDK} from '@discord/embedded-app-sdk';
import {useQuery,} from '@tanstack/react-query'

const DISCORD_CLIENT_ID = "689226786961489926"
const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

const DiscordActivityContext = createContext(null)

export function DiscordActivityProvider(props: {children: ReactNode}) {
    const discordAuth = useQuery({
        queryKey: ["discord", "activities", "setup"],
        queryFn: () => {return setup()}
    })
    if (discordAuth.isSuccess) {
        return <DiscordActivityContext.Provider value={null}>LOADED<br />{props.children}</DiscordActivityContext.Provider>
    }
    console.error(discordAuth.error)
    if (discordAuth.isLoading) {
        return <div>Loading...</div>
    }
    return <div>
        Failed with error: {discordAuth.error?.toString()}
    </div>

}

async function setup() {
    // Wait for READY payload from the discord client
    console.log("SETUP")
    await discordSdk.ready();
    console.log("READY")

    // Pop open the OAuth permission modal and request for access to scopes listed in scope array below

    const {code} = await discordSdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'applications.commands'],
    });

    // Retrieve an access_token from your application's server
    const response = await fetch('/.proxy/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            code,
        }),
    });
    console.log(response)
    const {access_token} = await response.json() as {access_token: string};

    // Authenticate with Discord client (using the access_token)
    return await discordSdk.commands.authenticate({
        access_token,
    });
}