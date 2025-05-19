import {ChatGPTAPI} from "chatgpt";
import {ChatCompletionMessageParam} from "openai/resources/index";
import {RunnableToolFunction} from "openai/lib/RunnableFunction";
import crypto from "crypto";
import SafeQuery, {sql} from "../SQL.js";
import {BasicAIConversation, openai} from "./BasicAIConversation.js";

const ChatGPT = new ChatGPTAPI({
    apiKey: process.env["OPENAI_API_KEY"] ?? '',
    completionParams: {
        model: "gpt-3.5-turbo-1106"
    }
})

export default ChatGPT

export class AIConversation extends BasicAIConversation {
    readonly id: string

    /**
     * Creates an AIConversation instance using saved conversation data.
     *
     * @param {string} id - The ID of the conversation.
     * @param {RunnableToolFunction<any>[]} [functions=[]] - An array of runnable tool functions to be used in the conversation.
     * @param {string} [systemPrompt] - The system prompt to be added as the first message in the conversation.
     *
     * @returns {Promise<AIConversation>} - A Promise that resolves to an AIConversation instance.
     */
    static async fromSaved(id: string, systemPrompt?: string): Promise<AIConversation> {
        let messages = await SafeQuery<{ content: string }>(sql`SELECT content
                                                                FROM AiConversationHistory
                                                                WHERE conversation_id = ${id}`);
        let messages_parsed: ChatCompletionMessageParam[] = messages.recordset.map(record => JSON.parse(record.content))
        if (systemPrompt) messages_parsed.unshift({
            role: "system",
            content: systemPrompt
        })
        return new AIConversation(
            messages_parsed,
            id
        )
    }

    constructor(
        messages: ChatCompletionMessageParam[],
        id: string = crypto.randomUUID()
    ) {
        super(messages);
        this.id = id;
        this.on("message", (message) => {
            void SafeQuery(sql`INSERT INTO AiConversationHistory (conversation_id, content)
                            VALUES (${this.id}, ${JSON.stringify(message)})`);
        })
    }

    /**
     * Creates a new instance of AIConversation.
     *
     * @param {RunnableToolFunction[]} [functions=[]] - The list of functions to be executed.
     * @returns {AIConversation} - The newly created instance of AIConversation.
     */
    static new(): AIConversation {
        return new AIConversation([], crypto.randomUUID())
    }

    static async reset(id: string) {
        await SafeQuery(sql`DELETE
                            FROM AiConversationHistory
                            WHERE conversation_id = ${id}`)
    }

    reset() {
        this.messages = []
        return AIConversation.reset(this.id)
    }
}

export class UnsavedAIConversation extends BasicAIConversation {
    constructor(
        messages: ChatCompletionMessageParam[],
    ) {
        super(messages);
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
