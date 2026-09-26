# Roadmap

## Done (v0.6)
- Own hand-drawn sets: host `<svg>` wrapper in profile/adapt/measurement; `apply` registry mode calling the repo's `icon()` (docs/OWN-SET.md)

## Done (v0.5)
- `audit` separates icons from typography (br-ai-nstorm: 23 → 5); inventories icon-library imports
- `profile` adopts an imported library's grammar; `apply` writes library components into JSX (see docs/LIBRARY.md)

## Done (v0.4)
- `apply` and `audit --check`; first run produced a patch for opendata-explorer

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
3. [x] `apply` (v0.4, see docs/APPLY.md): write `src/ui/icons.ts` (plain SVG string functions), replace call sites by lexical context, write provenance, append `## Iconography` to DESIGN.md.
4. [x] `audit --check`: drift check against `.pikto/audit.json` (pre-commit or CI).
5. Land the patches upstream: opendata-explorer → [blackmath88/opendata-explorer#11](https://github.com/blackmath88/opendata-explorer/pull/11); br-ai-nstorm → docs/br-ai-nstorm-icons.patch.

## Later
- Write targets for `.vue`/`.svelte`/`.astro` templates and JSX text in `apply`
- `sheet` should read the render context from real CSS instead of trusting the proposal
- AIGA/DOT public-domain source adapter
- Write targets for unplugin-icons (`~icons/…`), deep per-icon imports and Svelte switch components
- `sheet`: show a library's existing icons as siblings automatically
- MCP only as a thin wrapper over the CLI
