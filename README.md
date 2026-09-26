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
```
Setup: `npm i`, then `node bin/pikto.mjs …`. Icon data comes from the [Iconify API](https://api.iconify.design).

## Docs
- [docs/RESEARCH.md](docs/RESEARCH.md): prior art and the reuse decision
- [docs/CONCEPT.md](docs/CONCEPT.md): architecture
- [docs/ENTSLOPIFY.md](docs/ENTSLOPIFY.md): différance, the pictogram lineage, Lumpesammlig, and the Syntax view
- [docs/WORKFLOW.md](docs/WORKFLOW.md): architecture and UX for polishing a finished repo (opendata-explorer)
- [docs/EXAMPLE.md](docs/EXAMPLE.md), [docs/EVALUATION.md](docs/EVALUATION.md): the first vertical slice (Astro portfolio, 404 compass)
- [ROADMAP.md](ROADMAP.md)

## License
MIT for the code. Every icon keeps its upstream license, recorded in `.pikto/provenance.json`.
