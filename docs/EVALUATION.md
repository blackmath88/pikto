# icon factory → `pikto`

A small tool for adding icons that fit a repo's existing icon system.

- `RESEARCH.md`: ecosystem survey (libraries, MCPs, CLIs, SVG tooling, licenses, gaps)
- `CONCEPT.md`: problem, the refined hypothesis, deterministic vs LLM responsibilities, interface, and what not to build
- `pikto/`: the thin vertical slice (one ~260-line Node CLI; deps: `svgo`, `svgpath`; data: Iconify public API) plus `SKILL.md` for agents
- `ENTSLOPIFY.md`: iteration 2. How Syntax would build it, better sources (DESIGN.md, AIGA/DOT), the pictogram lineage (Aicher, Isotype, Tokyo '64, Kare), slop removal via différance, and Lumpesammlig principles; adds `differ`
- `EXAMPLE.md`: a full run against the Astro portfolio template (`examples/astro-portfolio`) that adds a compass icon to the 404 page

## Evaluation

**Is it genuinely useful?** Yes, but narrowly. It helps most in repos that already have an icon convention, which covers most mature projects. There, "use Iconify" produces grammar drift, a second library, or silently broken rendering. We hit that last failure in our own first attempt: SVGO removed `stroke="none"`, which would have outlined every fill inside the repo's `<Icon>`. The value is conformance plus validation against the host plus provenance. It is not about having more icons. In a repo with no icons at all, it adds little. You would pick a family, and that is a one-time design decision.

Principle (adopted from Lumpesammlig): deterministic about evidence, provenance and execution; non-deterministic about interpretation.

**Deterministic:** everything touching SVG. That covers profiling measurements, license filtering, feature extraction, scoring, grid rescale, stroke/cap/join normalisation, colour stripping, applying the host convention, SVGO, bbox/padding/parity checks, writing to the registry, and provenance.

**Benefits from an LLM:** deciding whether an icon belongs at all, which is the most important call. Also choosing the metaphor, weighing family match against construction match against legibility at the render size, and making integration choices (size and gradient matched to siblings). All of these are judgement calls about meaning, not geometry.

**Is MCP warranted?** Not yet. A CLI with JSON output is enough for any agent with a shell, and the key state (`profile.json`, `provenance.json`) belongs in the repo. Once the verbs are stable, add a thin MCP adapter for shell-less clients.

**What another agent needs to use this reliably:**
- stable JSON schemas for profile, candidates and validation
- `why[]` on every score
- hard validation failures instead of warnings
- an offline mode using `@iconify/json` for determinism and CI
- a `--dry-run` for `add`
- registry adapters for more conventions: React components, sprites, `.svg` dirs, `unplugin-icons` / `~icons/...` imports
- the SKILL.md rule of "do not add icons merely because space exists"

**How it differs from "use Iconify":** Iconify answers "what icons exist called X?". pikto answers "which of those belongs in *this* repo, in what form, where does it go, and where did it come from?". It measures the repo, ranks against it, conforms mechanically, validates in context, and leaves an audit trail.

## Known limits of the slice

- The attribute parser is regex-based. That is fine for Iconify's normalised bodies, but not for arbitrary SVG.
- Only one registry convention is supported (an object map of fragments). Everything else falls back to writing `.svg` files.
- `compose` is not built. The next step is paper.js booleans plus a modifier-slot spec (corner badge position, knock-out gap = 1× stroke).
- The profile ignores optical coverage of existing icons. It should measure the median bbox, not only validate it.
