/**
 * Regression: 'typed' tools whose component schema is an intersection / union /
 * array / record are exposed as a single `body` field. They MUST run the
 * generic unwrap transform — a bare `(p) => p` forwards `{ body: {...} }` and
 * the API (expecting the flat object) rejects it with INVALID_INPUT. This broke
 * ~94 core tools (transits, progressions, returns, profections, interpret/*,
 * render/*, every vedic/dashas/*) on both the npm package and the hosted server.
 *
 * Locks the real predicate `isTypedBodyWrapped` against the real generated
 * catalogue, plus the input→POST body contract that depends on it.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { GENERATED_TOOLS, TYPED_SCHEMAS } from '../src/tools.generated.js';
import { isTypedBodyWrapped } from '../src/typed-body.js';

// Mirror of the runtime pieces in src/index.ts that depend on the predicate.
const genericShape = { body: z.record(z.string(), z.unknown()) };
function resolveTypedShape(componentName: string): Record<string, z.ZodTypeAny> {
  const schema = TYPED_SCHEMAS[componentName];
  if (!schema) return genericShape;
  if (schema instanceof z.ZodObject) return schema.shape as Record<string, z.ZodTypeAny>;
  return { body: schema };
}
const unwrap = (p: Record<string, any>): Record<string, unknown> =>
  (typeof p.body === 'object' && p.body !== null ? (p.body as Record<string, unknown>) : p);
const passthrough = (p: Record<string, any>): Record<string, unknown> => p;
function transformFor(tool: typeof GENERATED_TOOLS[number]): (p: Record<string, any>) => Record<string, unknown> {
  return isTypedBodyWrapped(tool) ? unwrap : passthrough;
}

const typedTools = GENERATED_TOOLS.filter((t) => t.schemaKind === 'typed' && t.typedRef);

describe('isTypedBodyWrapped matches the actual component schema type', () => {
  it('returns true exactly for non-ZodObject typed schemas', () => {
    for (const t of typedTools) {
      const s = TYPED_SCHEMAS[t.typedRef!];
      const expected = !s || !(s instanceof z.ZodObject);
      expect(isTypedBodyWrapped(t), t.name).toBe(expected);
    }
  });

  it('flags a meaningful number of tools (the intersection set), not zero', () => {
    const wrapped = typedTools.filter(isTypedBodyWrapped);
    // ~94 at time of writing; guard against the predicate silently going no-op.
    expect(wrapped.length).toBeGreaterThan(50);
  });

  it('non-typed tools are never flagged', () => {
    for (const t of GENERATED_TOOLS.filter((x) => x.schemaKind !== 'typed')) {
      expect(isTypedBodyWrapped(t), t.name).toBe(false);
    }
  });
});

describe('no typed tool ever double-wraps the POST body', () => {
  it('a body-wrapped client call is unwrapped to the flat object the API expects', () => {
    for (const t of typedTools) {
      const exposesBodyOnly = Object.keys(resolveTypedShape(t.typedRef!)).join(',') === 'body';
      if (!exposesBodyOnly) continue; // flat ZodObject typed tool — client sends flat
      const sample = { date: '1990-05-15', time: '14:30:00', transitDate: '2026-06-21' };
      const posted = transformFor(t)({ body: sample });
      // The unwrapped body must be the raw object — never { body: {...} }.
      expect(posted, t.name).toEqual(sample);
      expect('body' in posted && typeof (posted as any).body === 'object', t.name).toBe(false);
    }
  });
});

describe('concrete regression — transits', () => {
  const transits = GENERATED_TOOLS.find((t) => t.name === 'transits')!;

  it('exists and is body-wrapped (intersection schema)', () => {
    expect(transits).toBeTruthy();
    expect(isTypedBodyWrapped(transits)).toBe(true);
  });

  it('posts a flat body with date/time/transitDate at the top level', () => {
    const args = {
      body: { date: '1990-05-15', time: '14:30:00', timezoneOffset: 3, latitude: 50.45, longitude: 30.52, transitDate: '2026-06-21' },
    };
    const posted = transformFor(transits)(args);
    expect(posted).toHaveProperty('date', '1990-05-15');
    expect(posted).toHaveProperty('transitDate', '2026-06-21');
    expect(posted).not.toHaveProperty('body');
  });

  it('the OLD passthrough transform would have double-wrapped (documents the bug)', () => {
    const args = { body: { date: '1990-05-15', time: '14:30:00', transitDate: '2026-06-21' } };
    const brokenPosted = passthrough(args);
    expect(brokenPosted).toHaveProperty('body'); // == what the API rejected
    expect(brokenPosted).not.toHaveProperty('date');
  });
});
