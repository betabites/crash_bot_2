import {AICharacterData, CharacterData} from "./CharacterData.js";
import {EmbedBuilder, TextChannel, Webhook, WebhookClient} from "discord.js";
import SafeQuery from "../../services/SQL.js";
import mssql from "mssql";
import path from "path";
import {ChatMessage} from "chatgpt";
import openai, {AIConversation} from "../../services/ChatGPT.js";
import {RunnableToolFunction} from "openai/lib/RunnableFunction";

interface AINarration {
    type: "narration",
    narration: string
}

interface AISpeech {
    type: "speech",
    narration: string
}

interface AISceneExit {
    type: "scene_exit",
    narration: string
}

interface AINone {
    type: "none" | "bad_msg"
}

type AIMessage = AINarration | AISpeech | AISceneExit
type AIMessageIncoming = AIMessage & { from: string, priority: MessagePriority }
type ParticipantData = AICharacterData & { conversation: AIConversation, needsProcessingPriority: number}

enum MessagePriority {
    HIGH = 0,
    LOW = 1
}

export class Conversation {
    aiParticipants: Map<number, ParticipantData> = new Map()
    readonly channel: TextChannel
    private processAIMessageQueueTimeout: NodeJS.Timeout | undefined
    private narrator: CharacterData | undefined
    private heat = 0

