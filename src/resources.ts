import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { REFERENCE_RESOURCES } from './resources.generated.js';

/**
 * Register the 14 canonical reference resources at `astroway://reference/<slug>`.
 * Data is embedded at build time (see scripts/generate-resources.ts), so the
 * read callback never makes a network call. No API key required.
 *
 * Returns the count of resources registered for the boot-line summary.
 */
export function registerAllResources(server: McpServer): number {
  let n = 0;
  for (const [slug, info] of Object.entries(REFERENCE_RESOURCES)) {
    const uri = `astroway://reference/${slug}`;
    server.registerResource(
      slug,
      uri,
      {
        title: info.title,
        description: `${info.description} Source: ${info.apiPath}.`,
        mimeType: 'application/json',
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(info.data, null, 2),
          },
        ],
      }),
    );
    n++;
  }
  return n;
}
