import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllPrompts } from '../src/prompts.js';

interface PromptInfo {
  name: string;
  argsSchema: Record<string, unknown>;
}

describe('registerAllPrompts', () => {
  let server: McpServer;
  let count: number;
  let promptList: PromptInfo[] = [];

  beforeAll(() => {
    server = new McpServer({ name: 'test', version: '0.0.0' });
    count = registerAllPrompts(server);
    // Pull internal prompt registry — McpServer exposes via _registeredPrompts in v1.x
    const internal = (server as unknown as { _registeredPrompts: Record<string, PromptInfo> })._registeredPrompts;
    promptList = Object.entries(internal ?? {}).map(([name, info]) => ({ name, argsSchema: info.argsSchema ?? {} }));
  });

  it('registers exactly 12 prompts', () => {
    expect(count).toBe(12);
  });

  it('registers all expected prompt names', () => {
    const names = promptList.map((p) => p.name).sort();
    expect(names).toEqual([
      'bazi-four-pillars',
      'cost-aware-multistep-planner',
      'daily-horoscope',
      'human-design-bodygraph',
      'lunar-phase-day',
      'natal-chart-summary',
      'numerology-life-path',
      'retrograde-warning',
      'synastry-analysis',
      'tarot-three-card',
      'transit-coach',
      'vedic-kundli-summary',
    ]);
  });

  it('every prompt has an argsSchema with at least one field', () => {
    for (const p of promptList) {
      expect(Object.keys(p.argsSchema).length).toBeGreaterThan(0);
    }
  });
});
