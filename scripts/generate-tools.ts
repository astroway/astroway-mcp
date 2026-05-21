/**
 * Build-time generator: fetch the live AstroWay OpenAPI spec, classify each
 * POST endpoint by input shape, emit `src/tools.generated.ts` for the MCP
 * server to register.
 *
 * v0.4+ — emits TYPED Zod schemas for endpoints whose openapi.json schema
 * is a `$ref` into `components.schemas`. The referenced JSON Schema is
 * converted to Zod source code via `json-schema-to-zod` and embedded inline.
 * Endpoints without typed schemas fall back to the 7 hand-written shapes
 * (chart, twoChart, chartTarget, etc.) via the heuristic classifier.
 *
 * v0.3+ — also injects credit-cost annotation into each tool description by
 * fetching /v1/public/endpoint-costs (falls back to no annotation if endpoint
 * is unreachable, build still succeeds).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const OPENAPI_URL = process.env.ASTROWAY_OPENAPI_URL ?? 'https://api.astroway.info/v1/openapi.json';
const COSTS_URL = process.env.ASTROWAY_COSTS_URL ?? 'https://api.astroway.info/v1/public/endpoint-costs';

type SchemaKind =
  | 'chart' | 'twoChart' | 'chartTarget'
  | 'horoscopeSign' | 'horoscopeCompat'
  | 'year' | 'date' | 'generic'
  | 'typed'; // ← new in v0.4

interface GeneratedTool {
  name: string;
  description: string;
  endpoint: string;
  schemaKind: SchemaKind;
  group: string;
  cost?: number;
  tier?: string;
  /** Component name for typedSchemaKind — references an entry in TYPED_SCHEMAS map. */
  typedRef?: string;
}

interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: unknown[];
  deprecated?: boolean;
  requestBody?: {
    content?: {
      'application/json'?: {
        example?: unknown;
        schema?: { $ref?: string; type?: string };
      };
    };
  };
}

