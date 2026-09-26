# pikto audit

`pikto audit <repo>` compares **intent** (DESIGN.md) with **evidence** (the code). It's deterministic and read-only.

It reports:
- **intent**: icon rules from DESIGN.md (glyph size, stroke range), and whether an `## Iconography` section exists
- **uses**: every icon-like character (arrows, technical and geometric symbols, dingbats, emoji). Each one comes with file, line, role (the nearest `class`) and meaning (the nearest status comparison or label). Characters inside running text are marked `typographic` and excluded.
- **vocabulary**: glyph → the meanings it stands for
- **issues**: one meaning drawn with several glyphs, plus a mismatch with the DESIGN.md stroke rule

## First run: opendata-explorer
Full output: [audit-opendata-explorer.json](audit-opendata-explorer.json)

- 24 icon glyphs, 3 typographic, 10 roles
- DESIGN.md asks for a 1–1.5px stroke and 18px glyphs
- Issues:
  - "available" is drawn as △ and as ○
  - all 24 glyphs are Unicode, so their weight depends on the font
- Vocabulary worth a human decision:
  - △ means both *available* and *partial*
  - ✓ covers five positive states (confirmed, covered, selected, locally_available, and so on)

That makes it one status family, which is what the contact sheet in [WORKFLOW.md](WORKFLOW.md) proposes.

## Since v0.5
- Glyphs are classified as icon or typography by position (see [LIBRARY.md](LIBRARY.md)). On opendata-explorer that drops the count from 24 to 21. The 3 dropped are the prose arrows.
- Named imports from icon libraries are inventoried (`libraries`), with issues for two families at once and for glyphs beside a library.

## Limits
- Meaning is inferred with regexes, and some sites come back as `?`. The LLM fills those in from context (the *reading* step).
- It only finds glyphs in template strings and markup. Icon fonts and CSS `content:` aren't covered yet.
