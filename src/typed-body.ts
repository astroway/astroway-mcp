import { z } from 'zod';

import { TYPED_SCHEMAS, type GeneratedTool } from './tools.generated.js';

/**
 * A 'typed' tool whose component schema is NOT a ZodObject (intersection /
 * union / array / record) is exposed by resolveTypedShape() as a single `body`
 * field. Such tools must run the generic unwrap transform: a bare `(p) => p`
 * would forward `{ body: {...} }` to the API, which expects the flat object and
 * rejects the wrapper with INVALID_INPUT. Detected by schema type so flat
 * ZodObject typed tools (which pass through directly) stay untouched.
 *
 * Shared by the npm package (src/index.ts) and the hosted server
 * (mcp.astroway.info/src/catalogue.ts via the @astroway-mcp alias) so both
 * surfaces agree on which tools need unwrapping.
 */
export function isTypedBodyWrapped(tool: Pick<GeneratedTool, 'schemaKind' | 'typedRef'>): boolean {
  if (tool.schemaKind !== 'typed' || !tool.typedRef) return false;
  const s = TYPED_SCHEMAS[tool.typedRef];
  return !s || !(s instanceof z.ZodObject);
}
