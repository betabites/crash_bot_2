import {
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Client,
    ClientEvents,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    Guild,
    SelectMenuInteraction,
    TextInputStyle
} from "discord.js";
import {client} from "../../services/Discord.js";

/**
 * BaseModule is an abstract class representing a base module for creating Discord bot modules.
 * @class
 * @abstract
 */
export abstract class BaseModule {
    readonly client: Client
    readonly commands: any[] = []
    readonly guildCommands: any[] = []
    readonly contextMenuCommands: any[] = []

    subscribedSlashCommands: [string, (interaction: ChatInputCommandInteraction) => void][] = []
    subscribedButtonInteractions: [string | ((id: string) => boolean), (interaction: ButtonInteraction) => void][] = []
    subscribedSelectMenuInteractions: [string | ((id: string) => boolean), (interaction: SelectMenuInteraction) => void][] = []
    subscribedContextMenuCommands: [string | ((id: string) => boolean), (interaction: ContextMenuCommandInteraction) => void][] = []
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

    createContextMenuCommands(): string[] {
        return this.contextMenuCommands.map(command => {
            // @ts-ignore
            console.log("creating context command")
            client.application?.commands.create(command).catch(e => {
                console.error("Failed to register context command")
                console.log(command)
                console.error(e)
            }).then(() => console.log("context command created"))
            return command.name
        })
    }


    createGuildCommands(guild: Guild): string[] {
        return this.guildCommands.map(command => {
            // @ts-ignore
            guild.commands.create(command).catch(e => {
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

        let listener: unknown
        context.addInitializer(function init(this: BaseModule) {
            if (listener) return
            listener = this.client.on(clientEvent, (...args) => replacementMethod.call(this, ...args))
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

export function ContextMenuCommandInteractionResponse(identifier: string, builder: ContextMenuCommandBuilder) {
    function decorator(originalMethod: (interaction: ContextMenuCommandInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            originalMethod.bind(this)
            this.contextMenuCommands.push(builder)
            this.subscribedContextMenuCommands.push([identifier, originalMethod])
        })

        return originalMethod
    }

    return decorator
}

export function InteractionButtonResponse(identifier: string | ((id: string) => boolean)) {
    function decorator(originalMethod: (interaction: ButtonInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
            if (!this.subscribedButtonInteractions) this.subscribedButtonInteractions = []
            this.subscribedButtonInteractions.push([identifier, originalMethod])
        })

        return originalMethod
    }

    return decorator
}

export function InteractionSelectMenuResponse(identifier: string) {
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
