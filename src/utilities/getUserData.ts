import {GuildMember} from "discord.js";
import SafeQuery from "../services/SQL.js";
import mssql from "mssql";
import {CrashBotUser} from "../misc/UserManager.js";

export enum SPEECH_MODES {
    NORMAL,
    BABY_SPEAK,
    SIMPLETON,
    SMART_ASS,
    COLOURFUL,
    LISP,
    FURRY,
    KIWI,
    LINUX_CHAD,
    SWIFTIE,
    DRUNK,
    WHITE_TRASH_BREAD,
    GERMAN_CHEESE,
    PEANUT_NUTTER,
    ALCOHOLIC_BUTTER,
    BREAD,
    CHEESE,
    PEANUT_BUTTER,
    BUTTER,
    SHAGGY,
    JAM,
    KEESH,
    TANIKS,
    SMART_TANIKS,
    WOOD_PALLETS
}

export async function getUserData(member: GuildMember | string): Promise<{
    id: number,
    player_name: string,
    discord_id: string,
    avatar_url: string,
    shortcode: string,
    currency: number,
    nominated: string,
    experimentAIQuoteResponse: boolean,
    experimentWords: boolean,
    experimentBabyWords: boolean,
    mc_x: number,
    mc_y: number,
    mc_z: number,
    mc_dim: string,
    mc_connected: boolean,
    mc_id: string,
    mc_detailed_scoreboard: boolean,
    PotatoHP: number,
    auto_record_voice: boolean,
    D2_AccessToken: string,
    D2_RefreshToken: string,
    D2_MembershipId: number,
    D2_AccessTokenExpiry: Date,
    D2_MembershipType: number,
    simpleton_experiment: boolean,
    speech_mode: SPEECH_MODES
}> {
    let id = typeof member === "string" ? member : member.id
    let req = await SafeQuery(`SELECT *
                               FROM dbo.Users
                               WHERE discord_id = @discordid`, [
        {name: "discordid", type: mssql.TYPES.VarChar(20), data: id}
    ])
    if (req.recordset.length === 0) {
        let key = await CrashBotUser.NewKey("", id)
        req = await SafeQuery(`SELECT *
                               FROM dbo.Users
                               WHERE discord_id = @discordid`, [
            {name: "discordid", type: mssql.TYPES.VarChar(20), data: id}
        ])
    }
    return req.recordset[0]
}
