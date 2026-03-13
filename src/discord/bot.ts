import { Client, GatewayIntentBits, REST, Routes, type Interaction } from 'discord.js';
import { loadConfig } from '../config/loader.js';
import { registerSlashCommands, handleSlashCommand } from './commands/index.js';
import { startRateLimitCleanup } from './middleware/rate-limit.js';

export async function startDiscordBot(): Promise<void> {
  const config = loadConfig();
  const token = config.discordToken;

  if (!token) {
    throw new Error('Discord token not configured. Run: vizzor config set discordToken <token>');
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Start periodic rate-limit cleanup
  startRateLimitCleanup();

  client.once('ready', async (readyClient) => {
    console.log(`Discord bot logged in as ${readyClient.user.tag}`);

    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(token);
    const commands = registerSlashCommands();

    if (config.discordGuildId) {
      await rest.put(Routes.applicationGuildCommands(readyClient.user.id, config.discordGuildId), {
        body: commands,
      });
    } else {
      await rest.put(Routes.applicationCommands(readyClient.user.id), {
        body: commands,
      });
    }

    console.log('Discord slash commands registered');
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await handleSlashCommand(interaction);
  });

  // Freetext handler — respond to @mentions with guidance
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!client.user || !message.mentions.has(client.user)) return;

    await message.reply(
      'Use slash commands for on-chain intelligence:\n' +
        '`/scan` `/trends` `/track` `/ico` `/audit` `/help`\n\n' +
        'For full AI-powered predictions, run `vizzor` in your terminal.',
    );
  });

  await client.login(token);
}
