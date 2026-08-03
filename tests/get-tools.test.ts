import { describe, it, expect } from 'vitest';

import { GENERATED_TOOLS } from '../src/tools.generated.js';

/**
 * v1.2 — GET lookups became tools. Before this every generator filtered on
 * methods.post, so 93 GET-only paths reached no consumer. These guard the two
 * ways the feature can silently rot: the generator quietly reverting to
 * POST-only, and a GET tool being registered with a body-shaped input schema.
 */
describe('GET lookup tools', () => {
  const getTools = GENERATED_TOOLS.filter((t) => t.httpMethod === 'GET');

  it('the catalogue actually contains GET tools', () => {
    expect(getTools.length).toBeGreaterThan(30);
  });

  it('a representative lookup from each family is present', () => {
    const endpoints = new Set(getTools.map((t) => t.endpoint));
    for (const ep of [
      '/acg/categories',
      '/muhurta/types',
      '/esoteric/crystals',
      '/tarot/rider-waite/majors',
      '/zodiac/leo',
      '/translate/languages',
    ]) {
      expect(endpoints.has(ep), `${ep} should be a GET tool`).toBe(true);
    }
  });

  /* The runtime sends no body for these, so a body-shaped schema would ask the
     agent for fields that are then dropped on the floor. */
  it('every GET tool uses the empty input schema', () => {
    for (const t of getTools) {
      expect(t.schemaKind, `${t.name} should be schemaKind none`).toBe('none');
      expect(t.typedRef, `${t.name} should carry no typedRef`).toBeUndefined();
    }
  });

  it('POST tools are untouched and never carry httpMethod', () => {
    const postTools = GENERATED_TOOLS.filter((t) => t.httpMethod !== 'GET');
    expect(postTools.length).toBeGreaterThan(600);
    for (const t of postTools) {
      expect(t.httpMethod).toBeUndefined();
      expect(t.schemaKind).not.toBe('none');
    }
  });

  /* Path templates need a parameter surface that does not exist yet. If one
     appears here it will be called with the literal braces in the URL. */
  it('no tool endpoint carries an unsubstituted path parameter', () => {
    for (const t of GENERATED_TOOLS) {
      expect(/\{[^}]+\}/.test(t.endpoint), `${t.name} has a path template`).toBe(false);
    }
  });
});
