import {AICharacterData, CharacterData} from "./CharacterData.js";
import {EmbedBuilder, TextChannel, Webhook, WebhookClient} from "discord.js";
import SafeQuery from "../../services/SQL.js";
import mssql from "mssql";
import path from "path";
import {ChatMessage} from "chatgpt";
import ChatGPT from "../../services/ChatGPT.js";

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
type ParticipantData = AICharacterData & { messageQueue: AIMessageIncoming[] }

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
            conversation.aiParticipants.set(character.id, {...character, messageQueue: []})
        }
        return conversation
    }

    private constructor(channel: TextChannel) {
        this.channel = channel
    }

    async joinAIToConversation(character: AICharacterData, context: string) {
        const participant: ParticipantData = {
            ...character, messageQueue: [
                {type: "narration", narration: "New scene: " + context, from: "narrator", priority: MessagePriority.LOW}
            ]
        }
        this.aiParticipants.set(participant.id, participant)

        await SafeQuery("UPDATE dbo.UserCharacters SET ai_active_discord_channel=@channelid WHERE id = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: character.id},
            {name: "channelid", type: mssql.TYPES.VarChar(100), data: this.channel.id}
        ])
        await this.processAICharacter(participant)
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

    async sendNarratorMessage(message: string, dontNotifySelectAIs: number[] = []) {
        if (!this.narrator) this.narrator = await this.getNarrator()
        await this.sendMessage(this.narrator, message, "narration", dontNotifySelectAIs)
    }

    async sendSceneExit(character: CharacterData, message: string, dontNotifySelectAIs: number[] = []) {
        this.removeAIFromConversation(character.id);
        if (!this.narrator) this.narrator = await this.getNarrator()
        await this.sendMessage(this.narrator, message, "scene_exit", [character.id, ...dontNotifySelectAIs])
    }

    async sendMessage(character: CharacterData, message: string, type: AIMessageIncoming["type"] = "speech", dontNotifySelectAIs: number[] = []) {
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
            ai[1].messageQueue.push({type, narration: message, from: character.name,
                priority: message.toLowerCase().includes(ai[1].name.toLowerCase()) ? MessagePriority.HIGH : MessagePriority.HIGH
            })
        }
        this.setupProcessAIMessageQueueTimeout()
    }

    private setupProcessAIMessageQueueTimeout() {
        clearTimeout(this.processAIMessageQueueTimeout)
        this.processAIMessageQueueTimeout = setTimeout(() => this.processAIMessageQueue(), 500)
    }

    private async processAIMessageQueue() {
        while (true) {
            const min_priority = Math.min(...Array.from(this.aiParticipants.values()).map(i =>
                Math.min(...i.messageQueue.map(r => r.priority as number))
            ))

            // Pick a random character to process that has messages to process
            const aiParticipantsArray = Array.from(this.aiParticipants.values())
                .filter(i => i.messageQueue.length !== 0 && i.messageQueue.find(r => r.priority === min_priority))

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

            let character_did_something = await this.processAICharacter(randomCharacter)
            if (character_did_something) break
        }

        this.setupProcessAIMessageQueueTimeout()
    }

    static async resetAICharacterMemorySave(character: CharacterData) {
        let gpt_message = await this.resetAICharacterMemory(character)
        await SafeQuery("UPDATE dbo.UserCharacters SET ai_lastmessageid=@aichatid, ai_active_discord_channel=NULL WHERE id=@id", [
            {name: "id", type: mssql.TYPES.Int(), data: character.id},
            {name: "aichatid", type: mssql.TYPES.VarChar(100), data: gpt_message.id}
        ])
        return gpt_message
    }

    static async resetAICharacterMemory(character: { name: string, description: string }) {
        const message = `Please roleplay as the character attached. ${character.name}: ${character.description}` +
            `--- Please format your responses as such: [{"type":"narration","narration":"Jeffards entered the room"},{"type":"speech", "narration":"Hello everyone!"},{"type":"scene_exit","narration":"Jeffards left the room"} // Use this when your character leaves the scene,{"type":"none"} // Use when you do not want to do any action.`
        console.log(message)
        let gpt_message = await ChatGPT.sendMessage(message)
        console.log(gpt_message)
        if (!gpt_message.id) throw new Error("Failed to create a new ChatGPT conversation")

        return gpt_message
    }

    async processAICharacter(
        participant: ParticipantData
    ) {
        if (!participant.ai_lastmessageid) {
            participant.ai_lastmessageid = (await Conversation.resetAICharacterMemorySave(participant)).id
        }

        let data: (AINarration | AISpeech | AISceneExit | AINone)[] | null = null
        const message = JSON.stringify(participant.messageQueue)
        let gpt_message: ChatMessage = await ChatGPT.sendMessage(message, {parentMessageId: participant.ai_lastmessageid})
        for (let i = 0; i < 5; i++) {
            try {
                data = JSON.parse(gpt_message.text)
                // @ts-ignore
                if (!Array.isArray(data)) data = [data]
                // @ts-ignore
                if (!data[0].type) throw new Error("Incorrectly formatted")
                // @ts-ignore
                const type = data[0].type
                // @ts-ignore
                if (type !== "none" && !data[0].narration) throw new Error("Incorrectly formatted")
                break
            } catch (e) {
                data = null
                gpt_message = await ChatGPT.sendMessage("Please make sure that you respond in this given format. Please also remember that you are roleplaying as " + participant.name + " and not an" +
                    "y of the other characters. If you wish not to respond due to violence, T&Cs, or any other reason, please use the 'none' response.\n" +
                    '[{"type":"narration","narration":"Jeffards entered the room"},{"type":"speech", "narration":"Hello everyone!"},{"type":"scene_exit","narration":"Jeffards left the room"} // Use this when your character leaves the scene,{"type":"none"} // Use when you do not want to do any action.\n\n' + message,
                    {parentMessageId: participant.ai_lastmessageid}
                )
            }
        }

        if (!gpt_message || !data) {
            const webhook = await this.getWebhook(participant);
            webhook.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("ChatGPT did not respond in a parseable way. Unparsed message:\n\n" + gpt_message.text)
                ]
            })
            return
        }
        let did_something = false
        for (let item of data) {
            switch (item.type) {
                case "narration":
                    did_something = true
                    await this.sendNarratorMessage(item.narration, [participant.id])
                    break
                case "speech":
                    did_something = true
                    await this.sendMessage(participant, item.narration)
                    break
                case "scene_exit":
                    await this.sendSceneExit(participant, item.narration)
                    break
                case "none":
                    break
            }
        }
        let participant_repl = this.aiParticipants.get(participant.id)
        if (participant_repl) participant_repl.messageQueue = []

        await SafeQuery("UPDATE dbo.UserCharacters SET ai_lastmessageid=@messageid WHERE id=@characterid", [
            {name: "characterid", type: mssql.TYPES.Int(), data: participant.id},
            {name: "messageid", type: mssql.TYPES.VarChar(100), data: gpt_message.id}
        ])

        if (!did_something) console.log(participant.name + " chose to do nothing")
        return did_something
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
}