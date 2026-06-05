import { appendFileSync, openSync } from 'node:fs';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/** MCP spec logging levels (RFC-5424 subset). */
type McpLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

const TO_MCP: Record<Exclude<LogLevel, 'silent'>, McpLevel> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  debug: 'debug',
};

/** Minimal interface so we don't import the entire McpServer in tests. */
interface McpLoggingSink {
  sendLoggingMessage(params: { level: McpLevel; data: unknown; logger?: string }): Promise<void>;
}

export class Logger {
  private level: LogLevel;
  private fileFd?: number;
  private mcpSink?: McpLoggingSink;

  constructor(level: LogLevel = 'error', logFilePath?: string) {
    this.level = level;
    if (logFilePath) {
      try {
        // 'a' = append, create if missing
        this.fileFd = openSync(logFilePath, 'a');
      } catch (e) {
        process.stderr.write(`[logger] cannot open LOG_FILE=${logFilePath}: ${(e as Error).message}\n`);
      }
    }
  }

  /** Attach an MCP server so log entries are also sent as notifications/message to clients. */
  attachMcp(sink: McpLoggingSink): void {
    this.mcpSink = sink;
  }

  /** Set the active log level. Lower-priority entries are dropped. */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private write(entryLevel: Exclude<LogLevel, 'silent'>, message: string, data?: unknown): void {
    if (LEVEL_RANK[entryLevel] > LEVEL_RANK[this.level]) return;
    const ts = new Date().toISOString();
    const entry = data === undefined
      ? { ts, level: entryLevel, msg: message }
      : { ts, level: entryLevel, msg: message, data };
    // Always emit to stderr — humans read the terminal.
    process.stderr.write(`[${ts}] ${entryLevel.padEnd(5)} ${message}${data === undefined ? '' : ' ' + safeStringify(data)}\n`);
    // Optional file sink — JSON line per entry, machine-readable.
    if (this.fileFd !== undefined) {
      try {
        appendFileSync(this.fileFd, JSON.stringify(entry) + '\n');
      } catch {
        // Best-effort: a broken log file shouldn't crash the server.
      }
    }
    // MCP sink — push to subscribed clients (e.g. Claude Desktop debug panel).
    // Use .catch() to avoid unhandled-rejection if the transport closed mid-call.
    if (this.mcpSink) {
      this.mcpSink
        .sendLoggingMessage({ level: TO_MCP[entryLevel], data: data === undefined ? message : { message, data }, logger: 'astroway-mcp' })
        .catch(() => { /* drop */ });
    }
  }

  error(message: string, data?: unknown): void { this.write('error', message, data); }
  warn(message: string, data?: unknown): void  { this.write('warn',  message, data); }
  info(message: string, data?: unknown): void  { this.write('info',  message, data); }
  debug(message: string, data?: unknown): void { this.write('debug', message, data); }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Read LogLevel from the LOG_LEVEL env. Falls back to 'error'. */
export function levelFromEnv(envValue: string | undefined): LogLevel {
  const v = (envValue ?? '').trim().toLowerCase();
  if (v === 'silent' || v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
  return 'error';
}
