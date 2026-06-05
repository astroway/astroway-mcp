import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';

const argv = (...args: string[]) => ['node', 'dist/index.js', ...args];

describe('parseArgs', () => {
  it('no args → serve mode', () => {
    expect(parseArgs(argv()).mode).toBe('serve');
  });

  it('--version / -v', () => {
    expect(parseArgs(argv('--version')).mode).toBe('version');
    expect(parseArgs(argv('-v')).mode).toBe('version');
  });

  it('--help / -h', () => {
    expect(parseArgs(argv('--help')).mode).toBe('help');
    expect(parseArgs(argv('-h')).mode).toBe('help');
  });

  it('--list-tools without filter', () => {
    const r = parseArgs(argv('--list-tools'));
    expect(r.mode).toBe('list-tools');
    expect(r.filter).toBeUndefined();
  });

  it('--list-tools with filter', () => {
    const r = parseArgs(argv('--list-tools', 'synastry'));
    expect(r.mode).toBe('list-tools');
    expect(r.filter).toBe('synastry');
  });

  it('--list-tools followed by --flag swallows the flag as no-filter', () => {
    const r = parseArgs(argv('--list-tools', '--unknown'));
    expect(r.mode).toBe('list-tools');
    expect(r.filter).toBeUndefined();
  });

  it('--list-resources / --list-prompts', () => {
    expect(parseArgs(argv('--list-resources')).mode).toBe('list-resources');
    expect(parseArgs(argv('--list-prompts')).mode).toBe('list-prompts');
  });

  it('--call <name> --json <body>', () => {
    const r = parseArgs(argv('--call', 'chart', '--json', '{"date":"1990-01-01"}'));
    expect(r.mode).toBe('call');
    expect(r.toolName).toBe('chart');
    expect(r.json).toBe('{"date":"1990-01-01"}');
  });

  it('--call without name produces help with explanation', () => {
    const r = parseArgs(argv('--call'));
    expect(r.mode).toBe('help');
    expect(r.unknown).toContain('--call requires');
  });

  it('--call without --json defaults to empty body', () => {
    const r = parseArgs(argv('--call', 'chart'));
    expect(r.mode).toBe('call');
    expect(r.json).toBe('{}');
  });

  it('unknown args land in help mode with the unknown tag', () => {
    const r = parseArgs(argv('--bogus', 'whatever'));
    expect(r.mode).toBe('help');
    expect(r.unknown).toContain('--bogus');
  });

  it('--version takes precedence over other flags', () => {
    const r = parseArgs(argv('--list-tools', '--version'));
    expect(r.mode).toBe('version');
  });
});
