import {BaseModule} from "./BaseModule.js";
import SafeQuery, {override, SafeTransaction, sql} from "../services/SQL.js";
import mssql from "mssql";
import {Client} from "discord.js";

export type GameSessionData = {
    id: string,
    start: Date,
    hidden_discord_channel: string | null
}

export abstract class GameSessionModule extends BaseModule {
    readonly game_id: number;

    onUserJoinsSession = (session: string, user_id: string) => {}
    onUserLeavesSession = (session: string, user_id: string) => {}

    constructor(client: Client, game_id: number) {
        super(client);
        this.game_id = game_id;
    }

    async createNewGameSession(start: Date) {
        let res = await SafeQuery<{ NewRecordID: string }>(sql`
            DECLARE @NewID uniqueidentifier;
            SET @NewId = NEWID();
            INSERT INTO GameSessions (start, id, game_id)
            VALUES (${start}, @NewId, ${this.game_id});
            SELECT @NewId AS NewRecordID
        `)
        return res.recordset[0].NewRecordID
    }

    async attachDiscordChannelToSession(session_id: string, channel_id: string) {
        await SafeQuery(sql`UPDATE GameSessions SET hidden_discord_channel=${channel_id} WHERE id = ${override(mssql.TYPES.UniqueIdentifier(), session_id)}`)
    }

    async deleteGameSession(session: GameSessionData) {
        if (session.hidden_discord_channel) {
            this.client.channels.fetch(session.hidden_discord_channel).then(channel => void channel?.delete())
        }

        await SafeTransaction((query) => {
            query(sql`DELETE FROM UserGameSessionsSchedule WHERE session_id = ${override(mssql.TYPES.UniqueIdentifier(), session.id)}`)
            query(sql`DELETE FROM GameSessions WHERE id = ${override(mssql.TYPES.UniqueIdentifier(), session.id)}`)
        })
    }

    async cleanUpSessions() {
        // Delete old sessions
        let oldSessions = await SafeQuery<GameSessionData>(sql`
            SELECT start, id, hidden_discord_channel
            FROM GameSessions
            WHERE game_id = ${this.game_id} AND start < SYSDATETIME()
            ORDER BY start ASC
        `)
        for (let session of oldSessions.recordset) this.deleteGameSession(session)
    }

    getGameSession(start: Date, createIfDoesNotExist?: false): Promise<GameSessionData | undefined>
    getGameSession(start: Date, createIfDoesNotExist: true): Promise<GameSessionData>
    getGameSession(id: string): Promise<GameSessionData | undefined>
    async getGameSession(start_or_id: Date | string, createIfDoesNotExist?: boolean): Promise<GameSessionData | undefined> {
        if (start_or_id instanceof Date) {
            let res = await SafeQuery<GameSessionData>(sql`
                SELECT start, id, hidden_discord_channel
                FROM GameSessions
                WHERE start = ${start_or_id}
                  AND game_id = ${this.game_id}
            `)
            if (res.recordset[0]) return res.recordset[0]
            if (createIfDoesNotExist) return {
                start: start_or_id,
                id: await this.createNewGameSession(start_or_id),
                hidden_discord_channel: null
            }
            return

        }
        else {
            let res = await SafeQuery<GameSessionData>(sql`
                SELECT start, id, hidden_discord_channel
                FROM GameSessions
                WHERE id = ${override(mssql.TYPES.UniqueIdentifier(), start_or_id)}
                  AND game_id = ${this.game_id}
            `)
            return res.recordset[0]
        }
    }

    async getAllGameSessions(): Promise<GameSessionData[]> {
        let res = await SafeQuery<GameSessionData>(sql`
            SELECT start, id, hidden_discord_channel
            FROM GameSessions
            WHERE game_id = ${this.game_id}
            ORDER BY start ASC
        `)
        return res.recordset
    }


    async getUsersSubscribedToSession(session_id: string) {
        let res = await SafeQuery<{
            discord_id: string
        }>(sql`
            SELECT discord_id
            FROM dbo.userGameSessionsSchedule
            WHERE session_id = ${override(mssql.TYPES.UniqueIdentifier(), session_id)}`)
        return res.recordset.map(i => i.discord_id)
    }

    async getUserSessionSubscriptions(user_id: string) {
        let res = await SafeQuery<{
            session_id: string
        }>(sql`
            SELECT session_id
            FROM dbo.userGameSessionsSchedule
            WHERE discord_id = ${user_id}`)
        return res.recordset.map(i => i.session_id)
    }

    async subscribeUserToSession(discord_id: string, session_id: string) {
        await SafeQuery(sql`INSERT INTO dbo.UserGameSessionsSchedule (session_id, game_id, discord_id) VALUES (${session_id}, ${this.game_id}, ${discord_id})`)
        void this.onUserJoinsSession(session_id, discord_id)
    }

    async unsubscribeUserFromSession(discord_id: string, session_id: string) {
        await SafeQuery(sql`DELETE FROM dbo.UserGameSessionsSchedule WHERE session_id = ${override(mssql.TYPES.UniqueIdentifier(), session_id)} AND game_id = ${this.game_id} AND discord_id = ${discord_id}`)
        void this.onUserLeavesSession(session_id, discord_id)
    }
}
