import {
    ApplicationCommandDataResolvable, AutocompleteInteraction, ButtonInteraction,
    Client, ClientApplication,
    ClientEvents, CommandInteraction, Interaction, SelectMenuInteraction,
} from "discord.js";
import {client} from "../misc/Discord.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {InteractionTypes} from "discord.js/typings/enums.js";

type SlashCommandBuilderOmitted = Omit<SlashCommandBuilder, "addSubcommandGroup" | "addSubcommand">

export abstract class BaseModule {
    readonly client: Client
    readonly commands: (ApplicationCommandDataResolvable | SlashCommandBuilderOmitted)[] = []
    subscribedSlashCommands: [string, (interaction: CommandInteraction) => void][] = []
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
export function OnClientEvent<Event extends keyof ClientEvents>(clientEvent: Event) {
    function decorator(originalMethod: (...args: ClientEvents[Event]) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        function replacementMethod(this: BaseModule, ...args: ClientEvents[Event]) {
            return originalMethod.call(this, ...args)
        }

        context.addInitializer(function init(this: BaseModule) {
            this.client.on(clientEvent, replacementMethod)
        })

        return replacementMethod
    }

    return decorator
}

export function InteractionCommandResponse(identifier: string) {
    function decorator(originalMethod: (interaction: CommandInteraction) => any, context: ClassMethodDecoratorContext<BaseModule>) {
        context.addInitializer(function init(this: BaseModule) {
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