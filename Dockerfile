# Glama.ai automated safety / quality scanner container.
#
# This image is consumed by Glama to sandbox the server during their static
# + dynamic analysis pass. It is NOT how end users run @astroway/mcp — those
# should `npx -y @astroway/mcp` or add the standard Claude Desktop / Cursor /
# Windsurf MCP server entry. Glama documents this in the listing FAQ.
#
# Design notes:
#   - alpine base for the smallest scanning surface
#   - global install of the published npm package — Glama scans what users
#     actually run, not whatever sits in this repo's working tree
#   - stdio transport (no EXPOSE) — the server reads MCP frames from stdin
#     and writes to stdout, matching how MCP clients launch it
#   - ASTROWAY_API_KEY is intentionally not set; safety checks shouldn't
#     touch production keys. Glama injects a sandbox value for dynamic
#     analysis when needed.

FROM node:22-alpine

WORKDIR /app

# Pin to the latest npm-published version. Glama re-runs the safety scan
# whenever this Dockerfile changes, so bumping `@latest` to a specific
# `@x.y.z` after a publish is the recommended cadence.
RUN npm install -g @astroway/mcp@latest

ENV NODE_ENV=production

# `astroway-mcp` is the bin entry from the @astroway/mcp package.json.
ENTRYPOINT ["astroway-mcp"]
