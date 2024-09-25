import {BaseModule} from "./BaseModule.js";
import SafeQuery, {override, SafeTransaction, sql} from "../services/SQL.js";
import mssql from "mssql";
import {ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder} from "discord.js";
import {EVENT_IDS} from "./GameAchievements.js";

export type GameSessionData = {
    id: string,
    game_id: EVENT_IDS,
    start: Date,
    hidden_discord_channel: string | null,
    description: string,

    // A link that directs back to the location where this event was created.
    event_creation_channel?: string,
    event_creation_message?: string,

    min_players?: number | null,
    max_players?: number | null
}

export abstract class GameSessionModule extends BaseModule {
    embedConfig = {
        title: "New event created",
        thumbnail: "https://cdn4.iconfinder.com/data/icons/small-n-flat/24/calendar-1024.png",
    }

    readonly game_id: number;
    static sessionBindings = new Map<EVENT_IDS, GameSessionModule>

    onUserJoinsSession = (session: string, user_id: string) => {}
    onUserLeavesSession = (session: string, user_id: string) => {}
    buildInviteEmbed = (data: GameSessionData) => {
        return new EmbedBuilder()
            .setTitle(this.embedConfig.title)
            .setThumbnail(this.embedConfig.thumbnail)
            .setDescription(`${data.description}\n<t:${Math.round(data.start.getTime() / 1000)}:R>`)
    }
    buildInviteComponents = (data: GameSessionData) => {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`join_event_${data.id}`)
                    .setLabel("Join this event")
                    .setStyle(ButtonStyle.Primary)
            )
    }

    static async getGameSession(id: string): Promise<GameSessionData | undefined> {
        let res = await SafeQuery<GameSessionData>(sql`
                SELECT start, id, hidden_discord_channel, game_id, min_players, max_players
                FROM GameSessions
                WHERE id = ${override(mssql.TYPES.UniqueIdentifier(), id)}
            `)
        return res.recordset[0]
    }

    static async getAllGameSessions(): Promise<GameSessionData[]> {
        let res = await SafeQuery<GameSessionData>(sql`
                SELECT start, id, hidden_discord_channel, game_id, min_players, max_players
                FROM GameSessions
            `)
        return res.recordset
    }


    constructor(client: Client, game_id: EVENT_IDS) {
        super(client);
        this.game_id = game_id
        GameSessionModule.sessionBindings.set(game_id, this)
        console.log("BOUND GAME ID", game_id)
    }

    async createNewGameSession(
        start: Date,
        description = "New session",
        event_creation_channel?: string,
        event_creation_message?: string
    ) {
        let id = crypto.randomUUID()
        let res = await SafeQuery(sql`
            INSERT INTO GameSessions (start, id, game_id, description, event_creation_channel, event_creation_message)
            VALUES (${start}, ${override(mssql.TYPES.UniqueIdentifier(), id)}, ${this.game_id}, ${description}, ${event_creation_channel ?? null}, ${event_creation_message ?? null});
        `)
        return id
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

    getGameSession(start: Date): Promise<GameSessionData | undefined>
    getGameSession(start: Date): Promise<GameSessionData>
    getGameSession(id: string): Promise<GameSessionData | undefined>
    async getGameSession(start_or_id: Date | string): Promise<GameSessionData | undefined> {
        if (start_or_id instanceof Date) {
            let res = await SafeQuery<GameSessionData>(sql`
                SELECT start, id, hidden_discord_channel, description, game_id
                FROM GameSessions
                WHERE start = ${start_or_id}
                  AND game_id = ${this.game_id}
            `)
            return res.recordset[0]

        }
        else {
            let res = await SafeQuery<GameSessionData>(sql`
                SELECT start, id, hidden_discord_channel, description
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
