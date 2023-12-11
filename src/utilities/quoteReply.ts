import Discord, {MessageComponentInteraction, TextBasedChannel} from "discord.js";
import inspirobot from "inspirobot.js";

export function quoteReply(channel: TextBasedChannel, interaction: MessageComponentInteraction | null = null) {
    inspirobot.generateImage()
        .then((image: string) => {
            let msg_content = {
                content: 'Created by: inspirobot.me',
                files: [
                    new Discord.MessageAttachment(image, "quote.jpg")
                ],
                components: [
                    new Discord.MessageActionRow()
                        .addComponents(
                            new Discord.MessageButton()
                                .setCustomId("another_inspiro_quote")
                                .setLabel("Another!")
                                .setStyle("PRIMARY"),
                            new Discord.MessageButton()
                                .setCustomId("offensive_inspiro_quote")
                                .setLabel("I found this offensif")
                                .setStyle("SECONDARY")
                        )
                ]
            }
            if (interaction) interaction.reply(msg_content)
            else channel.send(msg_content)
        })
}