import {BaseModule, InteractionAutocompleteResponse, InteractionChatCommandResponse} from "../modules/BaseModule.js";
import {ItemRegistry} from "./registries/ItemRegistry.js";
import {SlashCommandBuilder, SlashCommandStringOption} from "@discordjs/builders";
import {AutocompleteInteraction, ChatInputCommandInteraction} from "discord.js";
import {TestBot} from "./bots/TestBot.js";
import SafeQuery, {sql} from "../services/SQL.js";
import {TestBot2} from "./bots/TestBot2.js";
import {InventoryItem} from "./items/abstracts/InventoryItem.js";

type REGISTRY_KEYS<REGISTRY> = REGISTRY extends ItemRegistry<infer T> ? keyof T : never

export class BotemonModule extends BaseModule {
    registry = new ItemRegistry({
        "botemon:testbot": TestBot,
        "botemon:testbot_two": TestBot2
    });
    commands = [
        new SlashCommandBuilder()
            .setName("use")
            .setDescription("[UPCOMING]]")
            .setDefaultMemberPermissions(null)
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("item")
                    .setDescription("Select the item you'd like to use")
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        new SlashCommandBuilder()
            .setName("test")
            .setDescription("[UPCOMING]]")
            .setDefaultMemberPermissions(null)
    ]

    async #getAllItemsForUser(discordId: string | null) {
        let res = await SafeQuery<{id: string, parent: number | null, owner: string | null, itemType: string, attributes: string}>(sql`SELECT * FROM InventoryItems WHERE owner = ${discordId}`)
        console.log(res.recordset)
        return res.recordset.map(record => {
            let attributes = JSON.parse(record.attributes)
            let constructor = this.registry.getConstructor(record.itemType)
            return new constructor(record.id, record.itemType, attributes)
        })
    }

    @InteractionAutocompleteResponse("use")
    async onItemAutocomplete(interaction: AutocompleteInteraction) {
        // Get the user's inventory
        let inventory = (await this.#getAllItemsForUser(interaction.user.id)).filter(item => item instanceof InventoryItem)
        await interaction.respond(inventory.map(item => ({
            name: item.display.name,
            value: item.instanceId
        })))

    }

    @InteractionChatCommandResponse("test")
    async onTestCommand(interaction: ChatInputCommandInteraction) {
        // Create instance of test item
        let item = await this.registry.createItem("botemon:testbot", interaction.user.id)
        if (item instanceof TestBot) {
            await interaction.reply("Test passed")
        } else {
            await interaction.reply("Test failed.")
        }
    }
}
