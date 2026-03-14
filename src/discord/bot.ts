import { Client, GatewayIntentBits, REST, Routes, type Interaction } from 'discord.js';
import { loadConfig } from '../config/loader.js';
import { setConfig, setToolHandler, analyze } from '../ai/client.js';
import { handleTool } from '../ai/tool-handler.js';
import { VIZZOR_TOOLS } from '../ai/tools.js';
import { buildChatSystemPrompt } from '../ai/prompts/chat.js';
import { splitMessage } from '../utils/message-split.js';
import { registerSlashCommands, handleSlashCommand } from './commands/index.js';
import { startRateLimitCleanup } from './middleware/rate-limit.js';

export async function startDiscordBot(): Promise<void> {
  const config = loadConfig();
  const token = config.discordToken;

  if (!token) {
    throw new Error('Discord token not configured. Run: vizzor config set discordToken <token>');
  }

  // Initialize AI layer for tool-use chat
  setConfig(config);
  setToolHandler(handleTool);

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

  // Freetext handler — AI chat on @mention
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!client.user || !message.mentions.has(client.user)) return;

    const text = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!text) {
      await message.reply(
        'Mention me with a question! e.g. `@Vizzor what is BTC price?`\n' +
          'Or use slash commands: `/scan` `/trends` `/track` `/ico` `/audit` `/help`',
      );
      return;
    }

    await message.reply('🔮 Analyzing...');

    try {
      const response = await analyze(buildChatSystemPrompt(), text, VIZZOR_TOOLS);
      const chunks = splitMessage(response, 1900);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await message.reply(`Analysis failed: ${msg}`);
    }
  });

  await client.login(token);
}
