/**
 * v0.6.0 — verify the build pipeline produces OUTPUT_SCHEMAS and hasOutput flags
 * correctly correspond to the generated tool list.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { GENERATED_TOOLS, OUTPUT_SCHEMAS } from '../src/tools.generated.js';

describe('OUTPUT_SCHEMAS export', () => {
  it('is a non-empty record', () => {
    const keys = Object.keys(OUTPUT_SCHEMAS);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('every entry is a callable Zod schema', () => {
    for (const [name, sch] of Object.entries(OUTPUT_SCHEMAS)) {
      expect(sch, `OUTPUT_SCHEMAS["${name}"]`).toBeDefined();
      expect(typeof (sch as { safeParse?: unknown }).safeParse, `OUTPUT_SCHEMAS["${name}"] not Zod`).toBe('function');
    }
  });

  it('keys correspond to tools whose hasOutput is true', () => {
    const outputToolNames = new Set(GENERATED_TOOLS.filter((t) => t.hasOutput).map((t) => t.name));
    const schemaNames = new Set(Object.keys(OUTPUT_SCHEMAS));
    expect(outputToolNames.size).toBe(schemaNames.size);
    for (const n of outputToolNames) {
      expect(schemaNames.has(n), `tool ${n} marked hasOutput but no schema in OUTPUT_SCHEMAS`).toBe(true);
    }
  });
});

describe('hasOutput coverage', () => {
  it('≥97% of generated tools have an output schema', () => {
    const total = GENERATED_TOOLS.length;
    const withOutput = GENERATED_TOOLS.filter((t) => t.hasOutput).length;
    const ratio = withOutput / total;
    expect(ratio).toBeGreaterThanOrEqual(0.97);
  });

  it('chart, synastry and other compute endpoints have outputSchemas', () => {
    const sampleNames = ['chart', 'synastry', 'horoscope_daily', 'reports_natal', 'interpret_natal'];
    for (const n of sampleNames) {
      const t = GENERATED_TOOLS.find((x) => x.name === n);
      expect(t, `tool ${n} not registered`).toBeDefined();
      expect(t!.hasOutput, `${n} should have output`).toBe(true);
    }
  });
});

describe('outputSchema is registrable as ZodRawShape', () => {
  it('chart output schema is a ZodObject and has .shape', () => {
    const sch = OUTPUT_SCHEMAS['chart'];
    expect(sch).toBeDefined();
    expect(sch instanceof z.ZodObject).toBe(true);
    const shape = (sch as z.ZodObject<any>).shape;
    expect(typeof shape).toBe('object');
    expect(Object.keys(shape).length).toBeGreaterThan(0);
  });
});
