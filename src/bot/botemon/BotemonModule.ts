import {BaseModule, InteractionAutocompleteResponse, InteractionChatCommandResponse} from "../modules/BaseModule.ts";
import {ItemRegistry} from "./registries/ItemRegistry.ts";
import {SlashCommandBuilder, SlashCommandStringOption} from "@discordjs/builders";
import {AutocompleteInteraction, ChatInputCommandInteraction} from "discord.js";
import {TestBot} from "./bots/TestBot.ts";
import SafeQuery, {sql} from "../../services/SQL.ts";
import {InventoryItem} from "./items/abstracts/InventoryItem.ts";
import {Niraspid} from "./bots/hayden/Niraspid.ts";
import {PreistBot} from "./bots/PreistBot.ts";
import {ProstoBot} from "./bots/ProstoBot.ts";

type REGISTRY_KEYS<REGISTRY> = REGISTRY extends ItemRegistry<infer T> ? keyof T : never

export class BotemonModule extends BaseModule {
    registry = new ItemRegistry({
        "botemon:niraspid": Niraspid,
        "botemon:preist_bot": PreistBot,
        "botemon:prosto_bot": ProstoBot,
        "botemon:testbot": TestBot,
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
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("action")
                    .setDescription("The action you'd like to perform on the item")
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

    async #getItem(discordId: string | null, instanceId: string) {
        let res = await SafeQuery<{
            id: string,
            parent: number | null,
            owner: string | null,
            itemType: string,
            attributes: string
        }>(sql`SELECT * FROM InventoryItems WHERE owner = ${discordId} AND id = ${instanceId}`)
        return res.recordset.map(record => {
            let attributes = JSON.parse(record.attributes)
            let constructor = this.registry.getConstructor(record.itemType)
            return new constructor(record.id, record.itemType, attributes)
        })[0]
    }

    @InteractionAutocompleteResponse("use")
    async onItemAutocomplete(interaction: AutocompleteInteraction) {
        let autoCompleteField = interaction.options.getFocused(true)
        if (autoCompleteField.name === "item") {
            // Get the user's inventory
            let inventory = (await this.#getAllItemsForUser(interaction.user.id)).filter(item => item instanceof InventoryItem)
            await interaction.respond(inventory.map(item => ({
                name: item.display.name,
                value: item.instanceId
            })))
        }
        else {
            console.log(interaction.options.getString("item"))
            let item = await this.#getItem(interaction.user.id, interaction.options.getString("item", true))

            // Get the user's inventory
            let inventory = (await this.#getAllItemsForUser(interaction.user.id)).filter(item => item instanceof InventoryItem)
            await interaction.respond(inventory.map(item => ({
                name: item.display.name,
                value: item.instanceId
            })))
        }
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
