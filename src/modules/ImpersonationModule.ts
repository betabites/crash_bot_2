import {BaseModule, InteractionCommandResponse} from "./BaseModule.js";
import {SlashCommandBuilder, SlashCommandStringOption} from "@discordjs/builders";
import {Client, CommandInteraction, TextChannel} from "discord.js";
import {removeAllMentions} from "../utilities/removeAllMentions.js";

export class ImpersonationModule extends BaseModule {
    commands = [
        new SlashCommandBuilder()
            .setName("cheese")
            .setDescription("Become the cheese")
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("message")
                    .setDescription("Something cheesy")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("bread")
            .setDescription("Become wholesome")
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("message")
                    .setDescription("Something wholesome")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("butter")
            .setDescription("Become butter-y?")
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("message")
                    .setDescription("Something buttery")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("butter")
            .setDescription("Become sweet & delicious")
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("message")
                    .setDescription("Something strawberry")
                    .setRequired(true)
            )
    ]

    constructor(client: Client) {
        super(client);
    }


    @InteractionCommandResponse("cheese")
    @InteractionCommandResponse("bread")
    @InteractionCommandResponse("butter")
    @InteractionCommandResponse("jam")
    onImpersonateCommand(interaction: CommandInteraction) {
        console.log("Received message!")
        // Say something as cheese
        const data: {
            [key: string]: {
                name: string,
                avatar: string
            }
        } = {
            cheese: {
                name: "Cheese",
                avatar: "https://www.culturesforhealth.com/learn/wp-content/uploads/2016/04/Homemade-Cheddar-Cheese-header-1200x900.jpg"
            },
            bread: {
                name: "Bread",
                avatar: "https://www.thespruceeats.com/thmb/ZJyWw36nZ1lLNi5FHOKRy9daQqs=/940x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/loaf-of-bread-182835505-58a7008c5f9b58a3c91c9a14.jpg"
            },
            butter: {
                name: "Butter",
                avatar: "https://cdn.golfmagic.com/styles/scale_1536/s3/field/image/butter.jpg"
            },
            jam: {
                name: "Jam",
                avatar: "https://media.istockphoto.com/photos/closeup-of-toast-with-homemade-strawberry-jam-on-table-picture-id469719908?k=20&m=469719908&s=612x612&w=0&h=X4Gzga0cWuFB5RfLh-o7s1OCTbbRNsZ8avyVSK9cgaY="
            },
            peanutbutter: {
                name: "Peanut Butter",
                avatar: "https://s3.pricemestatic.com/Images/RetailerProductImages/StRetailer2362/0046010017_ml.jpg"
            }
        }

        // @ts-ignore
        if (!interaction.channel?.fetchWebhooks) {
            interaction.editReply("Ooops. This channel is not supported")
            return
        }

        let channel = interaction.channel as TextChannel
        channel.fetchWebhooks()
            .then(async hooks => {
                let webhooks = hooks.filter(hook => hook.name === data[interaction.commandName].name)
                let webhook
                if (webhooks.size === 0) {
                    // Create the webhook
                    webhook = await channel.createWebhook(data[interaction.commandName].name, {
                        avatar: data[interaction.commandName].avatar,
                        reason: "Needed new cheese"
                    })
                }
                else {
                    // console.log([...hooks][0])
                    webhook = [...hooks.filter(hook => hook.name.toLowerCase() === interaction.commandName.toLowerCase())][0][1]
                    console.log(webhook)
                }

                let message = interaction.options.getString("message") || ""
                    .replace(/<@!(\d+)>/, (match, userId): string => {
                        const member = interaction.guild?.members.cache.get(userId)
                        if (member) {
                            return member.nickname || member.user.username
                        }
                        else {
                            return match
                        }
                    })
                    .replace(/<@(\d+)>/, (match, userId): string => {
                        const member = interaction.guild?.members.cache.get(userId)
                        if (member) {
                            return member.user.username || member.user.username
                        }
                        else {
                            return match
                        }
                    })
                    .replace(/<@&(\d+)>/, (match, roleId) => {
                        const role = interaction.guild?.roles.cache.get(roleId)
                        if (role) {
                            return role.name
                        }
                        else {
                            return match
                        }
                    })
                    .replaceAll("@", "")

                if (interaction.channel) webhook.send(removeAllMentions(message, interaction.channel))
                interaction.reply({
                    content: "Mmm. Cheese.",
                    fetchReply: true
                }).then(msg => {
                    // @ts-ignore
                    msg.delete()
                })
            })
    }
}