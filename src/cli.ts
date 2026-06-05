import { GENERATED_TOOLS } from './tools.generated.js';
import { MCP_VERSION } from './version.js';

export type CliMode = 'serve' | 'version' | 'help' | 'list-tools' | 'list-resources' | 'list-prompts' | 'call';

export interface CliArgs {
  mode: CliMode;
  /** Filter substring for `--list-tools`. */
  filter?: string;
  /** Tool name for `--call`. */
  toolName?: string;
  /** Raw JSON body for `--call`. Falls back to `{}` if omitted. */
  json?: string;
  /** Unknown arg encountered, used for help output. */
  unknown?: string;
}

const HELP = `@astroway/mcp — MCP server for the AstroWay Calculation API

USAGE
  astroway-mcp                       Start MCP stdio server (normal mode for Claude Desktop / Cursor)
  astroway-mcp --version             Print version and exit
  astroway-mcp --help                Print this message and exit
  astroway-mcp --list-tools [text]   List registered tool names (optionally filtered by substring), exit
  astroway-mcp --list-resources      List registered MCP resources (astroway://reference/<slug>), exit
  astroway-mcp --list-prompts        List registered MCP prompts, exit
  astroway-mcp --call <name> --json '<body>'
                                     Invoke a tool once with the given JSON body, print result, exit

ENVIRONMENT
  ASTROWAY_API_KEY     Required for normal mode (and --call). Get one at https://api.astroway.info/dashboard/sign-up
  ASTROWAY_BASE_URL    Override the API base URL (default: https://api.astroway.info/v1)
  LOG_LEVEL            silent | error (default) | warn | info | debug
  LOG_FILE             Path to append JSON-line log entries (in addition to stderr)
  ASTROWAY_VERBOSE     Legacy alias for LOG_LEVEL=debug (still respected for back-compat)

EXAMPLES
  ASTROWAY_API_KEY=aw_live_... astroway-mcp
  astroway-mcp --list-tools synastry
  ASTROWAY_API_KEY=aw_test_... astroway-mcp --call chart --json '{"date":"1990-01-01","time":"12:00:00","timezoneOffset":0,"latitude":50.45,"longitude":30.52}'
  LOG_LEVEL=debug LOG_FILE=/tmp/astroway-mcp.log astroway-mcp
`;

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  if (args.length === 0) return { mode: 'serve' };

  // Fast paths
  if (args.includes('--version') || args.includes('-v')) return { mode: 'version' };
  if (args.includes('--help') || args.includes('-h')) return { mode: 'help' };
  if (args.includes('--list-resources')) return { mode: 'list-resources' };
  if (args.includes('--list-prompts')) return { mode: 'list-prompts' };

  // --list-tools [optional filter]
  const ltIdx = args.indexOf('--list-tools');
  if (ltIdx !== -1) {
    const filter = args[ltIdx + 1];
    return { mode: 'list-tools', filter: filter && !filter.startsWith('--') ? filter : undefined };
  }

  // --call <name> --json '<body>'
  const callIdx = args.indexOf('--call');
  if (callIdx !== -1) {
    const toolName = args[callIdx + 1];
    if (!toolName || toolName.startsWith('--')) {
      return { mode: 'help', unknown: '--call requires a tool name' };
    }
    const jsonIdx = args.indexOf('--json');
    const json = jsonIdx !== -1 ? args[jsonIdx + 1] : '{}';
    return { mode: 'call', toolName, json };
  }

  return { mode: 'help', unknown: args.join(' ') };
}

export function printVersion(): void {
  process.stdout.write(`${MCP_VERSION}\n`);
}

export function printHelp(unknown?: string): void {
  if (unknown) process.stderr.write(`Unrecognized argument: ${unknown}\n\n`);
  process.stdout.write(HELP);
}

export function listTools(filter: string | undefined): void {
  const f = filter?.toLowerCase();
  const matches = GENERATED_TOOLS.filter((t) => !f || t.name.toLowerCase().includes(f) || t.title?.toLowerCase().includes(f));
  process.stdout.write(`Registered tools: ${matches.length}${f ? ` (filter: ${filter})` : ''}\n\n`);
  for (const t of matches) {
    const head = t.title && t.title !== t.name ? `${t.name} — ${t.title}` : t.name;
    process.stdout.write(`${head}\n`);
    if (t.cost !== undefined) process.stdout.write(`  cost: ${t.cost} credits${t.tier ? ` (${t.tier})` : ''}\n`);
    process.stdout.write(`  endpoint: ${t.endpoint}\n`);
  }
  // Built-ins
  if (!f || 'astroway_account_status'.includes(f)) {
    process.stdout.write(`astroway_account_status — Account Status (built-in)\n`);
  }
  if (!f || 'astroway_cost_estimate'.includes(f)) {
    process.stdout.write(`astroway_cost_estimate — Cost Estimate (built-in)\n`);
  }
}

/**
 * For `--call <name>`, look up the tool in the generated map and invoke its
 * underlying endpoint with the given body. The caller wires this against
 * src/index.ts's `callApi` helper to share retry / error semantics.
 */
export function findToolEndpoint(toolName: string): string | null {
  const t = GENERATED_TOOLS.find((x) => x.name === toolName);
  return t ? t.endpoint : null;
}
