import {UserMembershipData} from "bungie-net-core/lib/models/index.js";

export type UserAuth = {token: string}
export type BungieAPIResponse<T> = {
    Response?: T,
    ErrorCode: number,
    ThrottleSeconds: number,
    ErrorStatus: string,
    Message: string,
    MessageData: any
}
const BASE_URL = "https://www.bungie.net/Platform"
export const API_KEY = "5101a63d5c944c16bf19c34e21e0d61e"

async function authorisedFetch<T = unknown>(user: UserAuth, url: string, options: RequestInit & {headers?: {[key: string]: string}} = {}): Promise<T> {
    if (!options.headers) options.headers = {}
    options.headers["Authorization"] = "Bearer " + user.token
    options.headers["Accept"] = "application/json"
    options.headers["X-API-KEY"] = API_KEY
    const req = await fetch(url, options)
    if (req.status >= 400) throw new Error(`HTTP Error: ${req.status} ${req.statusText}`)
    const data = (await req.json()) as BungieAPIResponse<T>
    if (!data.Response) throw new Error("No response")
    return data.Response
}

export async function getMembershipDataForCurrentUser(user: UserAuth) {
    return await authorisedFetch<
        UserMembershipData
    >(user, `${BASE_URL}/User/GetMembershipsForCurrentUser/`)
}