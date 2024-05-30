import {
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Client,
    ClientEvents,
    SelectMenuInteraction
} from "discord.js";
import {client} from "../services/Discord.js";

/**
 * BaseModule is an abstract class representing a base module for creating Discord bot modules.
 * @class
 * @abstract
 */
export abstract class BaseModule {
    readonly client: Client
    readonly commands: any[] = []

    subscribedSlashCommands: [string, (interaction: ChatInputCommandInteraction) => void][] = []
    subscribedButtonInteractions: [string | ((id: string) => boolean), (interaction: ButtonInteraction) => void][] = []
    subscribedSelectMenuInteractions: [string | ((id: string) => boolean), (interaction: SelectMenuInteraction) => void][] = []
    subscribedAutocompleteInteractions: [string | ((id: string) => boolean), (interaction: AutocompleteInteraction) => void][] = []

    constructor(client: Client) {
        this.client = client
    }

    createCommands(): string[] {
        return this.commands.map(command => {
            // @ts-ignore
            client.application?.commands.create(command).catch(e => {
                console.error("Failed to register command")
                console.log(command)
                console.error(e)
            })
            return command.name
        })
    }
}

// DECORATORS
/**
 * A decorator for handling client events.
 *
 * @template Event - The type of the client event.
 * @param {Event} clientEvent - The client event to handle.
 * @param {any} [thisArg] - The context in which the original method should be called.
 * @return {Function} - The decorator function.
 */
export function OnClientEvent<Event extends keyof ClientEvents>(clientEvent: Event, thisArg?: any) {
    function decorator(originalMethod: (...args: ClientEvents[Event]) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        function replacementMethod(this: BaseModule, ...args: ClientEvents[Event]) {
            // console.log(thisArg)
            return originalMethod.call(thisArg || this, ...args)
        }

        context.addInitializer(function init(this: BaseModule) {
            this.client.on(clientEvent, (...args) => replacementMethod.call(this, ...args))
        })

        return replacementMethod
    }

    return decorator
}

/**
 * Decorator function for Chat Command response.
 *
 * @param {string} identifier - The identifier for the Chat Command.
 * @returns {Function} - The decorator function.
 */
export function InteractionChatCommandResponse(identifier: string) {
    function decorator(originalMethod: (interaction: ChatInputCommandInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            originalMethod.bind(this)
            this.subscribedSlashCommands.push([identifier, originalMethod])
        })

        return originalMethod
    }

    return decorator
}

export function InteractionButtonResponse(identifier: string | ((id: string) => boolean)) {
    function decorator(originalMethod: (interaction: ButtonInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            this.subscribedButtonInteractions.push([identifier, originalMethod])
        })

        return originalMethod
    }

    return decorator
}

export function InteractionSelectMenuResponse(identifier: string | ((id: string) => boolean)) {
    function decorator(originalMethod: (interaction: SelectMenuInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            this.subscribedSelectMenuInteractions.push([identifier, originalMethod])
        })

        return originalMethod
    }

    return decorator
}

export function InteractionAutocompleteResponse(identifier: string | ((id: string) => boolean)) {
    function decorator(originalMethod: (interaction: AutocompleteInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            this.subscribedAutocompleteInteractions.push([identifier, originalMethod])
        })

        return originalMethod
    }

    return decorator
}
