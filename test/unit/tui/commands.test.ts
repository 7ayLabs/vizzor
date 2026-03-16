import { describe, it, expect } from 'vitest';
import { isSlashCommand, parseCommand } from '@/tui/commands.js';

describe('isSlashCommand', () => {
  it('returns true for /commands', () => {
    expect(isSlashCommand('/scan 0xabc')).toBe(true);
    expect(isSlashCommand('/help')).toBe(true);
    expect(isSlashCommand('  /trends')).toBe(true);
  });

  it('returns false for regular text', () => {
    expect(isSlashCommand('hello')).toBe(false);
    expect(isSlashCommand('what is bitcoin?')).toBe(false);
  });
});

describe('parseCommand', () => {
  it('parses command name and args', () => {
    const { name, args } = parseCommand('/scan 0xabc --chain polygon');
    expect(name).toBe('scan');
    expect(args).toEqual(['0xabc', '--chain', 'polygon']);
  });

  it('handles command with no args', () => {
    const { name, args } = parseCommand('/help');
    expect(name).toBe('help');
    expect(args).toEqual([]);
  });

  it('handles agent subcommands', () => {
    const { name, args } = parseCommand('/agent create test --strategy momentum --pairs BTC,ETH');
    expect(name).toBe('agent');
    expect(args[0]).toBe('create');
    expect(args[1]).toBe('test');
  });

  it('handles config set subcommand', () => {
    const { name, args } = parseCommand('/config set anthropicApiKey sk-xxx');
    expect(name).toBe('config');
    expect(args).toEqual(['set', 'anthropicApiKey', 'sk-xxx']);
  });
});
