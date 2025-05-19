import express from 'express';
import next from 'next';
import {Client, GatewayIntentBits} from 'discord.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

async function main() {
    try {
        // Initialize Next.js
        await app.prepare();

        // Create Express server
        const server = express();

        // Initialize Discord bot
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                // Add other intents your bot needs
            ]
        });

        // Discord bot login
        client.once('ready', () => {
            console.log('Discord bot is ready!');
        });

        await client.login(process.env.DISCORD_TOKEN);

        // Handle Next.js requests
        server.all('*', (req, res) => {
            return handle(req, res);
        });

        // Start server
        server.listen(port, () => {
            console.log(`> Ready on http://localhost:${port}`);
        });

    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

main();