interface OpenAPIDoc {
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

interface CostManifest {
  endpoints: Record<string, { tier: string; cost: number }>;
}

function sanitizeName(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/[/-]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

const TWO_CHART_PREFIXES = [
  '/synastry', '/composite', '/davison',
  '/interpret/synastry', '/horoscope/compatibility-personalised',
  '/vedic/compatibility/', '/cross/synastry',
  '/reports/synastry', '/reports/ai/synastry',
];

const CHART_TARGET_HINTS = [
  '/transits', '/progressions', '/solar-return', '/lunar-return',
  '/secondary-progressions', '/saturn-return', '/transit-calendar',
  '/dashas/', '/lunar-phase-day', '/at-date',
];

function classifyFallback(endpointPath: string, body: string | null): SchemaKind {
  // Robust check first — body containing both `chart1` and `chart2` keys is unambiguously two-chart.
  if (body && /"chart1"\s*:/.test(body) && /"chart2"\s*:/.test(body)) {
    return 'twoChart';
  }
  for (const p of TWO_CHART_PREFIXES) {
    if (endpointPath.startsWith(p) || endpointPath === p) return 'twoChart';
  }
  for (const h of CHART_TARGET_HINTS) {
    if (endpointPath.includes(h)) return 'chartTarget';
  }
  if (endpointPath.startsWith('/horoscope/compatibility')) return 'horoscopeCompat';
  if (endpointPath.startsWith('/horoscope/')) return 'horoscopeSign';
  if (body && /"year"\s*:/.test(body) && !/"date"/.test(body)) return 'year';
  if (body && /"date"/.test(body) && !/"latitude"/.test(body) && !/"chart1_date"/.test(body)) return 'date';
  if (body && /"date"/.test(body) && /"time"/.test(body) && /"latitude"/.test(body)) return 'chart';
  return 'generic';
}

function trimDesc(desc: string, max = 380): string {
  const clean = desc.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + '…';
}

const TIER_NAMES: Record<string, string> = {
  TIER_HALF: 'Tier ½', TIER_1: 'Tier 1', TIER_2: 'Tier 2', TIER_3: 'Tier 3',
  TIER_4: 'Tier 4', TIER_4_5: 'Tier 4.5', TIER_5: 'Tier 5', TIER_6: 'Tier 6',
  TIER_7: 'Tier 7', TIER_8: 'Tier 8',
};

function buildDescription(rawDesc: string, body: string | null, group: string, cost?: number, tier?: string, deprecated?: boolean): string {
  let out = trimDesc(rawDesc);
  out += `\n\n[Group: ${group}]`;
  if (cost !== undefined) {
    const tierLabel = tier && TIER_NAMES[tier] ? ` (${TIER_NAMES[tier]})` : '';
    const formatted = cost >= 1000 ? cost.toLocaleString('en-US') : String(cost);
    let costLine = `[Cost: ${formatted} credit${cost === 1 ? '' : 's'}${tierLabel}]`;
    if (cost >= 1000) {
      const pct = Math.round((cost / 10000) * 100);
      costLine += ` ⚠️ Premium — ~${pct}% of free monthly budget. Confirm with user before invoking.`;
    } else if (cost >= 250) {
      costLine += ` ⚠️ Heavy — confirm with user before invoking.`;
    }
    out += `\n${costLine}`;
  }
  if (deprecated) {
    out += `\n[⚠️ DEPRECATED — will be removed in a future API version. Avoid using.]`;
  }
  if (body && body.trim() && body !== 'null' && body.length < 320) {
    out += `\n\nExample request body: ${body.trim()}`;
  }
  return out;
}

async function fetchCostManifest(): Promise<CostManifest> {
  try {
    console.log(`[generate-tools] fetching cost manifest from ${COSTS_URL}`);
    const res = await fetch(COSTS_URL);
    if (!res.ok) {
      console.warn(`[generate-tools] cost manifest fetch failed: ${res.status}. Annotations will be skipped.`);
      return { endpoints: {} };
    }
    const json = await res.json() as { ok: boolean; data?: CostManifest };
    if (json.ok && json.data) {
      const count = Object.keys(json.data.endpoints).length;
      console.log(`[generate-tools] loaded cost manifest: ${count} endpoints`);
      return json.data;
    }
    console.warn(`[generate-tools] cost manifest invalid response. Annotations will be skipped.`);
    return { endpoints: {} };
  } catch (e: any) {
    console.warn(`[generate-tools] cost manifest unavailable: ${e?.message}. Annotations will be skipped.`);
    return { endpoints: {} };
  }
}

/** Resolve a $ref like "#/components/schemas/ChartInput" to the component name. */
function refToComponentName(ref: string): string | null {
  const m = ref.match(/^#\/components\/schemas\/(.+)$/);
  return m ? m[1] : null;
}

async function main(): Promise<void> {
  console.log(`[generate-tools] fetching OpenAPI from ${OPENAPI_URL}`);
  const res = await fetch(OPENAPI_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const doc = (await res.json()) as OpenAPIDoc;
  const costs = await fetchCostManifest();

  const components = doc.components?.schemas ?? {};
  const componentNames = Object.keys(components).sort();
  console.log(`[generate-tools] openapi has ${componentNames.length} components.schemas`);

  const tools: GeneratedTool[] = [];
  const skippedReason: Record<string, number> = {};
  let costAnnotated = 0;
  let typedCount = 0;

  for (const [path, methods] of Object.entries(doc.paths)) {
    const op = methods.post;
    if (!op) {
      skippedReason['non-post'] = (skippedReason['non-post'] ?? 0) + 1;
      continue;
    }
    if (/\{[^}]+\}/.test(path)) {
      console.warn(`[generate-tools] skipping path-template endpoint: ${path}`);
      skippedReason['path-template-unsupported'] = (skippedReason['path-template-unsupported'] ?? 0) + 1;
      continue;
    }
    const tags = op.tags ?? [];
    const group = tags[0] ?? 'Uncategorized';
    if (group === 'System') {
      skippedReason['system-group'] = (skippedReason['system-group'] ?? 0) + 1;
      continue;
    }
    if (!op.security || op.security.length === 0) {
      skippedReason['public-no-auth'] = (skippedReason['public-no-auth'] ?? 0) + 1;
      continue;
    }
    if (op.deprecated && process.env.SKIP_DEPRECATED === '1') {
      skippedReason['deprecated'] = (skippedReason['deprecated'] ?? 0) + 1;
      continue;
    }
    const example = op.requestBody?.content?.['application/json']?.example;
    const body = example != null ? JSON.stringify(example) : null;
    const desc = op.description ?? op.summary ?? '';

    // v0.4 — prefer typed schema if openapi.json provides $ref
    const schemaSpec = op.requestBody?.content?.['application/json']?.schema;
    let kind: SchemaKind;
    let typedRef: string | undefined;
    if (schemaSpec?.$ref) {
      const compName = refToComponentName(schemaSpec.$ref);
      if (compName && components[compName]) {
        kind = 'typed';
        typedRef = compName;
        typedCount++;
      } else {
        kind = classifyFallback(path, body);
      }
    } else {
      kind = classifyFallback(path, body);
    }

    const costInfo = costs.endpoints[path];
    if (costInfo) costAnnotated++;

    tools.push({
      name: sanitizeName(path),
      description: buildDescription(desc, body, group, costInfo?.cost, costInfo?.tier, op.deprecated),
      endpoint: path,
      schemaKind: kind,
      group,
      cost: costInfo?.cost,
      tier: costInfo?.tier,
      typedRef,
    });
  }

  // Dedupe by tool name (sanitized path).
  const seen = new Map<string, GeneratedTool>();
  for (const t of tools) {
    if (!seen.has(t.name)) seen.set(t.name, t);
  }
  const unique = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Find which components are referenced by at least one typed tool (so we only emit needed ones).
  const usedComponents = new Set<string>();
  for (const t of unique) {
    if (t.typedRef) usedComponents.add(t.typedRef);
  }

  // Emit Zod source for each used component via json-schema-to-zod.
  // The library returns a string like 'z.object({...})'.
  const componentZod: Record<string, string> = {};
  for (const compName of usedComponents) {
    const comp = components[compName];
    if (!comp) continue;
    try {
      // Resolve $refs in nested schemas: json-schema-to-zod doesn't follow $refs by default.
      // We pass the full doc so it can resolve them via the resolveAllRefs/inline option.
      // Strategy: replace any nested $ref pointing to components.schemas/X with the inlined component.
      const inlined = inlineRefs(comp, components);
      const zodSrc = jsonSchemaToZod(inlined as any);
      componentZod[compName] = zodSrc;
    } catch (e: any) {
      console.warn(`[generate-tools] failed to convert ${compName}: ${e?.message}. Will fall back to z.unknown().`);
    }
  }

  const kindCounts = unique.reduce<Record<string, number>>((acc, t) => {
    acc[t.schemaKind] = (acc[t.schemaKind] ?? 0) + 1;
    return acc;
  }, {});

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, '..', 'src');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'tools.generated.ts');
  const banner = `/* AUTO-GENERATED — do not edit. Regenerate via 'npm run build' (runs scripts/generate-tools.ts). */`;

  // Emit TYPED_SCHEMAS as a const map: componentName -> Zod schema instance.
  // Each value is the raw Zod source returned by json-schema-to-zod, which we wrap
  // as the right-hand side of an assignment.
  const typedSchemaEntries = Array.from(usedComponents).sort().map((name) => {
    const src = componentZod[name];
    if (!src) return `  ${JSON.stringify(name)}: z.unknown(),`;
    return `  ${JSON.stringify(name)}: ${src},`;
  });

  const fileBody = `${banner}

import { z } from 'zod';

export type SchemaKind =
  | 'chart' | 'twoChart' | 'chartTarget'
  | 'horoscopeSign' | 'horoscopeCompat'
  | 'year' | 'date' | 'generic'
  | 'typed';

export interface GeneratedTool {
  name: string;
  description: string;
  endpoint: string;
  schemaKind: SchemaKind;
  group: string;
  cost?: number;
  tier?: string;
  typedRef?: string;
}

/**
 * Typed schemas extracted from /v1/openapi.json's components.schemas at build time.
 * Used by tools whose schemaKind === 'typed' (looked up via tool.typedRef).
 */
export const TYPED_SCHEMAS: Record<string, z.ZodTypeAny> = {
${typedSchemaEntries.join('\n')}
};

export const GENERATED_TOOLS: readonly GeneratedTool[] = ${JSON.stringify(unique, null, 2)} as const;
`;

  writeFileSync(outPath, fileBody, 'utf8');

  console.log(`[generate-tools] wrote ${unique.length} tools → src/tools.generated.ts`);
  console.log(`[generate-tools] cost annotated: ${costAnnotated}/${unique.length}`);
  console.log(`[generate-tools] typed schemas: ${typedCount} tools, ${usedComponents.size} components`);
  console.log(`[generate-tools] schema kinds: ${JSON.stringify(kindCounts)}`);
  console.log(`[generate-tools] skipped: ${JSON.stringify(skippedReason)}`);
}

/**
 * Recursively inline `$ref`s pointing to `#/components/schemas/X` so that
 * json-schema-to-zod can convert without a registry. We deep-clone to avoid
 * mutating the original spec.
 */
function inlineRefs(schema: unknown, components: Record<string, unknown>, seen = new Set<string>()): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map((s) => inlineRefs(s, components, seen));
  const obj = schema as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    const m = obj.$ref.match(/^#\/components\/schemas\/(.+)$/);
    if (m && components[m[1]] && !seen.has(m[1])) {
      const newSeen = new Set(seen);
      newSeen.add(m[1]);
      return inlineRefs(components[m[1]], components, newSeen);
    }
    // Circular or unresolvable — drop the $ref to avoid infinite recursion
    return { type: 'object' };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = inlineRefs(v, components, seen);
  }
  return out;
}

main().catch((err) => {
  console.error('[generate-tools] FAILED:', err);
  process.exit(1);
});