    static async createNewConversation(channel: TextChannel) {
        // Search for AIs that may have been in a previous instance of this conversation
        const aiCharacters = await SafeQuery<AICharacterData>("SELECT * FROM dbo.UserCharacters WHERE ai_active_discord_channel=@channelid AND ai=1", [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: channel.id}
        ])
        const conversation = new Conversation(channel)
        for (let character of aiCharacters.recordset) {
            conversation.aiParticipants.set(character.id, {
                ...character,
                conversation: await AIConversation.fromSaved(
                    character.id.toString(),
                    Conversation.generateAIFunctions(conversation, character),
                    Conversation.systemPrompt(character)
                ),
                needsProcessingPriority: 0
            })
        }
        return conversation
    }

    static systemPrompt(character: CharacterData) {
        return `You must roleplay as the following character.
- DO NOT repeat messages that have already been said.
- Empty/null responds are ok. Use these when it does not make sense to respond.
- Make sure to talk in first-person, unless using the narrator.

<CharacterName>${character.name}</CharacterName>
<CharacterDescriptor>${character.description}</CharacterDescriptor>`
    }

    private constructor(channel: TextChannel) {
        this.channel = channel
    }

    async joinAIToConversation(character: AICharacterData, context: string) {
        const conversation = await AIConversation.fromSaved(
            character.id.toString(),
            Conversation.generateAIFunctions(this, character),
            Conversation.systemPrompt(character)
        )
        const participant: ParticipantData = {
            ...character, conversation,
            needsProcessingPriority: 0
        }
        void conversation.saveMessage({
            role: "system",
            content: `You've been added to a new scene. <SceneContext>${context}</SceneContext>`
        })
        this.aiParticipants.set(participant.id, participant)

        await SafeQuery("UPDATE dbo.UserCharacters SET ai_active_discord_channel=@channelid WHERE id = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: character.id},
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: this.channel.id}
        ])
        // await this.processAICharacter(participant)
    }

    async removeAIFromConversation(characterId: number, updateDB = true) {
        const character = this.aiParticipants.get(characterId)

        this.aiParticipants.delete(characterId)
        if (character) {
            if (!this.narrator) this.narrator = await this.getNarrator();
            await (await this.getWebhook(this.narrator))
                .send(`*${character.name} left the scene*`)
        }
        if (updateDB) {
            await SafeQuery("UPDATE dbo.UserCharacters SET ai_active_discord_channel=NULL WHERE id = @id", [
                {name: "id", type: mssql.TYPES.Int(), data: characterId},
            ])
        }
    }

    async getNarrator() {
        return (await SafeQuery<CharacterData>("SELECT * FROM dbo.UserCharacters WHERE id=5", [])).recordset[0]
    }

    async sendNarratorMessage(message: string, dontNotifySelectAIs: number[] = [], autoProcess = true) {
        if (!this.narrator) this.narrator = await this.getNarrator()
        await this.sendMessage(this.narrator, message, "narration", dontNotifySelectAIs, autoProcess)
    }

    async sendSceneExit(character: CharacterData, message: string, dontNotifySelectAIs: number[] = [], autoProcess = true) {
        this.removeAIFromConversation(character.id);
        if (!this.narrator) this.narrator = await this.getNarrator()
        await this.sendMessage(this.narrator, message, "scene_exit", [character.id, ...dontNotifySelectAIs], autoProcess)
    }

    async sendMessage(character: CharacterData, message: string, type: AIMessageIncoming["type"] = "speech", dontNotifySelectAIs: number[] = [], autoProcess = true) {
        let webhook = await this.getWebhook(character)
        await webhook.send({
            content: message,
            allowedMentions: {
                parse: [],
                users: [],
                roles: [],
                repliedUser: false
            }
        })

        // Pass the message on to AIs
        dontNotifySelectAIs = [character.id, ...dontNotifySelectAIs]
        console.log("Not notifying AIs:", dontNotifySelectAIs, this.aiParticipants)
        for (let ai of this.aiParticipants) {
            if (dontNotifySelectAIs.includes(ai[0])) continue
            console.log("Notifying: " + ai[1].name)
            ai[1].conversation.saveMessage({
                role: "user",
                content: message,
                name: character.name.replace(/[^a-zA-Z0-9]/g, "")
            })
            ai[1].needsProcessingPriority += 1
        }
        if (autoProcess) this.setupProcessAIMessageQueueTimeout()
    }

    private setupProcessAIMessageQueueTimeout() {
        if (this.processAIMessageQueueTimeout) clearTimeout(this.processAIMessageQueueTimeout)
        this.processAIMessageQueueTimeout = setTimeout(() => this.processAIMessageQueue(), 500)
    }


    private async processAIMessageQueue() {
        console.log("Processing AI roleplay messages")
        while (true) {
            const top_priority = Math.max(...Array.from(this.aiParticipants.values()).map(i =>
                i.needsProcessingPriority
            ))
            console.log(top_priority)
            if (top_priority === 0) return

            // Pick a random character to process that has messages to process
            const aiParticipantsArray = Array.from(this.aiParticipants.values())
                .filter(i => i.needsProcessingPriority === top_priority)

            if (aiParticipantsArray.length === 0) {
                this.heat = 0
                return
            }

            if (this.heat === 20) {
                if (!this.narrator) this.narrator = await this.getNarrator()
                const webhook = await this.getWebhook(this.narrator)
                webhook.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🔥 This conversation has overheated")
                            .setDescription("This is to prevent infinite AI conversations. Simply send another message to restart the conversation.")
                    ]
                })
                this.heat = 0
                return
            }
            this.heat += 1

            const randomIndex = Math.floor(Math.random() * aiParticipantsArray.length);
            const randomCharacter = aiParticipantsArray[randomIndex];

            let res = await randomCharacter.conversation.sendToAI()
            console.log(res)
            if (res.content) await this.sendMessage(randomCharacter, res.content.toString(), "speech", [randomCharacter.id], false)
            randomCharacter.needsProcessingPriority = 0
        }

        this.setupProcessAIMessageQueueTimeout()
    }

    async getWebhook(characterData: CharacterData) {
        const webhookSearch = await SafeQuery<{
            user_id: string,
            channel_id: string,
            webhook_id: string,
            token: string,
            timeout: Date,
            character_id: number
        }>(`SELECT *
            FROM dbo.Webhook
            WHERE channel_id = @channelid
              AND character_id = @characterid`, [
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: this.channel.id},
            {name: "characterid", type: mssql.TYPES.Int(), data: characterData.id}
        ])
        let webhookData = webhookSearch.recordset[0]
        let client: Webhook | WebhookClient
        if (!webhookData) {
            // Create a new webhook
            client = await this.channel.createWebhook({
                name: characterData.name,
                avatar: path.resolve(`./assets/character_avatars/${characterData.avatar_filename}`),
                reason: "Needed new cheese"
            })

            await SafeQuery(`INSERT INTO CrashBot.dbo.Webhook (channel_id, webhook_id, token, character_id)
                             VALUES (@channelid, @webhookid, @token, @characterid);
            `, [
                {name: "channelid", type: mssql.TYPES.VarChar(100), data: this.channel.id},
                {name: "webhookid", type: mssql.TYPES.VarChar(100), data: client.id},
                {name: "token", type: mssql.TYPES.VarChar(100), data: client.token},
                {name: "characterid", type: mssql.TYPES.Int(), data: characterData.id},
            ])
        }
        else {
            client = new WebhookClient({
                id: webhookData.webhook_id,
                token: webhookData.token
            })
        }
        return client
    }

    static generateAIFunctions(self: Conversation, character: CharacterData): RunnableToolFunction<any>[] {
        return [
            {
                type: "function",
                function: {
                    name: "send_as_narrator",
                    description: "Send a message as the narrator",
                    parse: JSON.parse,
                    function: async ({message}: {message: string}) => {
                        await self.sendNarratorMessage(message, [character.id], false)
                        return "You sent a narration message!"
                    },
                    parameters: {
                        type: 'object',
                        properties: {
                            message: {
                                type: "string"
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "leave",
                    description: "Force your character to leave the room",
                    parse: JSON.parse,
                    function: async ({message}: {message: string}) => {
                        await self.sendSceneExit(character, message, [character.id], false)
                        return "You sent a scene exit message!"
                    },
                    parameters: {
                        type: 'object',
                        properties: {
                            message: {
                                type: "string",
                                description: "A short message describing how your character left the room. For example; jeff left the room in a hurry"
                            }
                        }
                    }
                }
            }
        ]
    }
}