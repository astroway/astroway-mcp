/**
 * v1.5: GET /v1/natal-texts as an MCP tool.
 *
 * The tool is entirely generator-driven (no hand-written route in src/index.ts):
 * schemaKind 'typed' with a synthetic QueryParams_natal_texts component built
 * from the two declared query parameters, and an inferred OUTPUT_SCHEMAS entry
 * for the { lang, texts, missing } response shape. These tests pin the pieces
 * a live-spec drift could silently break: the tool's identity, the required
 * input shape, the query string actually sent over the wire, the guardrail
 * line telling the calling agent not to invent text for a key in `missing`,
 * and that a response's `missing` array survives output-schema validation.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { GENERATED_TOOLS, TYPED_SCHEMAS, OUTPUT_SCHEMAS } from '../src/tools.generated.js';
import { toQueryString } from '../src/http-params.js';
import { deepOpenOutput } from '../src/output-schema.js';

const tool = GENERATED_TOOLS.find((t) => t.endpoint === '/natal-texts');

describe('natal-texts tool identity', () => {
  it('is registered as a GET tool under the Reference group', () => {
    expect(tool, '/natal-texts should be a generated tool').toBeDefined();
    expect(tool!.name).toBe('natal_texts');
    expect(tool!.prefixedName).toBe('astroway_reference_natal_texts');
    expect(tool!.httpMethod).toBe('GET');
    expect(tool!.group).toBe('Reference');
    expect(tool!.schemaKind).toBe('typed');
    expect(tool!.typedRef).toMatch(/^QueryParams_/);
    expect(tool!.hasOutput).toBe(true);
  });

  it('carries no pathParams (query-string input, not a template)', () => {
    expect(tool!.pathParams).toBeUndefined();
  });

  it('description tells the calling agent missing keys must not be invented', () => {
    expect(tool!.description).toContain('`missing`');
    expect(tool!.description).toMatch(/do not invent/i);
  });

  it('site-key provisioning endpoints never became tools', () => {
    const names = new Set(GENERATED_TOOLS.map((t) => t.endpoint));
    expect(names.has('/site-keys')).toBe(false);
    expect(names.has('/site-keys/connect/exchange')).toBe(false);
  });
});

describe('natal-texts input schema', () => {
  const schema = TYPED_SCHEMAS[tool!.typedRef!] as z.ZodObject<any>;

  it('is a ZodObject with exactly keys + lang', () => {
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(schema.shape).sort()).toEqual(['keys', 'lang']);
  });

  it('accepts a valid comma list + supported lang', () => {
    const res = schema.safeParse({ keys: 'sun.aries,moon.h4,sun_moon.trine', lang: 'uk' });
    expect(res.success).toBe(true);
  });

  it('requires keys', () => {
    expect(schema.safeParse({ lang: 'en' }).success).toBe(false);
  });

  it('requires lang', () => {
    expect(schema.safeParse({ keys: 'sun.aries' }).success).toBe(false);
  });

  it('rejects a lang outside the 20-code enum', () => {
    expect(schema.safeParse({ keys: 'sun.aries', lang: 'zz' }).success).toBe(false);
    expect(schema.safeParse({ keys: 'sun.aries', lang: 'ru' }).success).toBe(false); // not in the natal-texts set
  });

  it('accepts every documented language code', () => {
    const codes = ['uk', 'en', 'de', 'pl', 'es', 'pt', 'fr', 'it', 'nl', 'cs', 'ro', 'hu', 'el', 'tr', 'ar', 'hi', 'ja', 'ko', 'vi', 'id'];
    for (const lang of codes) {
      expect(schema.safeParse({ keys: 'sun.aries', lang }).success, lang).toBe(true);
    }
  });
});

describe('natal-texts query string sent on the wire', () => {
  it('joins a comma list and lang into the querystring the API expects', () => {
    const qs = toQueryString({ keys: 'sun.aries,moon.h4,sun_moon.trine', lang: 'en' });
    expect(qs).toBe('?keys=sun.aries%2Cmoon.h4%2Csun_moon.trine&lang=en');
  });

  it('drops nothing when a single key is requested', () => {
    expect(toQueryString({ keys: 'ascendant.leo', lang: 'de' })).toBe('?keys=ascendant.leo&lang=de');
  });
});

describe('natal-texts output schema', () => {
  const opened = deepOpenOutput(OUTPUT_SCHEMAS['natal_texts']);

  it('parses a response where every requested key resolved', () => {
    const res = opened.safeParse({
      lang: 'en',
      texts: {
        'sun.aries': { title: 'Sun in Aries', body: 'Paragraph one.\n\nParagraph two.', kind: 'planet_in_sign' },
        'moon.h4': { title: 'Moon in the 4th house', body: 'Body text.', kind: 'planet_in_house' },
        'sun_moon.trine': { title: 'Sun trine Moon', body: 'Body text.', kind: 'aspect' },
      },
      missing: [],
    });
    expect(res.success).toBe(true);
  });

  it('parses a response that lists unresolved keys in `missing` and drops them from `texts`', () => {
    const res = opened.safeParse({
      lang: 'ja',
      texts: {
        'sun.aries': { title: 'Sun in Aries', body: 'Text.', kind: 'planet_in_sign' },
      },
      missing: ['moon.h4', 'sun_moon.trine'],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.missing).toEqual(['moon.h4', 'sun_moon.trine']);
      expect(Object.keys(res.data.texts as Record<string, unknown>)).not.toContain('moon.h4');
    }
  });

  it('accepts a key that the inferred schema never saw an example of', () => {
    // The inferred component only carries the one example key ("sun.aries") the
    // spec's response example happened to use; deepOpenOutput must reopen the
    // object so a real chart's other 100+ keys still validate.
    const res = opened.safeParse({
      lang: 'en',
      texts: {
        'chiron.pisces': { title: 'Chiron in Pisces', body: 'Text.', kind: 'planet_in_sign' },
        'lilith.h7': { title: 'Lilith in the 7th house', body: 'Text.', kind: 'planet_in_house' },
      },
      missing: [],
    });
    expect(res.success).toBe(true);
  });
});
