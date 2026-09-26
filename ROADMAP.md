# Roadmap

## Done (v0.3)
- Offline icon source: local `@iconify-json/*` packages first, then a disk cache, then the API (`--offline` for CI)
- `profile` falls back to DESIGN.md intent when a repo has no icons yet (was: grid 0)
- `sheet`; `npm test` (offline, fixture repo)

## Done (v0.1)
- `profile`, `search`, `adapt`, `validate`, `add`, `differ`
- Astro example; Syntax-style `Icon.svelte` detection; Aicher angle signal

## Next: the opendata-explorer slice (see docs/WORKFLOW.md)
1. [x] `audit` (v0.2, see docs/AUDIT.md): read DESIGN.md as the intent and the code as the evidence. Inventory Unicode glyphs, inline SVG and library imports; group them by role; report inconsistent mappings.
2. [x] `sheet` (v0.3, see docs/SHEET.md): contact sheet (HTML) of before → after in the repo's own tokens, with optical stroke, weight and in-family confusability.
3. `apply`: write `src/ui/icons.ts` (plain SVG string functions), replace call sites, write provenance, propose `## Iconography` for DESIGN.md.
4. Re-run `audit` as a drift check (pre-commit or CI).

## Later
- AIGA/DOT public-domain source adapter
- Write targets for unplugin-icons and Svelte switch components
- MCP only as a thin wrapper over the CLI
