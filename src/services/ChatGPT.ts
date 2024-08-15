import {ChatGPTAPI} from "chatgpt";
import OpenAI from "openai"
import {Chat, ChatCompletionAssistantMessageParam} from "openai/resources/index";
import {RunnableToolFunction} from "openai/lib/RunnableFunction";
import crypto from "crypto";
import SafeQuery, {sql} from "./SQL.js";
import {EventEmitter} from "node:events";
import ChatCompletionMessageParam = Chat.ChatCompletionMessageParam;

const ChatGPT = new ChatGPTAPI({
    apiKey: process.env["OPENAI_API_KEY"] ?? '',
    completionParams: {
        model: "gpt-3.5-turbo-1106"
    }
})

export default ChatGPT

const openai: OpenAI = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"] || "",
})

type ConversationEvents = {
    onAIResponse: [ChatCompletionMessageParam]
}

/**
 * Represents a conversation with an AI assistant.
 * @extends EventEmitter
 */
export class AIConversation extends EventEmitter {
    private messages: ChatCompletionMessageParam[] = []
    private functions: RunnableToolFunction<any>[] = []
    readonly id: string
    protected delayedSendTimer: NodeJS.Timeout | null = null
    #controller: AbortController | undefined

    /**
     * Creates an AIConversation instance using saved conversation data.
     *
     * @param {string} id - The ID of the conversation.
     * @param {RunnableToolFunction<any>[]} [functions=[]] - An array of runnable tool functions to be used in the conversation.
     * @param {string} [systemPrompt] - The system prompt to be added as the first message in the conversation.
     *
     * @returns {Promise<AIConversation>} - A Promise that resolves to an AIConversation instance.
     */
    static async fromSaved(id: string, functions: RunnableToolFunction<any>[] = [], systemPrompt?: string) {
        let messages = await SafeQuery<{content: string}>(sql`SELECT content FROM AiConversationHistory WHERE conversation_id = ${id}`);
        let messages_parsed: ChatCompletionMessageParam[] = messages.recordset.map(record => JSON.parse(record.content))
        if (systemPrompt) messages_parsed.unshift({
            role: "system",
            content: systemPrompt
        })
        return new AIConversation(
            messages_parsed,
            functions,
            id
        )
    }

    get isNew() {return this.messages.length === 0}

    get controller() {return this.#controller}

    /**
     * Creates a new instance of AIConversation.
     *
     * @param {RunnableToolFunction[]} [functions=[]] - The list of functions to be executed.
     * @returns {AIConversation} - The newly created instance of AIConversation.
     */
    static new(functions: RunnableToolFunction<any>[] = []) {
        return new AIConversation([], functions, crypto.randomUUID())
    }

    static async reset(id: string) {
        await SafeQuery(sql`DELETE FROM AiConversationHistory WHERE conversation_id = ${id}`)
    }

    protected constructor(
        messages: ChatCompletionMessageParam[],
        functions: RunnableToolFunction<any>[] = [],
        id: string
    ) {
        super()
        this.messages = messages
        this.functions = functions
        this.id = id
    }

    reset() {
        this.messages = []
        return AIConversation.reset(this.id)
    }

    async saveMessage(message: ChatCompletionMessageParam) {
        console.trace()
        console.log(message)
        this.messages.push(message)
        await SafeQuery(sql`INSERT INTO AiConversationHistory (conversation_id, content) VALUES (${this.id}, ${JSON.stringify(message)})`);
    }

    delayedSendToAI() {
        if (this.delayedSendTimer) clearTimeout(this.delayedSendTimer)
        this.delayedSendTimer = setTimeout(() => {
            this.sendToAI()
        }, 1500)
    }

    async sendToAI(): Promise<ChatCompletionMessageParam> {
        this.delayedSendTimer = null
        if (this.functions.length === 0) {
            let controller = new AbortController()
            this.#controller = controller

            const result = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: this.messages,
            })
            console.log(result.choices)
            if (this.#controller?.signal.aborted) throw new Error("Aborted")

            const message: ChatCompletionAssistantMessageParam = {
                role: "assistant",
                content: result.choices.reduce((a, b) => a + b.message.content, "")
            }
            await this.saveMessage(message)
            this.emit("onAIResponse", message)
            return message
        }
        else {
            console.log(this.messages)
            const runner = openai.beta.chat.completions.runTools({
                model: 'gpt-3.5-turbo',
                messages: this.messages,
                tools: this.functions
            })
            this.#controller = runner.controller

            runner.allChatCompletions()
            const result = await runner.finalMessage()
            if (this.#controller?.signal.aborted) throw new Error("Aborted")

            await this.saveMessage(result)
            this.emit("onAIResponse", result)
            return result
        }
    }
}

export function generateAIImage(...params: Parameters<typeof openai.images.generate>) {
    return openai.images.generate(...params)
}

export async function generateAIThumbnail(prompt: string) {
    let image = await openai.images.generate({
        prompt,
        model: "dall-e-3",
        response_format: "url",
        quality: "standard",
        size: "1024x1024"
    })
    return image.data[0].url
}
