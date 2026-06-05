import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, levelFromEnv } from '../src/logger.js';

describe('levelFromEnv', () => {
  it('parses valid levels case-insensitively', () => {
    expect(levelFromEnv('silent')).toBe('silent');
    expect(levelFromEnv('ERROR')).toBe('error');
    expect(levelFromEnv(' Warn ')).toBe('warn');
    expect(levelFromEnv('info')).toBe('info');
    expect(levelFromEnv('debug')).toBe('debug');
  });

  it('falls back to error for invalid / missing values', () => {
    expect(levelFromEnv(undefined)).toBe('error');
    expect(levelFromEnv('')).toBe('error');
    expect(levelFromEnv('verbose')).toBe('error');
    expect(levelFromEnv('TRACE')).toBe('error');
  });
});

describe('Logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('respects level: error level drops warn/info/debug', () => {
    const log = new Logger('error');
    log.error('boom');
    log.warn('skip');
    log.info('skip');
    log.debug('skip');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toContain('error');
    expect(stderrSpy.mock.calls[0][0]).toContain('boom');
  });

  it('debug level emits everything', () => {
    const log = new Logger('debug');
    log.error('a');
    log.warn('b');
    log.info('c');
    log.debug('d');
    expect(stderrSpy).toHaveBeenCalledTimes(4);
  });

  it('silent level emits nothing', () => {
    const log = new Logger('silent');
    log.error('drop');
    log.warn('drop');
    log.info('drop');
    log.debug('drop');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('setLevel mutates threshold', () => {
    const log = new Logger('error');
    log.warn('skip');
    expect(stderrSpy).not.toHaveBeenCalled();
    log.setLevel('debug');
    log.warn('keep');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('serializes data payload as JSON appended to message', () => {
    const log = new Logger('info');
    log.info('hello', { x: 1, y: 'z' });
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain('hello');
    expect(written).toContain('"x":1');
    expect(written).toContain('"y":"z"');
  });

  it('includes ISO timestamp in stderr line', () => {
    const log = new Logger('info');
    log.info('tick');
    const written = stderrSpy.mock.calls[0][0] as string;
    // ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  it('forwards to attached MCP sink at MCP-spec levels', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = new Logger('debug');
    log.attachMcp({ sendLoggingMessage: send });
    log.error('boom');
    log.warn('careful');
    log.info('hello');
    log.debug('detail');
    // give .catch() handlers a tick to settle
    await new Promise((r) => setImmediate(r));
    expect(send).toHaveBeenCalledTimes(4);
    const levels = send.mock.calls.map((c) => (c[0] as { level: string }).level);
    // logger maps warn → MCP 'warning', everything else passes through
    expect(levels).toEqual(['error', 'warning', 'info', 'debug']);
  });
});
