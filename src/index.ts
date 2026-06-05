#!/usr/bin/env node
/**
 * @astroway/mcp — MCP server exposing the AstroWay API as tools for LLM agents.
 *
 * Generated tools come from build-time fetch of /v1/openapi.json
 * (see scripts/generate-tools.ts). Built-in tools (account_status, cost_estimate)
 * are hand-coded and registered alongside the generated ones.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { GENERATED_TOOLS, TYPED_SCHEMAS, OUTPUT_SCHEMAS, type SchemaKind } from './tools.generated.js';
import { fetchAccountStatus } from './tools/account-status.js';
import { loadCostManifest, estimateOne, formatEstimate } from './tools/cost-estimate.js';
import { fetchWithRetry } from './retry.js';
import { registerAllPrompts } from './prompts.js';
import { registerAllResources } from './resources.js';
import { MCP_VERSION } from './version.js';

const API_KEY = process.env.ASTROWAY_API_KEY ?? '';
const BASE_URL = process.env.ASTROWAY_BASE_URL ?? 'https://api.astroway.info/v1';
const VERBOSE = process.env.ASTROWAY_VERBOSE === '1' || process.env.ASTROWAY_VERBOSE === 'true';

if (!API_KEY) {
  console.error('Error: ASTROWAY_API_KEY environment variable is required.');
  console.error('Get a key at https://api.astroway.info/dashboard/sign-up — 10,000 credits/month free.');
  console.error('Then set: export ASTROWAY_API_KEY="aw_live_..." (or aw_test_... for sandbox).');
  process.exit(1);
}

// ─── HTTP caller ─────────────────────────────────────────────

interface CallResult {
  /** Pretty-printed text representation for the LLM's content channel. */
  text: string;
  /** Parsed `data` payload, or undefined on error/network failure. */
  structured?: unknown;
}

