import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* The MCP Registry lists an npm package only when its package.json names the registry entry. */
describe('package metadata', () => {
  it('names the full-catalogue MCP Registry entry', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.mcpName).toBe('info.astroway/astrology');
  });
});
