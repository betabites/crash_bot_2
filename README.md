# Crash Bot Source Code

Welcome to the Crash Bot source code!

`Crash Bot` is Discord Bot software built with [discord.js](https://discord.js.org).

## Crash Bot Modules

The different services that Crash Bot provides are spilt into modules. Each service that Crash Bot provides is split
into its own module. For example, there are seperate modules for Destiny 2, Experiments, and GPT.

Some modules do have some overlap. Such as the `Roleplay` and `GPT` modules, where the `Roleplay` modules makes use of
GPT services.

Modules are built by first extending the BaseModule class.
The base module class comes with decorators (@). You can use these decorators to listen to given Discord client events.
These decorators are type-safe.

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