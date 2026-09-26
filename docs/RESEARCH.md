# RESEARCH — icons for coding agents

Researched September 2026. Question: what exists between "an agent needs an icon" and "an icon that fits this repo"?

Short answer: retrieval is solved and commoditised. Nobody is doing repo-aware fitting — detecting a project's icon conventions and conforming candidates to them, with provenance. That is a small gap, but it is a real one.

---

## 1. Icon sources (SVG libraries)

| Project | URL | License | Grid / grammar | Construction | Notes for agents |
|---|---|---|---|---|---|
| **Iconify** (aggregator) | [iconify.design](https://iconify.design/docs/api/) · [github.com/iconify](https://github.com/iconify/iconify) | MIT tooling; each set keeps its own license | per set | normalised JSON bodies | 200k+ icons, 200+ sets. There is a public keyless HTTP API ([search](https://iconify.design/docs/api/search.html), [SVG render](https://iconify.design/docs/api/svg.html), [`/{prefix}.json?icons=`](https://iconify.design/docs/api/queries.html)), and every set's license, author and grid height is exposed through `/collections`. Can be self-hosted. You can also depend on `@iconify/json` / `@iconify-json/{prefix}` ([docs](https://iconify.design/docs/icons/json.html)) to work offline. **Use as a dependency. Don't rebuild it.** |
| **Lucide** | [lucide.dev](https://lucide.dev/contribute/icons/design-principles) · github.com/lucide-icons/lucide | [ISC](https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE) | 24×24, 2px, round caps/joins, 2px padding | stroke | Has the most explicit written grammar: a [spec](https://lucide.dev/contribute/icons/specification) with must/should rules. This is the default agents fall back to. |
| **Tabler Icons** | [github.com/tabler/tabler-icons](https://github.com/tabler/tabler-icons) | MIT | 24×24, 2px ([README](https://github.com/tabler/tabler-icons/blob/main/README.md)) | stroke (+ filled) | About 6,200 icons. Stroke width is adjustable, which makes it a good raw material for adaptation. |
| **Heroicons** | [github.com/tailwindlabs/heroicons](https://github.com/tailwindlabs/heroicons) | MIT | 24 outline at 1.5px, 20/16 solid ([heroicons.com](https://heroicons.com/)) | stroke / fill | Small set with a very coherent grammar. |
| **Phosphor** | [phosphoricons.com](https://phosphoricons.com/) · github.com/phosphor-icons/core | MIT | 256 grid, 6 weights ([homepage repo](https://github.com/phosphor-icons/homepage)) | Distributed as flattened fills (Iconify `ph`). Raw strokes are in Figma. | Weights are a built-in style axis (thin → bold, fill, duotone). |
| **Material Symbols** | [developers.google.com/fonts/docs/material_symbols](https://developers.google.com/fonts/docs/material_symbols) | Apache-2.0 | 4 variable axes: FILL, wght, GRAD, opsz | font / SVG | Currently the best-engineered example of parametric icon style: weight, grade and optical size are real axes. The catch is that they only work inside that one family. |
| Iconoir, Remix, Mingcute, Solar, Mage, Hugeicons (free tier), Myna UI… | via Iconify | mostly MIT / Apache | 24, ~1.5px | stroke | These add breadth. In practice they are the cross-family candidates when the repo's own family has no match. |
| Font Awesome Free | fontawesome.com | CC-BY-4.0 icons | 512-ish, fill | fill | Requires attribution, so rank it lower. |
| Streamline free | [streamlinehq.com](https://help.streamlinehq.com/en/articles/5354376-streamline-free-license) | custom, attribution | — | — | Its license is not permissive enough for agent-driven reuse, so avoid it. |
| Icons8 | [github.com/icons8/icons8-mcp](https://github.com/icons8/icons8-mcp) | commercial | 116 styles | mixed | Offers MCP access to about 368k icons. Proprietary licensing, so it is out of scope for a permissive tool. |

Takeaways:
- Nearly every permissive set can be reached through Iconify, and Iconify's `/collections` already provides license, author and grid height per set. **Provenance data is already available. We only need to keep it.**
- Formal style grammars exist, but only inside a single family (the Lucide spec, Material's axes, Phosphor's weights). No tool translates between families.

## 2. Agent-facing retrieval (MCP / skills / CLIs)

| Project | URL | What it does | Assessment |
|---|---|---|---|
| **better-icons** (better-auth) | [github.com/better-auth/better-icons](https://github.com/better-auth/better-icons) | Skill + MCP + CLI for searching and fetching SVGs from Iconify ([listing](https://mcpservers.org/agent-skills/better-auth/better-icons)) | About 1.3k stars and the strongest existing entry. It solves "find an icon and paste it". It does not look at the repo. |
| Iconify MCP servers (imjac0b, Osmansiddiquer, pipeworx, willlaiwk…) | [glama.ai list](https://glama.ai/mcp/servers/imjac0b/iconify-mcp-server) · [icon-search-mcp](https://glama.ai/mcp/servers/willlaiwk/icon-search-mcp) | Thin wrappers over the Iconify API. Some return license metadata. | A crowded space of near-duplicates. Nothing to add here. |
| pickapicon-mcp | [github.com/leee62/pickapicon-mcp](https://github.com/leee62/pickapicon-mcp) | Iconify → SVG through an LLM | Same approach as above. |
| icons-mcp (devstroop) | [glama.ai](https://glama.ai/mcp/servers/devstroop/icons-mcp) | Font Awesome + Iconify | Same. |
| iconify-cli (unofficial) | [libraries.io](https://libraries.io/npm/iconify-cli) · [docs](https://iconify-cli.bytelab.studio/getting-started.html) | search / preview / download in SVG, JS or Vue, with metadata headers | A good CLI precedent. No fitting. |
| lucide skills (skillsdirectory) | [link](https://www.skillsdirectory.com/skills/infometa-lucide-icons) | Fuzzy search in Lucide, change stroke and size | Only works within one family. |
| mcp-image-server | [github.com/ricardopera/mcp-image-server](https://github.com/ricardopera/mcp-image-server) | Generates icons with GPT-Image, then converts to SVG | Raster-first. This is the anti-pattern for our goal. |

## 3. Semantic search

- Iconify `/search` searches names, tags and categories. That is lexical, but because it covers 200+ sets the synonym coverage is decent. It has no notion of embeddings or metaphors.
- [wantpinow/icon-search](https://github.com/wantpinow/icon-search) does OpenAI-embedding search over Lucide. [nerd-fonts-icon-search](https://github.com/jackjyq/nerd-fonts-icon-search) uses ChromaDB. There is also an [Iconia dataset write-up](https://gustavo-espindola.medium.com/build-your-own-ai-powered-icon-search-engine-a3400015324b).
- Assessment: **the calling LLM already handles semantics well.** It can turn "page not found" into `compass | signpost | map | ghost` and then run lexical searches. An embedding index would duplicate what the agent does for free. Build one only if lexical recall turns out to fail in measured cases.

## 4. Deterministic SVG tooling (reuse)

| Tool | URL | License | Role |
|---|---|---|---|
| **SVGO** | [github.com/svg/svgo](https://github.com/svg/svgo) · [svgo.dev](https://svgo.dev/docs/introduction/) | MIT | Optimisation and normalisation. The standard choice. Caveat: its default plugins remove "useless" stroke attributes and `stroke="none"` unless it knows the host context. We hit this bug in the slice (see §7). |
| **svgpath** | [npm svgpath](https://www.npmjs.com/package/svgpath) | MIT | Path transforms (scale, translate, abs, unarc, iterate). Tiny and dependency-free. |
| svg-path-commander | [npm](https://www.npmjs.com/package/svg-path-commander) | MIT | Alternative with bbox support. |
| @iconify/utils | [docs](https://iconify.design/docs/libraries/utils/) | MIT | Parses IconifyJSON and builds SVGs. Needed for the offline mode. |
| paper.js (+ paper-jsdom) | [paperjs.org](https://paperjs.org/reference/path/) | MIT | Boolean operations (unite, subtract, exclude). Needed for **composition** with knock-outs, e.g. a badge cut-out behind a modifier. Heavy, so load it only for `compose`. |
| oslllo-svg-fixer | [github.com/oslllo/svg-fixer](https://github.com/oslllo/svg-fixer) | MIT | Converts strokes to fills (outlining). Useful for exporting to fonts or for fill-convention repos. It is lossy: once converted you cannot change the stroke width. |

## 5. Generative SVG

- [StarVector](https://github.com/joanrod/star-vector) (Apache-2.0, image/text → SVG code), [OmniSVG](https://github.com/OmniSVG/OmniSVG/blob/main/README.md), IconShop.
- These are research-grade. Output is not grid-aligned, stroke grammar isn't guaranteed, and paths are hard to edit. They make sense only as a last-resort fallback, and even then the output should go through the same validator.

## 6. Architectural patterns observed

1. **Wrapper over Iconify.** This is every MCP and skill listed above. Retrieval is effectively free now.
2. **Family-internal parametric style.** Material axes, Phosphor weights, and Lucide/Tabler `stroke-width` props. This works well until you mix families.
3. **Repo-local registry.** For example, the Astro portfolio template keeps `IconPaths.ts` plus a comment block telling humans how to hand-convert Phosphor SVGs (strip the wrapper, remove colours, add `stroke="none"` on fills). **This is the manual version of what we want to automate.** The convention lives in the repo, not in the icon library.
4. **Raster generation, then trace.** Avoid this.

## 7. Evidence from the slice (what broke, what didn't)

- A mechanical 24→256 rescale plus stroke normalisation of `tabler:compass` gave geometry whose outer edge (24–232) and stroke (16 = 1.5px at 24) exactly match the repo's Phosphor icons. Cross-family adaptation of strokes is cheap and deterministic.
- Iconify's Phosphor set is **flattened fills**, while this repo's registry is mostly **stroke-constructed**. The "same family" candidate therefore looks right but has the wrong construction for editing. This tension between family match and construction match is real, and it is the kind of decision that should be exposed to the LLM rather than hidden.
- SVGO removed `stroke="none"` and per-shape stroke attributes because the standalone wrapper didn't declare the inherited stroke. The icons would have rendered wrong, with outlines on fills and missing stroke widths, inside the repo's `<Icon>` component. The fix is to optimise inside a wrapper that mirrors the host component. **Validation has to be done relative to the repo's rendering context, not the icon on its own.**

## 8. Recommendations

- **Depend on:** the Iconify API (or `@iconify/json` offline), SVGO, svgpath. Add paper.js only once `compose` exists.
- **Don't build:** another icon library, another Iconify MCP wrapper, an embedding search index, or a generative model.
- **Build:** a small, repo-aware conformance layer: `profile`, then rank, then adapt, then validate against host context, then write into the repo's own registry with provenance.
