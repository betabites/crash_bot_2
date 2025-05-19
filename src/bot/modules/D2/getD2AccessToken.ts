import SafeQuery, {sql} from "../../../services/SQL.ts";

export async function getD2AccessToken(discordId: string) {
    let destinyOAuthDetails =
        (await SafeQuery<{
            D2_AccessToken: string,
            D2_MembershipId: string,
            D2_MembershipType: number
        }>(sql`SELECT D2_AccessToken, D2_MembershipId, D2_MembershipType
                                       FROM Users
                                       WHERE discord_id = ${discordId}
                                `)).recordset[0]
    if (!destinyOAuthDetails || !destinyOAuthDetails.D2_AccessToken) return null
    return {accessToken: destinyOAuthDetails.D2_AccessToken, membershipId: destinyOAuthDetails.D2_MembershipId, membershipType: destinyOAuthDetails.D2_MembershipType}
}
