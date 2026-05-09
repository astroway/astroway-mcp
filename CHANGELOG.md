# Changelog

## 0.2.0 — 2026-05-07

### What changed

- **Tool generation reads the live OpenAPI spec.** The build-time generator fetches `https://api.astroway.info/v1/openapi.json` so each release ships exactly the endpoint set that's live in production. Override via `ASTROWAY_OPENAPI_URL` for staging.
- **SLSA provenance enabled** (`npm publish --provenance`). Every release ships a Sigstore-attested record proving the package was built from this exact commit. Visible on the npmjs page and via `npm view @astroway/mcp`.
- **OIDC trusted publishing.** No long-lived npm tokens — the publish workflow authenticates via GitHub OIDC.

### Migration notes

- No code changes required for users of `0.1.0` — same package name, same install command (`npx @astroway/mcp`), same tool surface.
- If you pinned a specific version, bumping to `0.2.0` adds the integrity signal but does not change runtime behavior.

## 0.1.0 — 2026-05-07

Initial public release.

### What's in the box

- **285 tools** auto-generated from the AstroWay API manifest at build time:
  - Core (8): natal chart, planet positions, draconic, harmonics, ...
  - Comparisons (10): synastry, composite, davison, cross-system compatibility
  - Prognostics (18): transits, secondary progressions, solar/lunar return, transit calendar
  - Specialized Charts (11): heliocentric, sidereal, eclipse search
  - Aspects & Points (18): aspects table, antiscia, midpoints, Arabic parts, fixed stars
  - Calendar & Cycles (22): retrograde periods, ingresses, lunar phases, planetary hours
  - Dignities & Receptions (7): essential dignities, almuten, hyleg, dispositors
  - Horary (9): horary chart, moon void-of-course, via combusta
  - Human Design (13): full chart, transits, penta, dream rave, hologenetic profile
  - Astro-Geography (8): astrocartography, local space, relocation chart
  - Vedic (110): 16 Vargas, Panchang, Shadbala, Vimshottari/Yogini/Ashtottari/Kalachakra Dashas, Yogas, Doshas, Compatibility, Muhurat
  - Tarot (60+): Rider-Waite-Smith, Marseille, Lenormand decks
  - Numerology (50): Pythagorean, Chaldean, Kabbalistic, Vedic, Destiny Matrix
  - Esoteric (15): I Ching, sabian symbols, fortune dice, color & gemstone correspondences
  - Reference (14): signs, planets, houses, aspects, nakshatras, Hellenistic Lots
  - AI Interpretations (6): natal, synastry, transits — Ukrainian/English
  - Horoscope (4): daily, weekly, monthly, compatibility
- **Build-time tool generation** — every endpoint that ships in the API is exposed as a tool, with input shape inferred from path patterns (`chart`, `twoChart`, `chartTarget`, `horoscopeSign`, `year`, `date`, `generic`).
- **stdio transport** for Claude Desktop, Cursor, and any MCP-compatible client.
- **Configuration** via `ASTROWAY_API_KEY` (required) and `ASTROWAY_BASE_URL` (default `https://api.astroway.info/v1`).

### Compatibility

- Node.js: ≥20
- MCP SDK: `^1.12`
- Tested with: Claude Desktop 1.0+, Cursor 0.50+
