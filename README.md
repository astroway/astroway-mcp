# @astroway/mcp

> MCP (Model Context Protocol) server exposing **every endpoint of the [AstroWay Calculation API](https://api.astroway.info)** as tools for Claude Desktop, Cursor, and any MCP-compatible AI agent.

[![npm version](https://img.shields.io/npm/v/@astroway/mcp.svg?style=flat&color=blue)](https://www.npmjs.com/package/@astroway/mcp)
[![npm downloads](https://img.shields.io/npm/dm/@astroway/mcp.svg?style=flat)](https://www.npmjs.com/package/@astroway/mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io)

Natal charts, synastry, transits, Vedic dashas (Vimshottari, Yogini, Ashtottari, Kalachakra), 16 Vargas, Tarot (Rider-Waite / Marseille / Lenormand), Numerology (5 systems), Human Design, AI horoscopes — all wrapped as MCP tools that the agent can call directly.

Tools are auto-generated from the live API manifest at build time, so each release ships every endpoint that exists in production. No manual tool-list maintenance.

---

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "astroway": {
      "command": "npx",
      "args": ["-y", "@astroway/mcp"],
      "env": {
        "ASTROWAY_API_KEY": "aw_live_..."
      }
    }
  }
}
```

Restart Claude Desktop. The `astroway` server will appear in the MCP indicator at the bottom of the chat input.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "astroway": {
      "command": "npx",
      "args": ["-y", "@astroway/mcp"],
      "env": { "ASTROWAY_API_KEY": "aw_live_..." }
    }
  }
}
```

### Cline / Continue / Windsurf / Copilot / VS Code MCP

The same `npx @astroway/mcp` command works in every MCP-compatible client. Drop this block into the client's MCP config file (the path varies by client):

```json
{
  "mcpServers": {
    "astroway": {
      "command": "npx",
      "args": ["-y", "@astroway/mcp"],
      "env": { "ASTROWAY_API_KEY": "aw_live_..." }
    }
  }
}
```

Config locations:

| Client | Config path |
|---|---|
| **Cline** (VS Code) | `.cline/mcp.json` in the workspace root |
| **Continue** | `~/.continue/config.json` (under `mcpServers`) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **GitHub Copilot Chat (VS Code)** | enable preview in settings, then `mcp.json` in workspace |
| **VS Code MCP extension** | `~/.vscode/mcp.json` |

### Other MCP clients

Run as a stdio server:

```bash
ASTROWAY_API_KEY=aw_live_... npx @astroway/mcp
```

### Privacy

This MCP server **does not phone home**. There is no telemetry, no analytics, no usage reporting — and no opt-in / opt-out toggle to maintain. The only network traffic the server originates is the AstroWay API calls you ask it to make, going directly from your machine to `https://api.astroway.info/v1`.

Outgoing requests carry two identifying headers so the AstroWay backend can distinguish MCP traffic from raw HTTP traffic in its own logs:

- `User-Agent: astroway-mcp/<version> (Node/<node-version>)`
- `X-Astroway-Channel: mcp`

Neither header carries a session ID, machine fingerprint, or anything personal. They mirror standard HTTP `User-Agent` semantics — every CLI tool sends similar information already.

### Subset registration (advanced)

If you only use part of the catalogue, you can register a subset and keep your LLM context window lean:

```jsonc
{
  "env": {
    "ASTROWAY_API_KEY": "aw_live_...",
    "ASTROWAY_TOOL_GROUPS": "western,vedic,relational",   // only these prefixes
    "ASTROWAY_READONLY": "1"                               // skip ai/horoscope/reports (LLM-backed, costs credits)
  }
}
```

Common groups: `western`, `vedic`, `tarot`, `numerology`, `hd` (Human Design), `relational` (synastry/composite/davison), `prognostics` (transits/progressions/returns), `aspects`, `horary`, `geo`, `chinese`, `bazi`, `mayan`, `iching`, `runes`, `geomancy`. Run `npx @astroway/mcp --list-tools` to inspect the full set; the boot-line `filters: …` field shows what was applied.

`ASTROWAY_READONLY=1` skips the three groups that internally call an LLM (`ai`, `horoscope`, `reports`) — useful when you want pure deterministic chart math without burning credits on text generation.

### Discovery (lean) mode

If your agent hits context or tool-count limits with the full catalogue, set `ASTROWAY_DISCOVERY_MODE=1`. Instead of registering 600+ tools up front, the server exposes just two meta-tools:

- **`astroway_find_tool(query, limit?)`** — keyword-search the whole catalogue; returns the best-matching tools with their one-line description and input parameter names.
- **`astroway_call_tool(name, arguments?)`** — invoke any tool the search surfaced.

The agent discovers the right tool on demand, then calls it — reaching the entire catalogue from a two-tool footprint.

Trade-off: a tool dispatched through `astroway_call_tool` returns its result as **text only**. A runtime-dispatched call cannot declare a per-call `outputSchema`, so it can't carry the validated `structuredContent` that directly-registered tools provide. Leave `ASTROWAY_DISCOVERY_MODE` unset (the default) when you want typed structured output; use it when tool-count pressure matters more. Discovery supersedes `ASTROWAY_TOOL_GROUPS` / `ASTROWAY_READONLY`.

### Stability

- **Catalogue is frozen for the duration of a session.** The 624 tools, 12 prompts, and 14 resources are baked into the published npm package — they don't change at runtime. (The MCP `listChanged` capability is advertised by the SDK, but no `*/list_changed` notification is ever emitted by this build. If your client caches the catalogue after the first `tools/list` it will stay correct for the whole connection.)
- **Tool identifiers are stable inside a major version.** A name shipped under `astroway_<group>_<tool>` won't be renamed or removed within the same `v0.x` minor without a deprecation note in `CHANGELOG.md`. Across major bumps (`v1` → `v2`) any breaking change is announced and the legacy escape (`MCP_FLAT_TOOLS=1`) carries you across one minor.
- **Tool input shape is stable inside a minor version.** Tightening (regex, range, enum) ships in patches; adding required fields requires a minor bump.
- **Refresh the catalogue by reinstalling.** `npm i -g @astroway/mcp@latest` (or the `npx -y @astroway/mcp` form already in your client config) pulls the current set on the next start.

### Verify the install

After restarting your MCP client:

1. Open the MCP indicator (bottom of the chat input in Claude Desktop, status bar in Cursor).
2. You should see `astroway` listed as an active server.
3. Hover or click — the badge shows `624 tools registered + 12 prompts + 14 resources` (counts as of the latest release).
4. Cold-start takes 2-3 seconds the first time (Node + TLS handshake to api.astroway.info).
5. Sanity check from any terminal: `npx @astroway/mcp --version` prints the package version, `npx @astroway/mcp --list-tools synastry` prints matching tools.

If the server doesn't appear, set `LOG_LEVEL=debug` in the `env` block above and restart — the boot line and any startup errors land in the client's MCP debug panel.

---

## Get an API key

Sign up at <https://api.astroway.info/dashboard/sign-up> — **10 000 credits/month free**, no card required. Each request costs 5–500 credits depending on the endpoint (see [pricing](https://api.astroway.info/pricing/)).

For local testing without a paid plan, use a sandbox key (`aw_test_...`) which returns deterministic responses for free.

---

## What you get

Tool categories — examples below. Run `npx @astroway/mcp` once and ask the agent *"list astroway tools"* for the full live inventory (the package auto-syncs with the API on every release).

| Category | Examples |
|---|---|
| **Core** | natal chart, planet positions, draconic, harmonics |
| **Comparisons** | synastry, composite, davison, cross-system compatibility |
| **Prognostics** | transits, secondary progressions, solar/lunar return, transit calendar |
| **Specialized Charts** | heliocentric, sidereal, eclipse search |
| **Aspects & Points** | aspects table, antiscia, midpoints, Arabic parts, fixed stars |
| **Calendar & Cycles** | retrograde periods, ingresses, lunar phases, planetary hours |
| **Dignities & Receptions** | essential dignities, almuten, hyleg, dispositors |
| **Horary** | horary chart, moon void-of-course, via combusta |
| **Human Design** | full chart, transits, penta, dream rave, hologenetic profile |
| **Astro-Geography** | astrocartography, local space, relocation chart |
| **Vedic** | 16 Vargas, Panchang, Shadbala, 4 Dasha systems × 5 levels (Vimshottari / Yogini / Ashtottari / Kalachakra), Yogas, Doshas, Compatibility, Muhurat |
| **Tarot** | Rider-Waite-Smith, Marseille, Lenormand decks; spreads + card lookups |
| **Numerology** | Pythagorean, Chaldean, Kabbalistic, Vedic, Destiny Matrix |
| **Esoteric** | I Ching, sabian symbols, fortune dice, color & gemstone correspondences |
| **Reference** | signs, planets, houses, aspects, nakshatras, Hellenistic Lots |
| **AI Interpretations** | natal, synastry, transits — Ukrainian/English |
| **Horoscope** | daily, weekly, monthly, compatibility (zodiac sign-based) |

---

## Example prompts

After connecting the server, try these in Claude Desktop:

**Natal chart**
> Calculate a natal chart for me — born 1990-03-15 at 14:30 in Kyiv, Ukraine (50.45N 30.52E, UTC+2). Identify my sun, moon, ascendant, and any tight aspects.

**Synastry**
> Compare two charts: person A born 1988-06-10 09:15 in London (51.51N -0.13E UTC+1), person B born 1991-11-22 22:40 in Berlin (52.52N 13.40E UTC+1). What are the strongest cross-aspects?

**Vedic Vimshottari Dasha**
> Run a Vimshottari Mahadasha for someone born 1985-07-22 06:45 in Mumbai (19.07N 72.87E UTC+5.5). Which planet's period are they in right now (May 2026)?

**Transit forecast**
> What major outer-planet transits hit my natal chart on 2027-01-01? Birth: 1990-03-15 14:30 Kyiv (50.45 30.52 UTC+2).

**Tarot reading**
> Pull a 3-card Past-Present-Future spread from the Rider-Waite deck for the question "should I take the new job?". Use seed 42 for reproducibility.

**Human Design**
> What's the Human Design type, strategy and authority for someone born 1990-03-15 14:30 Kyiv (50.45 30.52 UTC+2)? List their defined centers and incarnation cross.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `ASTROWAY_API_KEY` | *(required)* | Your API key. Live: `aw_live_...`. Sandbox: `aw_test_...`. |
| `ASTROWAY_BASE_URL` | `https://api.astroway.info/v1` | Override for self-hosted / staging instances. |

---

## How tools are generated

A build-time script reads the canonical endpoint manifest from the production API, classifies each endpoint by input shape (`chart`, `twoChart`, `chartTarget`, `horoscopeSign`, `year`, `date`, `generic`), and emits a typed tool definition. The MCP server then registers every entry against an MCP `Tool` with the appropriate Zod input schema.

When the API ships new endpoints, the next MCP release ships them automatically — no manual tool definitions to keep in sync.

---

## Troubleshooting

**Claude Desktop doesn't show the server.** Check the bottom of the chat input for the MCP indicator (slider icon). Click it to see registered servers and any startup errors. If `astroway` is missing, run the `npx @astroway/mcp` command manually in a terminal — startup errors print to stderr.

**Tools return `Error 401`.** API key is missing, invalid, or revoked. Generate a new one at <https://api.astroway.info/dashboard/keys>.

**Tools return `Error 402`.** Out of credits on the free tier. Upgrade at <https://api.astroway.info/pricing/> or wait for the monthly reset.

**Tools return `Error 422` with field validation errors.** The LLM passed a body the API didn't accept. Ask Claude to retry with the example body shown in the tool description, or use the sandbox key (`aw_test_...`) to debug without spending credits.

---

## Repository layout

This repo is the **public showcase** for `@astroway/mcp`: README, CHANGELOG, LICENSE, install instructions. The runnable code is the published npm package itself — install it with `npm install @astroway/mcp` or run via `npx @astroway/mcp`.

Source is maintained in the private AstroWay monorepo so the build-time generator can read the canonical endpoint manifest from the API workspace next door. The generated package is open source under MIT and ships every release to npm.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## Links

- 📦 npm: <https://www.npmjs.com/package/@astroway/mcp>
- 📘 API docs: <https://api.astroway.info/docs/api/>
- 🔑 Sign up & dashboard: <https://api.astroway.info/dashboard/>
- 💰 Pricing: <https://api.astroway.info/pricing/>
- 🌐 Website: <https://astroway.info>

---

## License

MIT — see [LICENSE](LICENSE).
