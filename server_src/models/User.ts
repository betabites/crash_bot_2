import {contextSQL} from "../services/SQL.js";

type UserData = {
    id : number | null // Use discord_id instead
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
    mc_voiceConnectionId: string,
    mc_detailed_scoreboard: boolean,
    PotatoHP: number,
    auto_record_voice: boolean,
    D2_AccessToken: string,
    D2_RefreshToken: string,
    D2_MembershipId: number,
    D2_AccessTokenExpiry: Date,
    D2_MembershipType: number,
    simpleton_experiment: boolean,
    speech_mode: number,
    level_old: number,
    points_old: number,
    level: number,
    points: number,
    cappedPoints: number
}

const MAX_CAPPED_POINTS = 120

export class User {
    static calculatePointGrant(
        addPoints: number,
        recordData: {level: number, points: number, cappedPoints: number},
        capped = false
    ) {
        if (capped && recordData.cappedPoints + addPoints > MAX_CAPPED_POINTS ) {
            addPoints = MAX_CAPPED_POINTS - recordData.cappedPoints
        }

        if (addPoints === 0) {
            // Do nothing
            return {level: recordData.level, points: recordData.points}
        }

        let level = recordData.level
        let points = recordData.points + addPoints // 505

        while (true) {
            const levelGate = User.calculateLevelGate(level + 1) // 500
            if (levelGate > points) break

            points -= levelGate // 5
            level++
        }

        return {level, points: addPoints}
    }

    static calculateLevelGate(targetLevel: number) {
        return Math.round(targetLevel ** 2.05) + 20
    }
    constructor(readonly discord_id: string) {}

    async get() {
        let res = await contextSQL<UserData>`SELECT * FROM dbo.Users WHERE discord_id = ${this.discord_id}`
        let data = res.recordset[0]
        if (!data) throw new Error(`User ${this.discord_id} not found`)
        return data
    }


    async grantPoints(addPoints: number, reason: string, capped = false) {
        let userData = await this.get()
        let {level, points} = User.calculatePointGrant(addPoints, userData, capped)
        let leveled_up = level !== userData.level
        await this.setLevel(level)

        if (points !== 0) {
            await contextSQL`INSERT INTO Points (discord_id, reason, points)
                           VALUES (${this.discord_id}, ${reason}, ${points})`
        }

        return {level, points, leveled_up}
    }

    setLevel(level: number, points: number = 0) {
        return contextSQL`UPDATE dbo.Users SET level = ${level}, points = ${points} WHERE discord_id = ${this.discord_id}`
    }
}