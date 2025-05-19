import {BaseModule, InteractionAutocompleteResponse, InteractionChatCommandResponse} from "./BaseModule.ts";
import {SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder} from "@discordjs/builders";
import {AutocompleteInteraction, ChatInputCommandInteraction, Client, TextChannel} from "discord.js";
import * as path from "node:path";
import Jimp from "jimp";
import crypto from "node:crypto";
import SafeQuery from "../../services/SQL.ts";
import mssql from "mssql";
import {AICharacterData, CharacterData} from "../utilities/roleplay/CharacterData.ts";
import {Conversation} from "../utilities/roleplay/conversation.ts";
import {AIConversation} from "../../services/ChatGPT/ChatGPT.ts";

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"]

export class RoleplayModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("characters")
            .setDescription("Manage your characters")
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("create")
                    .setDescription("Create a new character")
                    .addStringOption(
                        new SlashCommandStringOption()
                            .setName("character_name")
                            .setDescription("A name for your new character")
                            .setRequired(true)
                    )
                    .addAttachmentOption(
                        (attachment) => attachment.setName("avatar")
                            .setDescription("A image you'd like to associate with the character")
                            .setRequired(true)
                    )
                    .addStringOption(
                        (str) => str.setName("description")
                            .setDescription("A image you'd like to associate with the character")
                            .setRequired(true)
                    )
                    .addBooleanOption(
                        (bool) => bool.setName("ai")
                            .setDescription("Is controlled by AI?")
                            .setRequired(true)
                    )
            )
            .addSubcommandGroup(
                (group) => group
                    .setName("ai")
                    .setDescription("AI character controls")
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("add_to_scene")
                            .setDescription("Add an AI character to the scene")
                            .addStringOption(
                                (str) => str.setName("character_id")
                                    .setDescription("The ID of your AI character")
                                    .setRequired(true)
                                    .setAutocomplete(true)
                            )
                            .addStringOption(
                                (str) => str.setName("context")
                                    .setDescription("Some context about the current scene, so that the AI knows what's going on")
                                    .setRequired(true)
                            )
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("remove_from_scene")
                            .setDescription("Select an AI character to remove")
                            .addStringOption(
                                (str) => str.setName("character_id")
                                    .setDescription("The ID of your AI character")
                                    .setRequired(true)
                                    .setAutocomplete(true)
                            )
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("reset")
                            .setDescription("Reset an AI character's memory")
                            .addStringOption(
                                (str) => str.setName("character_id")
                                    .setDescription("The ID of your AI character")
                                    .setRequired(true)
                                    .setAutocomplete(true)
                            )
                    )
            )
        ,
        new SlashCommandBuilder()
            .setName("c")
            .setDMPermission(false)
            .setDescription("Send a message as one of your characters")
            .addStringOption(
                (str) => str.setName("character_id")
                    .setDescription("The ID of your character")
                    .setAutocomplete(true)
                    .setRequired(true)
            )
            .addStringOption(
                (str) => str.setName("message")
                    .setDescription("The message to send as that character")
                    .setRequired(true)
            )
    ]
    conversations: Map<string, Conversation> = new Map()

    constructor(client: Client) {
        super(client);
        setInterval(() => this.conversationCleanup(), 60_000)
    }

    private conversationCleanup() {
        for (let item of this.conversations) {
            if (item[1].aiParticipants.size === 0) this.conversations.delete(item[0])
        }
    }

    @InteractionAutocompleteResponse("characters")
    async onCharacterAutocomplete(interaction: AutocompleteInteraction) {
        const subcommand = interaction.options.getSubcommand(true)
        const subcommandgroup = interaction.options.getSubcommandGroup()
        switch (subcommandgroup) {
            case "ai":
                switch (subcommand) {
                    case "add_to_scene":
                        console.log(interaction.user.id, interaction.options.getString("character_id") || "", interaction.channelId)
                        const characters0 = await SafeQuery<CharacterData>(`SELECT *
                                                            FROM dbo.UserCharacters
                                                            WHERE owner_discord_id = @OWNERID
                                                              AND (ai_active_discord_channel != @channelid OR ai_active_discord_channel IS NULL)
                                                              AND (name LIKE CONCAT('%', @id, '%') OR id LIKE CONCAT('%', @id, '%'))
                                                              AND ai = 1`, [
                            {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
                            {
                                name: "id",
                                type: mssql.TYPES.VarChar(100),
                                data: interaction.options.getString("character_id") || ""
                            },
                            {name: "channelid", type: mssql.TYPES.VarChar(100), data: interaction.channelId}
                        ])
                        console.log(characters0)
                        interaction.respond(characters0.recordset.map(i => ({name: i.name, value: i.id.toString()})))
                        break
                    case "remove_from_scene":
                        interaction.respond((
                            await SafeQuery<CharacterData>(`SELECT *
                                                            FROM dbo.UserCharacters
                                                            WHERE owner_discord_id = @OWNERID
                                                              AND ai_active_discord_channel = @channelid
                                                              AND (name LIKE CONCAT('%', @id, '%') OR id LIKE CONCAT('%', @id, '%'))
                                                              AND ai = 1`, [
                                {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
                                {
                                    name: "id",
                                    type: mssql.TYPES.VarChar(100),
                                    data: interaction.options.getString("character_id") || ""
                                },
                                {name: "channelid", type: mssql.TYPES.VarChar(100), data: interaction.channelId}
                            ])
                        ).recordset.map(i => ({name: i.name, value: i.id.toString()})))
                        break
                    case "reset":
                        let character_id = interaction.options.getString("character_id") || ""
                        let characters = await SafeQuery<CharacterData>(`SELECT *
                                                                         FROM dbo.UserCharacters
                                                                         WHERE owner_discord_id = @OWNERID
                                                                           AND (name LIKE CONCAT('%', @id, '%') OR id LIKE CONCAT('%', @id, '%'))
                                                                           AND ai = 1`, [
                            {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
                            {name: "id", type: mssql.TYPES.VarChar(100), data: character_id}
                        ])
                        interaction.respond(characters.recordset.map(i => ({name: i.name, value: i.id.toString()})))
                }
        }
    }

    @InteractionChatCommandResponse("characters")
    async onCharacterManageCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ephemeral: true})
        try {
            const subcommand = interaction.options.getSubcommand()
            const subcommandgroup = interaction.options.getSubcommandGroup()
            switch (subcommandgroup) {
                case "ai":
                    if (!(interaction.channel instanceof TextChannel)) {
                        interaction.reply({
                            content: "Oh no! This channel isn't supported. Please try another channel",
                            ephemeral: true
                        })
                        return
                    }
                    const conversation = await this.getConversation(interaction.channel)
                    const character_id = parseInt(interaction.options.getString("character_id") || "")
                    switch (subcommand) {
                        case "add_to_scene":
                            let previous_conversation0 = this.findConversationWithAICharacter(character_id)
                            if (previous_conversation0) {
                                await previous_conversation0.removeAIFromConversation(character_id)
                            }

                            const character = await this.getAICharacterWithID(character_id, interaction.user.id)
                            await conversation.joinAIToConversation(character, interaction.options.getString("context", true))
                            await interaction.deleteReply()
                            break
                        case "remove_from_scene":
                            await conversation.removeAIFromConversation(parseInt(interaction.options.getString("character_id", true)))
                            await interaction.deleteReply()

                        case "reset":
                            let previous_conversation1 = this.findConversationWithAICharacter(character_id)
                            if (previous_conversation1) {
                                await previous_conversation1.removeAIFromConversation(character_id)
                            }

                            await AIConversation.reset(character_id.toString())
                            interaction.editReply({content: "Reset your character's memory. If they were in a scene, you'll need to re-add them to it."})
                    }
                    break
                default:
                    switch (subcommand) {
                        case "create":
                            // Format the image
                            const imageData = interaction.options.getAttachment("avatar")
                            if (!imageData) throw new Error("Image not attached")
                            const filename_split = imageData.name.split(".")
                            const extension = filename_split[filename_split.length - 1].toLowerCase()
                            if (!SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) throw new Error("Unsupported image format")

                            const filename = crypto.randomUUID() + "." + extension
                            const outputPath = path.resolve(`./assets/character_avatars/${filename}`)

                            const image = await Jimp.read(imageData.url)
                            // Crop the image to a square
                            let width = image.bitmap.width;
                            let height = image.bitmap.height;

                            // Find the smallest size (either width or height)
                            let minSize = Math.min(width, height);

                            // Calculate the x and y offsets to make the crop centered
                            let xOffset = (width - minSize) / 2;
                            let yOffset = (height - minSize) / 2;

                            // Resize the image
                            image
                                .crop(xOffset, yOffset, minSize, minSize) // Crop the image to a square
                                .resize(300, 300) // Resize the cropped image to 300x300 pixels
                                .write(outputPath); // Save the edited image (change the path as needed)

                            const is_ai = interaction.options.getBoolean("ai", true)

                            if (is_ai) {
                                // Save to MSSQL database
                                await SafeQuery(`INSERT INTO CrashBot.dbo.UserCharacters (owner_discord_id, name, description,
                                                                                  ai, avatar_filename, ai_lastmessageid)
                                         VALUES (@ownerid, @name, @description, @ai, @filename, @aichatid);`, [
                                    {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
                                    {
                                        name: "name",
                                        type: mssql.TYPES.VarChar(100),
                                        data: interaction.options.getString("character_name", true)
                                    },
                                    {
                                        name: "description",
                                        type: mssql.TYPES.VarChar(1000),
                                        data: interaction.options.getString("description", true)
                                    },
                                    {name: "ai", type: mssql.TYPES.Bit(), data: is_ai},
                                    {name: "filename", type: mssql.TYPES.VarChar(150), data: filename},
                                ])
                            }
                            else {
                                // Save to MSSQL database
                                await SafeQuery(`INSERT INTO CrashBot.dbo.UserCharacters (owner_discord_id, name, description, ai, avatar_filename)
                                         VALUES (@ownerid, @name, @description, @ai, @filename);`, [
                                    {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
                                    {
                                        name: "name",
                                        type: mssql.TYPES.VarChar(100),
                                        data: interaction.options.getString("character_name", true)
                                    },
                                    {
                                        name: "description",
                                        type: mssql.TYPES.VarChar(1000),
                                        data: interaction.options.getString("description", true)
                                    },
                                    {name: "ai", type: mssql.TYPES.Bit(), data: is_ai},
                                    {name: "filename", type: mssql.TYPES.VarChar(150), data: filename},
                                ])
                            }
                            interaction.editReply(`Created a new character: \`${interaction.options.getString("character_name", true)}\``)
                            return
                    }
            }
        } catch (e) {
            interaction.editReply("Oh no! An error occured while processing your request. Please try again.")
            console.error(e)
        }
    }

    @InteractionAutocompleteResponse("c")
    async autocompleteCharacterSelection(interaction: AutocompleteInteraction) {
        let character_id = interaction.options.getString("character_id") || ""
        let characters = await SafeQuery<CharacterData>(`SELECT *
                                                         FROM dbo.UserCharacters
                                                         WHERE owner_discord_id = @OWNERID
                                                           AND (name LIKE CONCAT('%', @id, '%') OR id LIKE CONCAT('%', @id, '%'))
                                                           AND ai = 0`, [
            {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
            {name: "id", type: mssql.TYPES.VarChar(100), data: character_id}
        ])
        interaction.respond(characters.recordset.map(i => ({name: i.name, value: i.id.toString()})))
    }

    @InteractionChatCommandResponse("c")
    async onCharacterChat(interaction: ChatInputCommandInteraction) {
        if (!(interaction.channel instanceof TextChannel)) {
            interaction.reply({
                content: "Oh no! This channel isn't supported. Please try another channel",
                ephemeral: true
            })
            return
        }

        await interaction.deferReply({ephemeral: true})
        let character_id = interaction.options.getString("character_id", true)

        const characterSearch = await SafeQuery<CharacterData>(`SELECT TOP 1 *
                                                                FROM dbo.UserCharacters
                                                                WHERE owner_discord_id = @OWNERID
                                                                  AND id = @id`, [
            {name: "ownerid", type: mssql.TYPES.VarChar(100), data: interaction.user.id},
            {name: "id", type: mssql.TYPES.VarChar(100), data: character_id}
        ])
        const characterData = characterSearch.recordset[0]
        if (!characterData) {
            interaction.reply({content: "Oh no! We couldn't find that character", ephemeral: true})
        }

        const message = interaction.options.getString("message", true)
        const conversation = await this.getConversation(interaction.channel);
        await conversation.sendMessage(characterData, message)
        interaction.deleteReply()
    }

    async getConversation(channel: TextChannel) {
        let conversation = this.conversations.get(channel.id)
        if (!conversation) {
            conversation = await Conversation.createNewConversation(channel)
            this.conversations.set(channel.id, conversation)
        }
        return conversation
    }

    async getAICharacterWithID(id: number, ownerid: string) {
        return (await SafeQuery<AICharacterData>(`SELECT TOP 1 *
                                                                       FROM dbo.UserCharacters
                                                                       WHERE owner_discord_id = @OWNERID
                                                                         AND id = @id
                                                                         AND ai = 1`, [
            {name: "ownerid", type: mssql.TYPES.VarChar(100), data: ownerid},
            {name: "id", type: mssql.TYPES.Int(), data: id}
        ])).recordset[0]

    }

    findConversationWithAICharacter(characterId: number) {
        return Array.from(this.conversations.values())
            .find(conversation =>
                conversation.aiParticipants.has(characterId)
            );
    }
}
