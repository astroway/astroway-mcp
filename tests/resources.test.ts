import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllResources } from '../src/resources.js';
import { REFERENCE_RESOURCES } from '../src/resources.generated.js';

interface InternalResource {
  metadata?: { title?: string; description?: string; mimeType?: string };
  readCallback: (uri: URL) => Promise<{ contents: { uri: string; text: string; mimeType?: string }[] }>;
}

describe('REFERENCE_RESOURCES generated map', () => {
  it('contains exactly 14 entries (matches /v1/reference/* count)', () => {
    expect(Object.keys(REFERENCE_RESOURCES)).toHaveLength(14);
  });

  it('every entry has title, description, apiPath, data', () => {
    for (const [slug, info] of Object.entries(REFERENCE_RESOURCES)) {
      expect(info.title, `${slug} title`).toBeTruthy();
      expect(info.description, `${slug} description`).toBeTruthy();
      expect(info.apiPath, `${slug} apiPath`).toMatch(/^\/reference\/[a-z-]+$/);
      expect(info.data, `${slug} data`).toBeDefined();
    }
  });

  it('contains zodiac-signs with 12 items', () => {
    const r = REFERENCE_RESOURCES['zodiac-signs'];
    expect(r).toBeDefined();
    const data = r.data as { items: unknown[]; count: number };
    expect(data.items).toBeInstanceOf(Array);
    expect(data.count).toBe(12);
  });

  it('contains nakshatras with 27 items', () => {
    const r = REFERENCE_RESOURCES['nakshatras'];
    const data = r.data as { items: unknown[]; count: number };
    expect(data.count).toBe(27);
  });

  it('contains decans with 36 items', () => {
    const r = REFERENCE_RESOURCES['decans'];
    const data = r.data as { items: unknown[]; count: number };
    expect(data.count).toBe(36);
  });
});

describe('registerAllResources', () => {
  let server: McpServer;
  let count: number;
  let registry: Record<string, InternalResource>;

  beforeAll(() => {
    server = new McpServer({ name: 'test', version: '0.0.0' });
    count = registerAllResources(server);
    registry = (server as unknown as { _registeredResources: Record<string, InternalResource> })._registeredResources ?? {};
  });

  it('registers all 14 resources', () => {
    expect(count).toBe(14);
  });

  it('uses astroway://reference/<slug> URIs', () => {
    const uris = Object.keys(registry);
    for (const slug of Object.keys(REFERENCE_RESOURCES)) {
      expect(uris, `slug ${slug}`).toContain(`astroway://reference/${slug}`);
    }
  });

  it('attaches application/json mimeType', () => {
    const r = registry['astroway://reference/zodiac-signs'];
    expect(r?.metadata?.mimeType).toBe('application/json');
  });

  it('read callback returns embedded data without network calls', async () => {
    const r = registry['astroway://reference/zodiac-signs'];
    expect(r).toBeDefined();
    const result = await r.readCallback(new URL('astroway://reference/zodiac-signs'));
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe('application/json');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.items).toBeInstanceOf(Array);
    expect(parsed.count).toBe(12);
  });

  it('read callback for hellenistic-lots returns expected lots', async () => {
    const r = registry['astroway://reference/hellenistic-lots'];
    const result = await r.readCallback(new URL('astroway://reference/hellenistic-lots'));
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.items).toBeInstanceOf(Array);
    const names = (parsed.items as { name: string }[]).map((it) => it.name);
    expect(names).toContain('Fortune');
  });
});
