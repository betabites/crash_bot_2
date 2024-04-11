import {AIConversation} from "../../services/ChatGPT.js";

export interface CharacterData {
    id: number,
    owner_discord_id: string,
    name: string,
    description: string,
    ai: boolean,
    avatar_filename: string,
    ai_lastmessageid: string,
    ai_active_discord_channel: string
}

export type AICharacterData = CharacterData & {ai: true}