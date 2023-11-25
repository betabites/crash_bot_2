import {
    ApplicationCommandDataResolvable,
    Client,
    ClientEvents,
} from "discord.js";

export class BaseModule {
    readonly client: Client
    readonly commands: ApplicationCommandDataResolvable[] = []

    constructor(client: Client) {
        this.client = client
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