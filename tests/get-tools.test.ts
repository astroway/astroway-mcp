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
     agent for fields that are then dropped on the floor. Templated lookups are
     the exception: their input is the path parameters. */
  it('every parameterless GET tool uses the empty input schema', () => {
    for (const t of getTools.filter((x) => !x.pathParams)) {
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

  /* v1.3: templated endpoints are tools. Every brace must have a matching
     entry in pathParams, or the runtime calls the URL with literal braces. */
  it('every templated endpoint declares its braces in pathParams', () => {
    const templated = GENERATED_TOOLS.filter((t) => /\{[^}]+\}/.test(t.endpoint));
    expect(templated.length).toBeGreaterThan(15);
    for (const t of templated) {
      const braces = [...t.endpoint.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      expect(t.pathParams, `${t.name} has braces but no pathParams`).toBeDefined();
      for (const b of braces) {
        expect(t.pathParams, `${t.name} missing pathParam ${b}`).toContain(b);
      }
      /* The input schema has to ask for them, otherwise an agent has no way to
         supply what the URL needs. */
      expect(t.schemaKind, `${t.name} should carry a typed input schema`).toBe('typed');
    }
  });

  it('a tool without braces never claims pathParams', () => {
    for (const t of GENERATED_TOOLS.filter((x) => !/\{[^}]+\}/.test(x.endpoint))) {
      expect(t.pathParams, `${t.name} should have no pathParams`).toBeUndefined();
    }
  });
});
