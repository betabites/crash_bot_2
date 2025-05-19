import {EventEmitter} from "node:events";
import {
    ChatCompletionAssistantMessageParam,
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionMessageParam
} from "openai/resources";
import OpenAI from "openai";
import {zodToJsonSchema} from "zod-to-json-schema";
import {z} from "zod";

export const openai: OpenAI = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"] || "",
})

type AIConversationEvents = {
    "message": [ChatCompletionMessageParam]
    "message_stop": [ChatCompletionAssistantMessageParam]
    "message_length": [ChatCompletionAssistantMessageParam]
    "message_tool_calls": [ChatCompletionAssistantMessageParam]
    "message_content_filter": [ChatCompletionAssistantMessageParam]
    "message_function_call": [ChatCompletionAssistantMessageParam]
    "error": [unknown]
    "action_start": [],
    "action_end": []
}

/**
 * Represents a conversation with an AI assistant.
 * @extends EventEmitter
 */
export abstract class BasicAIConversation extends EventEmitter {
    protected messages: ChatCompletionMessageParam[] = []
    protected delayedSendTimer: NodeJS.Timeout | null = null
    protected functions = new Map<string, {
        schema: z.Schema<any>,
        description: string,
        func: (data: any) => Promise<string>
    }>()
    #controller: AbortController | undefined
    #ongoingActions = 0

    get isNew() {
        return this.messages.length === 0
    }

    get controller() {
        return this.#controller
    }

    protected constructor(
        messages: ChatCompletionMessageParam[],
    ) {
        super()
        this.messages = messages
        this.on("message_tool_calls", async (message) => {
            console.log("TOOL CALLS", message.tool_calls)
            if (!message.tool_calls) return
            await Promise.all(message.tool_calls.map(async call => {
                try {
                    let tool = this.functions.get(call.function.name)
                    if (!tool) {
                        void this.appendMessage({
                            role: "tool",
                            content: `Tool ${call.function.name} not found.`,
                            tool_call_id: call.id
                        })
                        return
                    }
                    let funcArgs = tool.schema.safeParse(JSON.parse(call.function.arguments))
                    if (!funcArgs.success) {
                        void this.appendMessage({
                            role: "tool",
                            content: `Tool ${call.function.name} failed. Invalid schema, please try again. <Error>${funcArgs.error}</Error>`,
                            tool_call_id: call.id
                        })
                        return
                    }

                    let res = await tool.func(funcArgs.data)
                    this.appendMessage({
                        role: "tool", content: res, tool_call_id: call.id
                    })
                } catch (e) {
                    console.error(e, message)
                    this.appendMessage({
                        role: "tool",
                        content: `Tool ${call.function.name} failed.`,
                        tool_call_id: call.id
                    })
                }
            }))
            void this.sendToAI()
        })
    }

    delayedSendToAI() {
        if (this.delayedSendTimer) clearTimeout(this.delayedSendTimer)
        this.delayedSendTimer = setTimeout(() => {
            this.sendToAI()
        }, 1500)
    }

    emit<EVENT extends keyof AIConversationEvents>(eventName: EVENT, ...args: AIConversationEvents[EVENT]) {
        return super.emit(eventName, ...args)
    }

    on<EVENT extends keyof AIConversationEvents>(eventName: EVENT, func: (...args: AIConversationEvents[EVENT]) => void) {
        // @ts-expect-error
        return super.on(eventName, func)
    }

    once<EVENT extends keyof AIConversationEvents>(eventName: EVENT, func: (...args: AIConversationEvents[EVENT]) => void) {
        // @ts-expect-error
        return super.once(eventName, func)
    }

    appendMessage(message: ChatCompletionMessageParam) {
        this.messages.push(message)
        this.emit("message", message)
    }

    sendToAIAndWait() {
        return new Promise<ChatCompletionAssistantMessageParam>(async (resolve, reject) => {
            this.once("message_stop", (message) => resolve(message))
            let timeout = setTimeout(() => {
                reject(new Error("Timeout"))
            }, 10000)
            this.sendToAI()
                .catch((e) => reject(e))
                .finally(() => clearTimeout(timeout))
        })
    }

    get #chatCompetionParam() {
        let body: ChatCompletionCreateParamsNonStreaming = {
            model: 'gpt-4o',
            messages: this.messages,
        }
        if (this.functions.size !== 0) {
            body.tools = []
            for (let item of this.functions) {
                body.tools.push({
                    type: "function",
                    function: {
                        name: item[0],
                        description: item[1].description,
                        parameters: zodToJsonSchema(item[1].schema, {}),
                        strict: false,
                    }
                })
            }
        }

        return body
    }

    async sendToAI(): Promise<void> {
        try {
            let controller = new AbortController()
            this.#controller = controller

            const result = await openai.chat.completions.create(this.#chatCompetionParam)
            if (controller.signal.aborted) return

            let choice = result.choices[0]
            console.log("CHOICE", choice)
            this.appendMessage(choice.message)
            this.emit(`message_${choice.finish_reason}`, choice.message)
        } catch (e) {
            this.emit("error", e)
            throw e
        }
    }
}

export function AIToolCall<SCHEMA extends z.Schema<any>>(
    toolName: string,
    description: string,
    schema: SCHEMA,
) {
    function decorator<CLASS extends BasicAIConversation>(originalMethod: (data: z.infer<SCHEMA>) => Promise<string>, context: ClassMethodDecoratorContext<CLASS>) {
        context.addInitializer(function init(this: CLASS) {
            this.functions.set(toolName, {
                schema,
                description,
                func: originalMethod.bind(this)
            })
        })

        return originalMethod
    }

    return decorator
}
