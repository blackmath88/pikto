# pikto

Icons that fit the repo they live in, not generic Lucide everywhere.

pikto is a small CLI plus an agent skill. It reads a repository's visual language, finds existing open-source icons, and adapts them to that repository's grid, stroke and construction. It validates the result and records where every icon came from and why it was chosen.

> The LLM is the semantic design decision layer. It is not the SVG renderer.
> Preference order: **search → adapt → compose → generate**.
> Deterministic about evidence, provenance and execution; non-deterministic about interpretation.

## Commands
```
pikto profile  <repo>                      derive the visual profile (grid, stroke, family, construction)
pikto search   <query> --profile P          rank Iconify candidates against the profile
pikto adapt    <prefix:name> --profile P    rescale, restroke and optimise; report angle grammar and coverage
pikto differ   <id…> --profile P            visual weight vs siblings, confusability, distance from the generic default
pikto validate <file.svg> --profile P
pikto add      <prefix:name> <name> --profile P --reading "…" --permission "…"
pikto audit    <repo> [--check]            DESIGN.md intent vs icon-like glyphs in code; --check fails on drift
pikto sheet    <repo> --profile P --proposal F   contact sheet: today's glyph → proposed icon, per role family
pikto apply    <repo> --profile P --decision F   icons module, call sites, provenance, DESIGN.md ## Iconography
```
Setup: `npm i`, then `node bin/pikto.mjs …`. Tests: `npm test` (offline).

Icon data comes from local `@iconify-json/<prefix>` packages when installed (versioned by the lockfile, so deterministic), otherwise from the [Iconify API](https://api.iconify.design) through a disk cache (`$PIKTO_CACHE`, default `~/.cache/pikto`). `--offline` never touches the network.

## Docs
- [docs/RESEARCH.md](docs/RESEARCH.md): prior art and the reuse decision
- [docs/CONCEPT.md](docs/CONCEPT.md): architecture
- [docs/ENTSLOPIFY.md](docs/ENTSLOPIFY.md): différance, the pictogram lineage, Lumpesammlig, and the Syntax view
- [docs/WORKFLOW.md](docs/WORKFLOW.md): architecture and UX for polishing a finished repo (opendata-explorer)
- [docs/AUDIT.md](docs/AUDIT.md), [docs/SHEET.md](docs/SHEET.md), [docs/APPLY.md](docs/APPLY.md): intent vs code, the contact sheet where the human decides, and the reviewable diff
- [docs/EXAMPLE.md](docs/EXAMPLE.md), [docs/EVALUATION.md](docs/EVALUATION.md): the first vertical slice (Astro portfolio, 404 compass)
- [ROADMAP.md](ROADMAP.md)

## License
MIT for the code. Every icon keeps its upstream license, recorded in `.pikto/provenance.json`.