async function callApi(endpoint: string, body: Record<string, unknown>): Promise<CallResult> {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  if (VERBOSE) console.error(`[astroway-mcp] → POST ${url}\n  body: ${JSON.stringify(body).slice(0, 500)}`);
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'User-Agent': `astroway-mcp/${MCP_VERSION}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
    if (VERBOSE) console.error(`[astroway-mcp] ← ${res.status} ${res.statusText}`);
    if (!res.ok || !json.ok) {
      const err = json.error ?? {};
      const code = err.code ?? 'UNKNOWN';
      const message = err.message ?? 'Unknown error';
      let hint = '';
      if (code === 'RATE_LIMITED' || res.status === 429) {
        hint = '\n\nHint: rate limit exceeded. Wait 60s or upgrade tier (call `astroway_account_status` to see current limit).';
      } else if (code === 'OUT_OF_CREDITS' || code === 'PLAN_UPGRADE_REQUIRED' || res.status === 402) {
        hint = '\n\nHint: budget exceeded or endpoint requires a higher tier. Call `astroway_account_status` to check.';
      } else if (code === 'INVALID_KEY' || res.status === 401) {
        hint = '\n\nHint: API key invalid or revoked. Generate a new one at https://api.astroway.info/dashboard/keys.';
      }
      return { text: `Error ${res.status} (${code}): ${message}${hint}` };
    }
    return { text: JSON.stringify(json.data, null, 2), structured: json.data };
  } catch (e: any) {
    return { text: `Network error calling ${endpoint}: ${e?.message ?? 'unknown'}. Check your connection or ASTROWAY_BASE_URL.` };
  }
}

// ─── Schema shapes (one per SchemaKind) ──────────────────────

const chartShape = {
  date: z.string().describe('Birth date YYYY-MM-DD'),
  time: z.string().describe('Birth time HH:mm:ss (local)'),
  timezoneOffset: z.number().default(0).describe('UTC offset in hours (e.g. 3 for UTC+3, -5 for EST)'),
  latitude: z.number().default(0).describe('Birth latitude in decimal degrees'),
  longitude: z.number().default(0).describe('Birth longitude in decimal degrees'),
  houseSystem: z.string().optional().describe('House system: P=Placidus (default), K=Koch, W=Whole Sign, E=Equal'),
  city: z.string().optional().describe('City name (display only)'),
} as const;

const twoChartShape = {
  chart1_date: z.string().describe('Person 1 birth date YYYY-MM-DD'),
  chart1_time: z.string().describe('Person 1 birth time HH:mm:ss'),
  chart1_tz: z.number().default(0).describe('Person 1 UTC offset in hours'),
  chart1_lat: z.number().default(0).describe('Person 1 latitude'),
  chart1_lon: z.number().default(0).describe('Person 1 longitude'),
  chart2_date: z.string().describe('Person 2 birth date YYYY-MM-DD'),
  chart2_time: z.string().describe('Person 2 birth time HH:mm:ss'),
  chart2_tz: z.number().default(0).describe('Person 2 UTC offset in hours'),
  chart2_lat: z.number().default(0).describe('Person 2 latitude'),
  chart2_lon: z.number().default(0).describe('Person 2 longitude'),
  language: z.enum(['uk', 'en']).optional().describe('Output language for AI interpretations (en default)'),
} as const;

const chartTargetShape = {
  ...chartShape,
  targetDate: z.string().optional().describe('Target date YYYY-MM-DD for transit/progression/return/dasha lookup (default: today)'),
  targetTime: z.string().optional().describe('Target time HH:mm:ss (default 12:00:00 UTC)'),
  targetTzOffset: z.number().optional().describe('Target UTC offset in hours (default 0)'),
} as const;

const SIGN_ENUM = z.enum([
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]);

const horoscopeSignShape = {
  sign: SIGN_ENUM.describe('Zodiac sign'),
  date: z.string().optional().describe('Date YYYY-MM-DD (default: today)'),
  language: z.enum(['uk', 'en']).optional().describe('Output language (en default)'),
} as const;

const horoscopeCompatShape = {
  sign1: SIGN_ENUM.describe('First zodiac sign'),
  sign2: SIGN_ENUM.describe('Second zodiac sign'),
  language: z.enum(['uk', 'en']).optional().describe('Output language (en default)'),
} as const;

const yearShape = {
  year: z.number().int().describe('Year (e.g. 2026)'),
} as const;

const dateShape = {
  date: z.string().describe('Date YYYY-MM-DD'),
  latitude: z.number().optional().describe('Latitude (some date-only endpoints accept location)'),
  longitude: z.number().optional().describe('Longitude'),
  timezoneOffset: z.number().optional().describe('UTC offset in hours'),
} as const;

const genericShape = {
  body: z.record(z.string(), z.unknown()).describe('Raw JSON body — see the example in the tool description for required fields'),
} as const;

const SCHEMAS: Record<SchemaKind, Record<string, z.ZodTypeAny>> = {
  chart: chartShape,
  twoChart: twoChartShape,
  chartTarget: chartTargetShape,
  horoscopeSign: horoscopeSignShape,
  horoscopeCompat: horoscopeCompatShape,
  year: yearShape,
  date: dateShape,
  generic: genericShape,
  typed: genericShape, // sentinel — actual shape resolved per tool from TYPED_SCHEMAS
};

/**
 * For 'typed' tools, resolve the inputSchema from TYPED_SCHEMAS[componentName].
 * Returns a ZodRawShape. Falls back to genericShape if the component isn't a ZodObject.
 */
function resolveTypedShape(componentName: string): Record<string, z.ZodTypeAny> {
  const schema = TYPED_SCHEMAS[componentName];
  if (!schema) return genericShape;
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  // Non-object root (e.g. an array) — wrap so MCP gets a single 'body' field.
  return { body: schema };
}

// ─── Body transformers ───────────────────────────────────────

function chartBody(p: Record<string, unknown>): Record<string, unknown> {
  const { houseSystem, city, ...rest } = p;
  const out: Record<string, unknown> = { ...rest };
  if (houseSystem !== undefined) out.houseSystem = houseSystem;
  if (city !== undefined) out.city = city;
  return out;
}

function twoChartBody(p: Record<string, any>): Record<string, unknown> {
  return {
    chart1: {
      date: p.chart1_date, time: p.chart1_time,
      timezoneOffset: p.chart1_tz, latitude: p.chart1_lat, longitude: p.chart1_lon,
    },
    chart2: {
      date: p.chart2_date, time: p.chart2_time,
      timezoneOffset: p.chart2_tz, latitude: p.chart2_lat, longitude: p.chart2_lon,
    },
    ...(p.language ? { language: p.language } : {}),
  };
}

const BODY_TRANSFORMERS: Record<SchemaKind, (p: Record<string, any>) => Record<string, unknown>> = {
  chart: chartBody,
  chartTarget: chartBody,
  twoChart: twoChartBody,
  horoscopeSign: (p) => p,
  horoscopeCompat: (p) => p,
  year: (p) => p,
  date: (p) => p,
  generic: (p) => (typeof p.body === 'object' && p.body !== null ? (p.body as Record<string, unknown>) : p),
  typed: (p) => p, // typed schemas pass through — fields match server expectation directly
};

// ─── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
  name: 'astroway',
  version: MCP_VERSION,
});

// ─── Built-in tools (handle-coded) ───────────────────────────

server.registerTool(
  'astroway_account_status',
  {
    title: 'Account Status',
    description: 'Check current API key status: tier, credit balance, rate limits, monthly cycle reset. Run this BEFORE invoking expensive endpoints (Tier 4+ at 100+ credits, Tier 6/7 at 500-5000 credits) to confirm the user has budget. Returns plain-text human-readable summary.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const text = await fetchAccountStatus(BASE_URL, API_KEY);
    return { content: [{ type: 'text' as const, text }] };
  },
);

server.registerTool(
  'astroway_cost_estimate',
  {
    title: 'Cost Estimate',
    description: 'Estimate the credit cost of one or more endpoints WITHOUT invoking them. Returns total + per-endpoint breakdown with tier annotations. Useful when planning multi-step workflows: estimate first, ask user confirmation, then invoke. Cache TTL 5 min.',
    inputSchema: {
      endpoints: z.array(z.string()).min(1).describe('Endpoint paths to estimate, e.g. ["/chart", "/synastry", "/reports/natal"]. Leading slash optional.'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ endpoints }) => {
    const manifest = await loadCostManifest(BASE_URL);
    const results = endpoints.map((e: string) => estimateOne(manifest, e));
    return { content: [{ type: 'text' as const, text: formatEstimate(results) }] };
  },
);

// ─── Generated tools ─────────────────────────────────────────

/**
 * For tools with hasOutput, return the OUTPUT_SCHEMAS entry as a ZodRawShape
 * (i.e. the .shape of a ZodObject). Returns undefined when the schema isn't
 * an object (rare — generator filters non-object data shapes earlier).
 */
function resolveOutputShape(toolName: string): Record<string, z.ZodTypeAny> | undefined {
  const schema = OUTPUT_SCHEMAS[toolName];
  if (!schema) return undefined;
  if (schema instanceof z.ZodObject) return schema.shape as Record<string, z.ZodTypeAny>;
  return undefined;
}

let registered = 2; // built-in count
let outputRegistered = 0;
for (const tool of GENERATED_TOOLS) {
  const schema = tool.schemaKind === 'typed' && tool.typedRef
    ? resolveTypedShape(tool.typedRef)
    : SCHEMAS[tool.schemaKind];
  const transform = BODY_TRANSFORMERS[tool.schemaKind];
  const outputShape = tool.hasOutput ? resolveOutputShape(tool.name) : undefined;
  if (outputShape) outputRegistered++;
  server.registerTool(
    tool.name,
    {
      title: tool.title ?? tool.name,
      description: tool.description,
      inputSchema: schema,
      ...(outputShape ? { outputSchema: outputShape } : {}),
      annotations: tool.annotations,
    },
    async (params) => {
      const body = transform(params as Record<string, any>);
      const result = await callApi(tool.endpoint, body);
      const response: {
        content: { type: 'text'; text: string }[];
        structuredContent?: { [x: string]: unknown };
      } = {
        content: [{ type: 'text' as const, text: result.text }],
      };
      // Only attach structuredContent when the tool advertises an outputSchema —
      // MCP clients validate structuredContent against outputSchema, so omitting
      // both keeps error responses (text-only) from failing validation.
      if (outputShape && result.structured && typeof result.structured === 'object' && !Array.isArray(result.structured)) {
        response.structuredContent = result.structured as { [x: string]: unknown };
      }
      return response;
    },
  );
  registered++;
}

// ─── Prompts + Resources ─────────────────────────────────────

const promptCount = registerAllPrompts(server);
const resourceCount = registerAllResources(server);

console.error(`[astroway-mcp/${MCP_VERSION}] registered ${registered} tools (${outputRegistered} with outputSchema) + ${promptCount} prompts + ${resourceCount} resources (base ${BASE_URL})`);

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  console.error('[astroway-mcp] failed to start:', err);
  process.exit(1);
});
