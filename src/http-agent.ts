/**
 * Configure undici (Node's built-in fetch dispatcher) for keep-alive against
 * api.astroway.info. Without this, every fetch from `fetchWithRetry` opens a
 * fresh TCP/TLS connection — typical 30-50 ms penalty per call. With
 * keep-alive, the same socket is reused for the duration of an MCP session,
 * dropping per-call overhead to single-digit ms.
 *
 * keepAliveTimeout = 30s matches the typical idle window before a Cloudflare
 * / nginx upstream closes the connection on its side. We trigger a half-open
 * detection at 60s by setting keepAliveMaxTimeout slightly above.
 */

import { Agent, setGlobalDispatcher } from 'undici';

let installed = false;

export function installKeepAliveAgent(): void {
  if (installed) return;
  installed = true;
  setGlobalDispatcher(new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    // Reasonable cap for a single-process MCP server; api.astroway.info handles
    // many concurrent connections from one source IP.
    connections: 64,
  }));
}
