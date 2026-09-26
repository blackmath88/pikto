# ENTSLOPIFY — différance, Lumpesammlig, pictogram lineage, and the Syntax test

Second iteration. Four inputs:
1. How would the [Syntax](https://syntax.fm/) hosts build this?
2. Better sources.
3. Your concept of removing slop through *différance*.
4. The design lineage of the pictogram (Aicher and others).

A note up front: `github.com/blackmath88/colors` returns 404 on the GitHub API and couldn't be cloned. It's either private or renamed, and it isn't on your Mac under `~/dev` either. The colour input is still open.

---

## 1. The Syntax test: "how would Wes and Scott build it?"

What they have actually said and built:

- **[Syntax #1006 "Can AI Make Good Design?"](https://syntax.fm/show/1006/can-ai-make-good-design)** (May 2026). Wes: code is deterministic and testable, design also has to be good, useful and effective. He says "every app looks exactly the same", and calls AI output a mediocre recombination of what already exists (a "warm stew"). His Sarah-Chen test showed the same fabricated testimonial name coming out of four of five models. That is slop as **the most probable output**, not as ugliness. Scott, on Google's DESIGN.md: it looks like a `:root` block of CSS variables, and he worries about "another file in the repo" drifting from the code ([transcript](https://syntax.fm/show/1006/can-ai-make-good-design/transcript)).
- **[Syntax #154, SVGs with Sara Soueidan](https://syntax.fm/show/154/svgs-with-sara-soueidan)**: sprites, SVGO/SVGOMG, "where to find SVGs" (Noun Project and others). This is the pipeline they consider normal.
- **[#893](https://syntax.fm/show/893/everyone-is-talking-about-mcp) / [#920 How to build MCP servers](https://syntax.fm/show/920/how-to-build-mcp-servers)**: they are enthusiastic about MCP, and also practical about it being a tool-calling wrapper.
- **Their own site** ([syntaxfm/website](https://github.com/syntaxfm/website), `src/lib/Icon.svelte`) doesn't use an icon library. It's one hand-rolled Svelte component with an `{#if name === …}` switch over about 33 icons across **11 different viewBoxes** (16, 24, 8×10, 461, 512…), mostly fills, and a `--icon_size` CSS variable. I ran `pikto profile` on it. After a small fix it now detects the `inline-svg-switch` component, grid 16, fill-dominant, with **grid_consistency 0.27**.

So a Syntax-flavoured build would look like this:
- **"Just use the platform."** An `npx` CLI, `currentColor`, SVGO, and a sprite or component. No platform. The current slice already works this way.
- **"Put it where the design already lives."** Read `:root` variables and, if present, `DESIGN.md`. Don't invent a second design file. The profile should be *derived and regenerable* (a cache), not a hand-maintained source of truth. Scott's drift concern applies directly.
- **"Real repos are messy."** Their own site is the proof. The tool must handle mixed grids and hand-drawn one-offs, and it should report that inconsistency (`grid_consistency`) rather than pretend there is one clean system.
- **"MCP is a wrapper."** Build the CLI first. MCP is an adapter over it.
- **"AI for exploration, not for the final idea."** This matches Wes's MAD CSS workflow: generate 20–30 directions, then a human picks. For icons, the LLM proposes several readings and the tool measures them.

## 2. Better sources (new since v1)

| Source | What it adds | License / use |
|---|---|---|
| **[Google DESIGN.md](https://github.com/google-labs-code/design.md)** + `npx @google/design.md lint` | An agent-readable design-system format: YAML tokens (colors, typography, rounded, spacing, components) plus prose sections ([Google blog](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/)). **It has no iconography section.** | Apache-2.0 ([announcement coverage](https://awesomeagents.ai/news/google-design-md-open-source-spec/)) |
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md/blob/main/README.md) | Example DESIGN.md files from real brands | — |
| **[unplugin-icons](https://github.com/unplugin/unplugin-icons/)** | Iconify sets as on-demand components in the build, e.g. `~icons/ph/compass` | MIT. Should be a *target convention* for `add`. |
| **[AIGA/DOT Symbol Signs](https://www.aiga.org/resources/symbol-signs)** (Cook & Shanosky, 1974/79, 50 symbols) | The only canonical, rigorously systematic pictogram set that is **copyright-free**. SVGs are on [Wikimedia Commons](https://commons.wikimedia.org/wiki/AIGA_Images). Covers wayfinding and household concepts (toilets, elevator, baggage, telephone, no smoking…). | Public domain. A legitimate new source for concepts about places and services. |
| [ISO 7001 on Commons](https://commons.wikimedia.org/wiki/Category:ISO_7001_icons?uselang=de) | Public-information symbols in seven categories | [The standard](https://www.iso.org/standard/77442.html) is ISO-copyrighted. Individual Commons files vary, so check per file. |
| [interface.fh-potsdam "Gestalten in Code: Otl Aicher"](https://interface.fh-potsdam.de/gestalten-in-code/projects/otl-aicher/) | Aicher's system rewritten as generative code rules | This is the "programmatic pictogram" precedent. |

**Decision:** pikto should *read* DESIGN.md if it exists, and propose an `## Iconography` section (the spec explicitly keeps unknown sections) instead of keeping its own profile as the source of truth. That answers Scott's objection and fills a real gap in the spec.

## 3. Pictogram lineage: take the grammar, not the glyphs

| Tradition | Grammar worth taking | Can we reuse the assets? |
|---|---|---|
| **Otto Neurath / Gerd Arntz, Isotype** (1920s–) | Reduction to a *type* ("using the same types"). Quantity shown by repetition, not scale. A sign has to work *in a series* ([Wikipedia](https://en.wikipedia.org/wiki/Isotype_(picture_language)), [Burke 2010](https://centaur.reading.ac.uk/16340/1/IDJ-Burke2010.pdf)) | **No.** Arntz's estate prohibits use without permission ([gerdarntz.org](https://www.gerdarntz.org/content/copyright.html)), though authorship of the collective Isotype work is disputed ([Hyphen Press](https://hyphenpress.co.uk/copyright_in_isotype_work_the_claim_of_the_arntz_estate/)). |
| **Katzumie / Yamashita, Tokyo 1964** | The first *coordinated system* of pictograms, not a set of individual drawings ([Japan House](https://www.japanhouselondon.uk/read-and-watch/designing-for-the-world-japanese-pictograms-at-the-tokyo-1964-olympics/)) | No. Olympic pictograms are protected ([LSB Niedersachsen](https://www.lsb-niedersachsen.de/fileadmin/user_upload/Piktogramme_rechtslage.pdf)). |
| **Lance Wyman, Mexico 68** | Shows equipment and body parts instead of stick figures: metonymy over depiction ([IOC](https://olympics.com/ioc/news/a-truly-iconic-look)) | No. |
| **Otl Aicher, Munich 1972 / Frankfurt Airport** | Square grid, only **horizontal, vertical and 45°** lines ([J. Design History](https://academic.oup.com/jdh/article/36/3/249/7222615?guestAccessKey=), [otlaicher.de](https://www.otlaicher.de/en/articles/finding-ways-out-of-uniformity/)). Modular body, no depth, no emotion. Aicher wanted to avoid the "physicality" of Tokyo. | **No.** ERCO holds the worldwide licence ([ERCO](https://press.erco.com/en_us/press-release/company/pictograms-quickly-comprehended-easily-interpreted-immediately-understood_2403)). |
| **Cook & Shanosky, AIGA/DOT 1974** | Committee-evaluated semantics: each symbol was judged on legibility and on how well its meaning read | **Yes, public domain.** |
| **Susan Kare, Macintosh 1984** | "Marry an image and idea". Use a metaphor rather than a picture of a particular product, because the product will date ([Muthesius PDF](https://www.muthesius-kunsthochschule.de/wp-content/uploads/sites/17/2019/07/susankare_ohneschnittklein.pdf), [paraphrase source](https://korrents.com/k/an-icon-should-never-picture-a-c6ec5f)). Small grid, constraint as craft ([Smithsonian](https://www.smithsonianmag.com/innovation/how-susan-kare-designed-user-friendly-icons-for-first-macintosh-180973286/)). | Proprietary. Take the principles only. |

How this becomes tooling:
- **Aicher becomes a measurable signal.** `validate` now reports `angle_grammar_45`, the share of straight segments that run at 0°, 45° or 90°. For compass: `ph:compass` 0.00 (all curves), `tabler:compass` 0.57, `ph:signpost` 0.80. It's a report, not a rule. A project can declare "we're Aicher-ish" and rank on it.
- **Isotype and Tokyo mean it has to work in a series.** An icon is judged against its siblings, not alone. That's what `differ` does (below).
- **Wyman and Kare are LLM-level guidance**, written into SKILL.md: prefer metonymy and metaphor (equipment or a part of the thing) over literal depiction. Never draw a specific product.
- **AIGA** becomes a second, public-domain source adapter in v2, for the place and service concepts (wayfinding, household).

## 4. Removing slop through *différance*

Derrida: meaning isn't present in a sign. It comes from **differing** (a sign is what it is only by being distinguished from other signs) and **deferring** (meaning is always postponed along a chain of other signs) ([Derrida, "Différance"](https://web.stanford.edu/class/history34q/readings/Derrida/Differance.html), [Philopedia](https://philopedia.org/terms/differance/)).

Applied to icons, I read slop as a *failure of difference*. There are three kinds, and each can be measured:

| Kind of slop | Différance reading | Operationalised |
|---|---|---|
| **Default sameness.** Every app gets `lucide:compass` (Wes's "every app looks the same", Sarah Chen) | The sign doesn't differ from the most probable sign, so it says nothing about *this* project | `differ` → `generic_default.iou`, the overlap with the Lucide/Heroicons/Tabler version of the same concept. High overlap means no distinction was gained. |
| **Internal confusability.** A new icon collides with a sibling | Within the repo's system, the sign doesn't differ enough from its neighbour | `differ` → `nearest_siblings[].iou`. Above 0.55 it's flagged. |
| **Incoherence.** The icon is distinct but from another world | It differs on the *wrong axis*: grammar, not meaning | Profile match (grid, stroke ratio, construction, family) plus `visual_weight_vs_siblings` |

Plus the **deferral** part, which isn't measurable and belongs to the LLM:
- A UI element's meaning comes from its **neighbours in the interface**, not from a dictionary. So the semantic question isn't "what icon means *404*?" but Lumpesammlig's question: **"why this and not its nearest peer?"** The 404 page differs from the home page because it's a *wrong turn*, not an empty state or an error. That reading is what gives permission for `compass` or `signpost` rather than `warning`.

The goal, then: **coherent in grammar, distinct in meaning.** Close to the siblings on the style axes, far from them on the shape axis, and far from the generic default.

The first measurements (`pikto differ` on the Astro repo):

| candidate | weight vs siblings | nearest sibling IoU | overlap with generic default | verdict |
|---|---|---|---|---|
| `ph:compass` | 1.21× | moon-stars 0.35 | lucide:compass 0.34 | coherent-and-distinct |
| `ph:signpost` | 0.91× | trophy 0.21 | lucide:signpost 0.44 | coherent-and-distinct |
| `ph:map-trifold` | 1.52× | terminal-window 0.49 | — | coherent-and-distinct (borderline heavy, and similar to the terminal frame) |
| `tabler:compass` | 1.31× | **compass 0.82** | lucide 0.35 | **review: confusable with the existing compass** |

IoU on binary masks is crude. Line icons with small offsets score low even when they read the same. It's good enough to catch collisions and exact defaults, not to judge taste. Masks are computed in memory only (resvg), and no raster assets are written.

## 5. What to adopt from Lumpesammlig

[blackmath88/lumpesammlig](https://github.com/blackmath88/lumpesammlig) makes the same split we arrived at independently, but it is more explicit about it. Adopt:

1. **"Deterministic about evidence, provenance and execution; non-deterministic about interpretation."** (ARCHITECTURE.md). That is exactly the pikto boundary, and the README now uses this wording.
2. **evidence ≠ reading ≠ transformation ≠ experiment ≠ reflection.** Mapped to pikto:
   - evidence is `profile.json`, the measured and regenerable facts about the repo
   - reading is the *why this UI element, and why not its nearest peer*
   - transformation is the concept or metaphor choice
   - experiment is the candidates plus `adapt`/`differ`
   - reflection is what the rendered result revealed (e.g. "tabler compass collides")
3. **"What in the encounter gave us permission to make this move?"** `add` now takes `--reading` and `--permission`, and stores both in `provenance.json` next to the source and license. Every icon records its justification, not only its origin.
4. **"Do not jump from appearance to UI" / "reject transformations that merely imitate surface appearance."** For icons: don't copy Aicher's look (black stick figures). Take the grammar (the 45° constraint, working in a series).
5. **"No universal schema; let repetition prove structure."** Keep the profile small and derived. Don't grow a taxonomy of "character".

Don't adopt: the exhibition and encounter-directory structure. pikto is a utility inside someone else's repo, and it should leave only `.pikto/` behind.

## 6. Changes made in this iteration

- `profile`: detects inline-svg-switch icon components (the Syntax pattern) and reports `grid_consistency`
- `validate`: `angle_grammar_45` (Aicher signal)
- **new `differ`**: visual weight vs siblings, nearest-sibling confusability, overlap with the generic default, and a verdict
- `add --reading --permission`: records the Lumpesammlig-style justification in the provenance
- new dependency: `@resvg/resvg-js` (≈4 MB native, used only for in-memory masks). This is the only non-trivial dependency, and it's justified by `differ`.

## 7. Next (only if wanted)

1. A DESIGN.md reader, plus a proposed `## Iconography` section (grid, stroke, family, construction, angle grammar, do's and don'ts).
2. An AIGA/DOT public-domain source adapter for place and service concepts.
3. An `add` target for unplugin-icons (`~icons/...`) and for Svelte switch components.
4. The colors repo, once it's accessible, to decide whether colour enters the profile at all. For icons it usually shouldn't: `currentColor` plus the host's gradient is the right boundary.
