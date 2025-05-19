import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageComponentInteraction,
    TextBasedChannel
} from "discord.js";
import inspirobot from "inspirobot.js";

export function quoteReply(channel: TextBasedChannel, interaction: MessageComponentInteraction | null = null) {
    inspirobot.generateImage()
        .then((image: string) => {
            let msg_content = {
                content: 'Created by: inspirobot.me',
                files: [
                    new AttachmentBuilder(image, {name: "quote.jpg"})
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId("another_inspiro_quote")
                                .setLabel("Another!")
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId("offensive_inspiro_quote")
                                .setLabel("I found this offensif")
                                .setStyle(ButtonStyle.Secondary)
                        )
                ]
            }
            // TODO: PATCH LATER!!!
            // @ts-ignore
            if (interaction) interaction.reply(msg_content)
            // TODO: PATCH LATER!!!
            // @ts-ignore
            else channel.send(msg_content)
        })
}