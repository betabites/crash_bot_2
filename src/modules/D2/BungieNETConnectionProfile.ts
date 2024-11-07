import {BungieClientProtocol, BungieFetchConfig} from 'bungie-net-core';
import {config} from "dotenv";

config();
export class BungieClient implements BungieClientProtocol {
    // while not required, sometimes you will need an access_token for priviledged routes
    private access_token: undefined | string;

    constructor(access_token?: string) {
        this.access_token = access_token
    }


    // this method is required
    async fetch<T>(config: BungieFetchConfig): Promise<T> {
        const apiKey = process.env.BUNGIE_API_KEY!;
        console.log(apiKey)

        const headers: Record<string, string> = {
            ...config.headers,
            // we must provide the API key in the headers
            'X-API-KEY': apiKey
        };

        // attach the acces_token if we have it as a Bearer token
        if (this.access_token) {
            headers['Authorization'] = `Bearer ${this.access_token}`;
        }

        const payload = {
            method: config.method,
            body: config.body,
            headers
        };

        const res = await fetch(config.url, payload);
        const data = await res.text();
        if (!res.ok) {
            console.error("An error occured while fetching data from Bungie.net:", config)
            throw data
        }
        return JSON.parse(data) as T;
    }
}


export const BungieNETConnectionProfile = new BungieClient();
