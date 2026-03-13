import { loadConfig } from '../../config/loader.js';
import { startTUI } from '../../tui/app.js';

export async function handleChat(): Promise<void> {
  await loadConfig();
  startTUI();
}
