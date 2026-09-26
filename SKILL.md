---
name: pikto
description: Add an icon to an existing repo so it matches that repo's own icon grammar and conventions, with provenance. Use instead of installing a new icon library or pasting random SVGs.
---

# pikto (agent instructions)

1. **Decide whether an icon is warranted.** Good reasons: a state that needs recognition (empty, 404, error), a repeated pattern where siblings already have icons, or icon-only controls. "There's space" is not a reason. If none apply, stop.
2. `pikto profile <repo> > <repo>/.pikto/profile.json` (reuse the file if it already exists). Read `families`, `registry`, `grid`, `stroke_width`, `construction`, `render_sizes`.
3. Read the element before choosing: why this and not its nearest peer? Prefer metonymy/metaphor (equipment, a part, a gesture — Wyman, Kare) over literal depiction; never draw a specific product. Choose a metaphor. Run `pikto search <concept> --profile P` for 2–4 concept names.
4. Pick from the top candidates. Prefer the **same family** first, then matching construction and stroke ratio. Read `why[]`. Never pick an `excluded` candidate.
4b. Run `pikto differ <id> [id…] --profile P` on the finalists. Reject anything confusable with a sibling or near-identical to the generic default; watch visual weight.
4b'. If `profile` shows a `library` (e.g. lucide-react), the icon comes from that library: pick candidates from its family, and `apply` writes components into JSX. Never generate a module or install a second library next to it. Arrows between words or values are typography: leave them.
4c. When replacing a set of glyphs (a role family, not one icon): write `.pikto/proposal.json` (roles → items with `meaning`, `today`, `candidates`, `reading`, and `context` sizes/colours as `var(--token)`; `"frame": true` if the family shares a frame), run `pikto sheet <repo> --profile P`, and hand the HTML to the human. Wait for their pick, then write `.pikto/decision.json` and run `pikto apply <repo> --profile P --dry-run`, then without `--dry-run`. Hand-edit every `unmapped` site, and put sites that must stay text into `skip` with a reason. Finish with the repo's typecheck/tests and `pikto audit <repo> --check`.
5. `pikto add <prefix:name> <local-name> --profile P --reading "why this element and not its nearest peer" --permission "what in the repo justified the move"`. If validation fails, try the next candidate. **Do not hand-edit path data.**
6. Use it the way sibling usages do: the same component, sizes from `render_sizes`, and the same colour/gradient props.
7. Report the source id, license, and operations from `.pikto/provenance.json`.

Never: install a second icon library for one glyph, write SVG paths by hand, or use raster images.
