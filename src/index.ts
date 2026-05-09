#!/usr/bin/env node
/**
 * @astroway/mcp — MCP server exposing the AstroWay API as tools for LLM agents.
 *
 * Tool list is generated at build time from the live OpenAPI spec
 * (https://api.astroway.info/v1/openapi.json) — see scripts/generate-tools.ts.
 * Every endpoint that ships in the API is available here without manual editing.
 *
 * Usage:
 *   ASTROWAY_API_KEY=your-key npx @astroway/mcp
 *
 * Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
 *   {
 *     "mcpServers": {
 *       "astroway": {
 *         "command": "npx",
 *         "args": ["-y", "@astroway/mcp"],
 *         "env": { "ASTROWAY_API_KEY": "aw_live_..." }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { GENERATED_TOOLS, type SchemaKind } from './tools.generated.js';

const API_KEY = process.env.ASTROWAY_API_KEY ?? '';
const BASE_URL = process.env.ASTROWAY_BASE_URL ?? 'https://api.astroway.info/v1';
const MCP_VERSION = '0.2.0';

if (!API_KEY) {
  console.error('Error: ASTROWAY_API_KEY environment variable is required.');
  console.error('Get a key at https://api.astroway.info/dashboard/sign-up — 10 000 credits/month free.');
  process.exit(1);
}

// ─── HTTP caller ─────────────────────────────────────────────

async function callApi(endpoint: string, body: Record<string, unknown>): Promise<string> {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      'User-Agent': `astroway-mcp/${MCP_VERSION}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };

  if (!res.ok || !json.ok) {
    const err = json.error ?? {};
    return `Error ${res.status} (${err.code ?? 'UNKNOWN'}): ${err.message ?? 'Unknown error'}`;
  }
  return JSON.stringify(json.data, null, 2);
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
};

// ─── Body transformers (flatten MCP params → API body) ───────

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
  // Generic: API accepts arbitrary object — pass through whatever the LLM sends
  generic: (p) => (typeof p.body === 'object' && p.body !== null ? (p.body as Record<string, unknown>) : p),
};

// ─── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
  name: 'astroway',
  version: MCP_VERSION,
});

let registered = 0;
for (const tool of GENERATED_TOOLS) {
  const schema = SCHEMAS[tool.schemaKind];
  const transform = BODY_TRANSFORMERS[tool.schemaKind];
  server.registerTool(
    tool.name,
    {
      title: tool.name,
      description: tool.description,
      inputSchema: schema,
    },
    async (params) => {
      const body = transform(params as Record<string, any>);
      const text = await callApi(tool.endpoint, body);
      return { content: [{ type: 'text' as const, text }] };
    },
  );
  registered++;
}

console.error(`[astroway-mcp] registered ${registered} tools (base ${BASE_URL})`);

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  console.error('[astroway-mcp] failed to start:', err);
  process.exit(1);
});
