import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stdioInstructions } from '../src/instructions.js';

// Hand-written tools are registered in index.ts by literal name; the instructions may only name those.
const registered = new Set(
  [...readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8').matchAll(/registerTool\(\s*'(astroway_[a-z_]+)'/g)].map((m) => m[1]),
);

describe('stdio instructions', () => {
  it.each([false, true])('discovery mode %s names only tools the server registers', (discovery) => {
    const text = stdioInstructions(discovery);
    expect(text.length).toBeGreaterThan(300);
    const named = text.match(/\bastroway_[a-z_]+[a-z]\b/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !registered.has(n))).toEqual([]);
  });
});
