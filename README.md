# Crash Bot Source Code

Welcome to the Crash Bot source code!

`Crash Bot` is Discord Bot software built with [discord.js](https://discord.js.org).

## Setting up your dev enviroment

To develop Crash Bot modules, you'll first need to setup an enviroment.

1. First, create a folder on your machine and download the code from this repository into it.
2. Once you've downloaded everything, you'll need to setup your enviroment variables. Create a file named `.env` in your
   project's root directory, and paste the following template text into it:
    ```dotenv
    BUNGIE_API_KEY="NULL"

    BUNGIE_CLIENT_ID="NULL"
    BUNGIE_CLIENT_SECRET="NULL"

    DISCORD_SECRET="NULL"
    DISCORD_CLIENT_ID="NULL"

    SPOTIFY_CLIENT_ID="NULL"
    SPOTIFY_CLEINT_SECRET="NULL"

    STEAM_API_KEY="NULL"
    OPENAI_API_KEY="NULL"
    ```

3. You'll need to replace the values for `DISCORD_SECRET` and `DISCORD_CLIENT_ID` with actual values. The rest you can
   leave as they are.
    1. You can follow [this guide](https://www.writebots.com/discord-bot-token/) for instructions on how to create a
       Discord bot account and obtain these.
    2. Some services might throw errors until you enter an API key for them,
4. Next, run `npm install` to install all dependencies.
5. Now you're ready to go! Run `node index.js` to start up the Crash Bot framework!
    1. You'll need to stop and re-run this command each time you make changes.

## Directories

Each directory serves a unique(ish) purpose. Please note that contents of the assets directory are quite old and haven't
been re-organised in awhile. These contents may be messy, and/or have files in the wrong locations.

| Directory                | Purpose                                                                                            |
|--------------------------|----------------------------------------------------------------------------------------------------|
| /src                     | Contains all source code for Crash Bot                                                             |
| /src/modules             | Contains the source code for Crash Bot modules. May also contain HTTP routes.                      |
| /src/routes              | Contains the source code for Crash Bot HTTP routes, that aren't directly associated with a module. |
| /src/services            | Contains services such as SQL and GPT that are used by other parts of the code                     |
| /src/utilities           | Contains utility functions/scripts                                                                 |
| /assets                  | Holds static assets that do not change, or change infrequently                                     |
| /assets/destiny          | Contains static data about Destiny 2                                                               |
| /assets/json             | Contains static JSON data                                                                          |
| /assets/pack             | Contains assets relating to the Minecraft resource pack creator                                    |
| /assets/ssl (deprecated) | Contains SSL and other web configuration                                                           |
| /assets/throw            | Contains assets relating to the Crash Bot `throw` module                                           |


## Crash Bot Modules

The different services that Crash Bot provides are spilt into modules. Each service that Crash Bot provides is split
into its own module. For example, there are seperate modules for Destiny 2, Experiments, and GPT.

Some modules do have some overlap. Such as the `Roleplay` and `GPT` modules, where the `Roleplay` modules makes use of
GPT services.

Modules are built by first extending the BaseModule class.
This is because the BaseModule class comes with some utilities embedded in it, which are required for Crash Bot to
function.

```typescript
// MyFirstClass.ts
import {BaseModule, OnClientEvent} from "./BaseModule";
import {Message} from "discord.js";

class MyFirstClass extends BaseModule {
    @OnClientEvent('messageCreate')
    onNewMessage(msg: Message) {
        // Whenever the bot receives a new message, do stuff here...
        msg.reply(`Hello ${msg.author.username}!`)
    }
}
```

## SQL

Crash Bot uses SQLite for fetching data from the Destiny Manifest. Microsoft SQL (MSSQL) is used for everything else.
> The Destiny Manifest is a database file that contains static information about Destiny 2. Information such as data
> about weapons that does not change regularly.

To query the MSSQL database, you'll need to use the 'SafeQuery' function. This allows you to easily perform asynchronous
queries.

```typescript
import SafeQuery, {sql} from "./SQL";
import mssql from "mssql";

async function searchTheDatabase(discord_id: string) {
    // Query using string templates - Recommended as it is safe and easy to read
    const result = await SafeQuery(sql`SELECT * FROM dbo.Users WHERE discord_id = ${discord_id}`)

    // Long-form query - Not recommended. Safe, but hard to read
    const result3 = await SafeQuery("SELECT * FROM dbo.Users WHERE discord_id = @discordid", [
        {name: "discordid", type: mssql.TYPES.VarChar(), data: discord_id}
    ])
}
```

When querying the Destiny Manifest, it is recommended that you use the pre-built queries. Though you can always write
custom ones if need be. The syntax is *similar* to `SafeQuery`, but not the same.

```typescript
import {MANIFEST_SEARCH, sqlite} from "./DestinyManifestDatabase";

async function getData() {
    // Pre-build queries
    const vendors = await MANIFEST_SEARCH.vendors.byHash([512233, 1233312])
    const item = await MANIFEST_SEARCH.items.byName("Sweet Business")

    // Custom queries
    const data = await MANIFEST_SEARCH.customParseJSON(sqlite`SELECT * FROM "DestinyActivityDefinition"`)
}
```
