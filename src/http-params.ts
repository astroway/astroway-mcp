/**
 * Turning a tool's arguments into a URL: path substitution and query strings.
 *
 * Both halves used to live privately inside `index.ts`, which is the stdio
 * entrypoint and not something another build can import. The hosted server at
 * mcp.astroway.info bundles this package from source and had neither, so it
 * POSTed every tool: 31 of its GET-only lookups answered
 * "404 No route for POST /tarot/rider-waite/cards" for as long as they have
 * existed, while the same tools worked over stdio. One spelling, imported
 * twice, is the only thing that keeps the two transports honest.
 */

/**
 * Substitute `{brace}` names into the path and take them out of the arguments,
 * so they do not also travel in the body or the query.
 *
 * `missing` names anything the caller left out; the caller decides whether that
 * is an error, because a schema may have made the parameter optional.
 */
export function applyPathParams(
  endpoint: string,
  names: readonly string[] | undefined,
  args: Record<string, unknown>,
): { endpoint: string; rest: Record<string, unknown>; missing: string[] } {
  if (!names || names.length === 0) return { endpoint, rest: args, missing: [] };
  const rest: Record<string, unknown> = { ...args };
  const missing: string[] = [];
  let out = endpoint;
  for (const n of names) {
    const v = rest[n];
    if (v === undefined || v === null || v === '') {
      missing.push(n);
      continue;
    }
    delete rest[n];
    out = out.replace(`{${n}}`, encodeURIComponent(String(v)));
  }
  return { endpoint: out, rest, missing };
}

/** Query string for a GET tool, dropping anything the caller left empty. */
export function toQueryString(args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(args ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item !== undefined && item !== null && item !== '') params.append(k, String(item));
    } else {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
