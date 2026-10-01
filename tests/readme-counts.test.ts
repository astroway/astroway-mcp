import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// An exact count in the README went stale for three releases (624 against 727); only floors like "600+" survive growth.
describe('README counts', () => {
  it('states no exact tool, prompt or resource count', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const exact = readme.match(/\b\d{2,}(?!\+)\s+(tools|prompts|resources)\b/g) ?? [];
    expect(exact).toEqual([]);
  });
});
