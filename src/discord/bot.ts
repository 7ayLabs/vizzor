import { Client, GatewayIntentBits, REST, Routes, type Interaction } from 'discord.js';
import { getConfig } from '../config/loader.js';
import { registerSlashCommands, handleSlashCommand } from './commands/index.js';

export async function startDiscordBot(): Promise<void> {
  const config = getConfig();
  const token = config.discordToken;

  if (!token) {
    throw new Error('Discord token not configured. Run: vizzor config set discordToken <token>');
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

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

  await client.login(token);
}
