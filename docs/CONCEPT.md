# CONCEPT — pikto

## Problem

When a coding agent adds an icon, it usually runs `npm i lucide-react`, or pastes an Iconify SVG from whichever set came up first. Either way the project ends up with a second icon grammar: a different grid, stroke weight, construction and colour convention. Or the agent imports a whole new library for one glyph. Retrieval isn't the hard part (see RESEARCH.md). **Conformance** is.

## Challenging the hypothesis

> "A visual adaptation layer that understands a repo's design language and selects/transforms icons accordingly."

This is partly right, but it overreaches in two ways:

1. **"Understands design language" is mostly unnecessary for icons.** What decides whether an icon fits is a handful of measurable properties of the icons already in the repo: grid, stroke ratio, caps/joins, fill vs stroke construction, padding/optical coverage, the source family, and the embedding convention (a registry map, inline JSX, sprite, or `.svg` files). CSS tokens, typography and "character" are context for the agent, but they barely constrain the geometry. A profile that tries to capture "technical-but-playful" is unverifiable, and I'd drop it.
2. **Most of the value is in the boring part: the embedding convention and provenance.** In the example repo, the correct icon was simply "the same family, converted to the repo's registry format". The geometry transform was trivial. The hard, error-prone part was fitting the repo's rendering context: the `<Icon>` component sets `fill` and `stroke` on the root, so fills need `stroke="none"`. SVGO silently broke exactly that.

The refined hypothesis: **a repo-aware conformance and provenance layer for icons.** It measures the existing icon grammar, ranks candidates against it, conforms the chosen one mechanically, validates it in host context, and writes it where the repo expects it along with its source and license. Semantic choices stay with the agent.

## Solved / composable / novel

| | Status |
|---|---|
| Finding icons by name or tag across 200k icons, with license metadata | **Solved** (Iconify API, better-icons, a dozen MCPs) |
| Parametric style within one family (weight, fill, optical size) | **Solved within families** (Material Symbols, Phosphor, Lucide/Tabler stroke props) |
| Optimisation, path maths, booleans, stroke→fill | **Composable** (SVGO, svgpath, paper.js, svg-fixer) |
| Semantic metaphor choice ("404 → compass or signpost?") | **Solved by the calling LLM**. No extra model needed. |
| Measuring a repo's icon grammar as data | **Novel (small)** |
| Ranking cross-family candidates against that grammar, with an explanation | **Novel (small)** |
| Conforming to the repo's *embedding and rendering convention*, validated in host context | **Novel and most useful** |
| Provenance written into the repo on every insertion | **Missing in practice**, though trivial |
| Composition with a shared grammar (base + badge modifier, knock-out) | Worth doing next, built on paper.js |
| Genuine generation | Last resort. Out of scope for v1. |

## Responsibilities

**Deterministic (tool):**
- scan the repo → `profile.json` (grid, stroke width/ratio, caps, joins, construction mix, families, registry/component location, render sizes, tokens), with evidence counts
- search the Iconify API, filter by license, extract features, score with a readable `why[]`
- adapt: rescale to the grid, flatten groups, normalise stroke/caps/joins, strip colours, apply the repo's fill/stroke convention, run SVGO inside the host wrapper
- validate: allowed elements, no scripts/refs/hard-coded colours, bbox inside the grid, padding, stroke-width parity, host-convention checks, size budget
- write into the registry or icon dir, plus `.pikto/provenance.json` and an inline comment

**LLM (agent):**
- decide *whether* an element needs an icon. Most don't.
- choose the metaphor and try 2–4 concept names
- pick among the top-ranked candidates, trading off family match against construction match and legibility at the render size
- decide on integration: size, colour/gradient, and alignment with sibling usages
- only in rare cases, request a composition

The LLM never writes path data.

## Interface (smallest useful)

A **CLI that emits JSON**:

```
pikto profile <repo>                    > .pikto/profile.json
pikto search  <concept>   --profile P   # ranked candidates + why[]
pikto adapt   <prefix:name> --profile P # fragment + operations[] + validation
pikto validate <file.svg> --profile P
pikto add     <prefix:name> <name> --profile P   # adapt+validate+write+provenance
```

Plus a one-page **agent skill** (SKILL.md) that explains when to use it and when not to add an icon at all.

Changes from the sketch in the brief:
- `inspect` is folded into `search` (features per candidate) and `validate`. A separate verb added nothing.
- `profile` is a first-class verb and an artefact checked into the repo. It's the part that makes this different from "use Iconify".
- `export(name)` became `add`, because the destination is the repo's own convention and not a generic file.
- `transform(svg, operations)` became `adapt(id, profile)`. The profile determines the operations, and the ops list is returned for audit. Free-form ops can come later if needed.
- `compose(base, modifiers)` is deferred until there is a real case. It will need a primitives registry (badge positions and knock-out radius per grid) in addition to paper.js.

**Why not MCP first:** every coding agent already has a shell, JSON-over-stdout is enough, and the state (the profile) belongs in the repo, not in a server. An MCP wrapper over the CLI takes about 50 lines and is worth adding once the verbs are stable, mainly for agents without a shell. An npm package with a `bin` is the right distribution. Python isn't justified here, because the ecosystem (SVGO, Iconify, paper.js) is JS.

## Explicitly not building

- another icon library or icon font
- another Iconify search MCP
- an embedding or semantic search index (the agent is the semantic layer)
- raster generation or tracing
- an aesthetic "character" classifier from CSS or screenshots
- a web UI or icon management platform
- automatic "add icons everywhere" passes
