# Creating a Crash Bot module

> Using an editor such as [Visual Studio Code](https://code.visualstudio.com/)
> or [WebStorm](https://www.jetbrains.com/webstorm/) that can auto-complete is highly recommended.

## Prerequisites

This guide assumes you already have knowledge in the following areas:

- TypeScript
- JavaScript classes
- NodeJS

# Getting Started

It is important to note that Crash Bot modules are build on top of [discord.js](https://discord.js.org/). This means
that the methods it provides are fully accessible from within Crash Bot modules.

Crash Bot modules are class-based. This means that your module is represented as it's own class. This is to help make
each module self-contained and pluggable.

To create a new module, follow these steps:

1. Pick a name for your new module. Your module's name must be camel case (`MyModule`), starting with a capital letter.
    1. Module names cannot contain any spaces or special characters.
2. Create a new file in the `src/modules`. The file should be named `[MyModuleName].ts`
3. Copy the following template into your file. Make sure to replace 'MyModule' with your chosen module name,
   ```typescript
   import {BaseModule} from "BaseModule.js" // The Base
   import {type Client} from "discord.js";
   
   class MyModule extends BaseModule {
       constructor(client: Client) {
           super(client);
           // Code inserted here will run once the bot has started up and connected to Discord.
       }
   }
   ```
   >
4. Lastly you need to link your newly created module into the main Crash Bot code. To do this, make the following
   changes to the index.ts file;
   ```typescript
   // ...
   import {MyModuleName} from "./src/modules/MyModuleName.js"
   
   const moduleClasses = [
        // ...
        MyModuleClass // Add your module to the array of modules to load.
   ]
   ```

# Listening to Discord events

Crash Bot modules use the `@OnClientEvent` decorator to assign module methods to given Discord events.

For example;

```typescript
import {BaseModule, OnClientEvent} from "BaseModule.js" // The Base
import {type Client, type Message} from "discord.js";

class MyModule extends BaseModule {
    @OnClientEvent("messageCreate")
    onNewMessage(msg: Message) {
        msg.reply("Hello, world!")
    }
}
```

> In this example, the 'onNewMessage' will run whenever the bot receives a new message.

# Creating a slash command

Crash Bot modules require that you write your slash commands in a particular way. Each module can manage many commands.
Each command needs to be defined with a SlashCommandBuilder object in the `commands` property of your module.

```typescript
import {BaseModule, OnClientEvent} from "BaseModule.js" // The Base
import {type Client, type Interaction, type Message} from "discord.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {InteractionChatCommandResponse} from "./BaseModule";

class MyModule extends BaseModule {
    // Define the slash command
    commands = [
        new SlashCommandBuilder()
            .setName("mycommand")
            .setDescription("My custom Discord slash command")
    ]

    // Define how to respond to the usage of the slash command
    @InteractionChatCommandResponse("mycommand")
    onMyCommand(interaction: Interaction) {
        interaction.reply("Hello, world!")
    }
}
```
