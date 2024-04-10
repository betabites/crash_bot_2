import {BaseModule} from "./BaseModule.js";
import SafeQuery, {sql} from "../services/SQL.js";
import express from "express";

export enum GAME_IDS {
    DESTINY2 = 0
}

export type AchievementProgress = {
    id: number
    discord_id: string,
    game_id: GAME_IDS,
    progress: number,
    achievement_id: string
}

const BEARER_KEY = "GytGsN$nEb4BRg?fRsi?Dga$mk&Lcj?Qka#Sh?3!"

export class GameAchievements extends BaseModule {
    static async getProgress(discord_id: string, game_id: GAME_IDS, achievement_id: string) {
        return (await SafeQuery<AchievementProgress>(sql`SELECT *
                                                         FROM dbo.UserAchievements
                                                         WHERE discord_id = ${discord_id}
                                                           AND game_id = ${game_id}
                                                           AND achievement_id = ${achievement_id}`)).recordset[0];
    }

    static async putProgress(progress: Omit<AchievementProgress, "id">) {
        let res = await SafeQuery(sql`UPDATE dbo.UserAchievements
                                      SET progress = ${progress.progress}
                                      WHERE discord_id = ${progress.discord_id}
                                        AND game_id = ${progress.game_id}
                                        AND achievement_id = ${progress.achievement_id}
        `);
        if (progress.achievement_id === "3185876102") console.log(res)
        if (res.rowsAffected[0] === 0) await GameAchievements.addProgress(progress)
    }

    static async updateProgress(progress: AchievementProgress) {
        await SafeQuery(sql`UPDATE dbo.UserAchievements
                            SET progress = ${progress.progress}
                            WHERE id = ${progress.id}
        `);
    }

    static async addProgress(progress: Omit<AchievementProgress, "id">) {
        await SafeQuery(sql`INSERT INTO dbo.UserAchievements (discord_id, game_id, progress, achievement_id)
                            VALUES (${progress.discord_id}, ${progress.game_id}, ${progress.progress},
                                    ${progress.achievement_id})`);
    }
}

export const ACHIEVEMENTS_ROUTER = express.Router()
ACHIEVEMENTS_ROUTER.get("/:game_id/users/:discord_id/achievements/:achievement_id", async (req, res, next) => {
    try {
        // Authorise the connection
        if (req.header("Authorization") !== "Bearer " + BEARER_KEY) {
            res.status(403)
            res.send()
            return
        }
        let game_id: GAME_IDS = parseInt(req.params.game_id)
        if (isNaN(game_id) || !GAME_IDS[game_id]) {
            res.status(500)
            res.send()
            return
        }

        let achievement = await GameAchievements.getProgress(req.params.discord_id, game_id, req.params.achievement_id)
        res.json(achievement)
    } catch (e) {
        next(e)
    }
})