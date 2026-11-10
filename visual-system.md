# Tag Atlas — visual system v0.2

**Direction:** Quiet Atlas / editorial base, instrument-panel density, a hidden kitchen layer.
**Status:** second visual pass; the standalone app is built with the v0.3 interaction layer at [`app/README.md`](app/README.md) · `http://127.0.0.1:4173/`. No vault notes were touched.

---

## 1. What this is

A visual system for the Tag Atlas view: a stable map of tag notes, content notes, status, and curated indexes. The model is defined in [tag-atlas-brief.md](tag-atlas-brief.md). This document defines how it looks and why.

The constraints from the discussion are treated as hard rules:

- No unnecessary blue gradients, glass, or glow.
- No excessive rounded corners. Panels are square; cards, buttons, fields, and badges use a 2px radius.
- Light and dark are warm mid-tones, not white and not black.
- The kitchen / steak idea is a hidden easter egg, never part of the main path.

---

## 2. Principles

1. **One relation per layer.** Taxonomy is a wire; membership is position; annotation is a line that appears only on focus.
2. **Status is the only chromatic channel.** Tags, panels, wires, and type stay neutral. The seven palette colors belong to status and index, nowhere else.
3. **Containers and contents look different.** Active tags are cards; context tags are label-only stations with a 1px hairline outline (no fill); notes are small rings.
4. **The map is stable.** No ambient motion, no re-layout on every edit. The selected branch expands; the rest stays put.
5. **Labels are earned.** Tag names are always visible. Note names appear on hover, selection, or close zoom. Context tags are labels, not boxes.
6. **Hairlines, not shadows.** Structure comes from 1px rules, alignment, and whitespace.
7. **One home, visible links.** A note has one home; other categories are linked memberships, shown as counts and bridge tags, not duplicate nodes.

---

## 3. Surfaces

### Light — warm paper

| Token | Hex | Use |
|---|---|---|
| `bg` | `#f1eee7` | canvas, app background |
| `surface` | `#fbf8f1` | top bar, rail, inspector, cards |
| `surface-2` | `#ece7dc` | fields, selected row, hover |
| `surface-3` | `#e2dccf` | rare inset |
| `selection` | `#e6e0d3` | active rail row, selected table row |
| `line` | `#d6d0c3` | hairlines |
| `line-strong` | `#ada392` | active card borders, table header |
| `ink` | `#211e19` | primary text |
| `ink-2` | `#5a5347` | secondary text |
| `ink-3` | `#877e6e` | metadata, labels |

### Dark — warm charcoal

| Token | Hex | Use |
|---|---|---|
| `bg` | `#23211d` | canvas, app background |
| `surface` | `#2d2924` | top bar, rail, inspector, cards |
| `surface-2` | `#38332c` | fields, selected row, hover |
| `surface-3` | `#413b33` | rare inset |
| `selection` | `#473f36` | active rail row, selected table row |
| `line` | `#4f483d` | hairlines |
| `line-strong` | `#756b5c` | active card borders, table header |
| `ink` | `#f4eee2` | primary text |
| `ink-2` | `#c0b5a3` | secondary text |
| `ink-3` | `#978c7c` | metadata, labels |

The canvas has a 24px dot pattern (1px dots, 9–10% ink). It is an SVG pattern, not a gradient. It gives scale without a grid that competes with the cards.

---

## 4. Type

| Voice | Face | Size / weight | Use |
|---|---|---|---|
| Display | C059 (fallback Century Schoolbook, Noto Serif) | 29–34 / regular | wordmark, selected note title, table title |
| Interface | Fira Sans (fallback Noto Sans) | 10–13 / 400–500 | labels, rows, buttons, body |
| Data | JetBrains Mono (fallback Noto Sans Mono) | 7–10.5 / 400 | paths, counts, status, micro-labels |

Rules:

- Tabular numerals everywhere (`font-variant-numeric: tabular-nums`).
- Micro-labels are uppercase mono, 7–8.5px, letter-spacing 0.08–0.14em.
- The serif is used sparingly: the wordmark, the selected note, and table titles. It is the “book voice”.
- Body text stays sans. Paths and counts stay mono. No serif in dense rows.

---

## 5. Geometry

- **Canvas:** 1600 × 1000 design frame → 1600 × 1000 CSS px.
- **Top bar:** 56px. **Footer:** 38px. **Index rail:** 272px. **Inspector:** 320px. **Canvas:** the remainder.
- **Panels:** square corners, 1px borders, no shadows.
- **Cards / buttons / fields / badges:** 2px radius.
- **Status rings:** circular, because they are data; not a card.
- **Density:** rail rows 25px; table rows 40px; group headers 26px; inspector sections 22px apart.
- **Alignment:** counts and dates right-aligned; tag card meta is a two-column baseline; hierarchy wires meet card edges, not centers.

---

## 6. Atlas grammar

### Active tag card

- 58–62px tall, 160–196px wide.
- `surface` fill, 1px `line-strong` border, 2px radius.
- Hub (selected branch root): 1px `ink` border.
- Index tag: 2px `index` left edge and a 7.5px `INDEX` mono label.
- Contents: name (13px), meta (`7 in branch · 3 tags`, `4 anchored`, or `0 anchored · 1 linked`; curation flags such as `◇ unindexed` sit on the right), and a 44px × 3px status sparkline at bottom-left.
- The sparkline segments are proportional to the tag’s member status counts (branch counts for ancestors such as Math), exact status colors.

### Context tag

- No box, no fill. A label-only station at 62% opacity: name 11.5px, compact count `N +M` at 8px mono, a 30px status line.
- This is the key decluttering move: the selected branch is cards; the rest of the map is names.
- Context tags remain clickable and searchable.

### Note

- 16px ring: five 58° arcs with 14° gaps; center dot 2.7px radius; 2.3px stroke.
- Status color fills the completed arcs and the center. Unfilled arcs are `ring-off`.
- On light paper, the arc stroke is darkened one step; the center dot keeps the exact palette color. Example: `#7th` ring stroke `#3a9e86`, center `#70ffd4`.
- `#thesis` gets a 0.7px `#b4b2ff` outer ring in dark, `#7774ff` in light.
- Selected note: 24px, 2.6px stroke, 1px ink halo at 24% opacity.
- Labels: selected note gets a title + `#5th · 3 / 5` below the dot. Active notes get 10.5px labels on close zoom. Context notes are unlabeled; hover reveals them.
- Note-note annotation: 1px dashed `line-strong`, 2/3 dash, with an 8px mono label (`sequence`). Only on selection.

### Hierarchy

- 1px solid `wire`, stepped 90° traces with multiple corners, no curves. Math → Calculus / Information Theory / Exponential.
- Membership is not a line. The note sits in the tag’s orbit; a faint tether can appear on hover.
- Tag→tag “related” links would be dashed; there are none in the current vault.

---

## 7. Index rail

- Header: `INDEX` + `27 tags`.
- `All notes` row (15 total, including the unfiled note), then alphabetical roots; Math expanded to Calculus / Information Theory / Exponential; Machine Learning expanded to AI / Language.
- Row: caret, 6px index square (purple outline), name 11.5px, warning diamond, 36px status sparkline, count 9.5px mono. The count is `anchored +linked` (`0 +2`), or the branch count for Math. Active row: `selection` fill, 2px ink left rule.
- Child rows are indented 25px with a 1px guide line.
- Review section pinned at the bottom: `Unused tags 1`, `Unsorted 1`.
- Empty tags are not in the map; they are in the review tray and still searchable.

---

## 8. Inspector

- Eyebrow `SELECTED NOTE`, close button.
- Serif title 29px; status badge with a 12px ring, `#5th`, `3 / 5`.
- Excerpt 12.5px, 2–3 lines. Muted italic empty state.
- Path: min-height 34px, can wrap to two lines, mono 10.5px, copy icon; `Ctrl+O → paste` hint. This is the requested quick-switcher path.
- Home / tags: breadcrumb with inherited ancestor muted (`Math / ▪ Information Theory`), secondary tags below (`+ Machine Learning`). A 4px filled square marks the home.
- Index: purple 6px square + index name + `CURATED` badge. Unindexed state: warning diamond + `NOT LISTED`.
- Links: one outgoing sequence line; backlinks list with title + path.
- Curation note (when relevant): 2px `warn` left rule, `surface-2` fill, 10px explanation.
- Actions: `Open note ↵` primary (ink fill / off-white text in dark), `Copy path C` secondary, `Copy wikilink` text.
- Footer: `LAST EDIT 07 JUN 2026` / `104 WORDS`.

---

## 9. Index table

- Header: `All notes`, `15 notes · 14 staged · 27 tags`, sort control.
- Columns: 30px ring, 1fr note, 280px path, 190px home/tags, 84px curation, 74px edited. A 4px filled square marks the home tag.
- Rows 40px, group headers 26px, 1px hairlines. No zebra stripes.
- Group headers: `#RAW 2`, `#3RD 2`, `#5TH 4`, `#7TH 3`, `#THESIS 3`, `UNFILED 1`; exact status square + a rule.
- Selected row: `selection` fill + 2px ink inset rule; title 500.
- Curation column: `CURATED`, `UNINDEXED` (warning diamond), or `—`. This is how index drift becomes visible.
- Unfiled row: dashed ring, warning diamond, `(vault root)`, `—` tags/curation/date.

### 9.1 Cross-category grammar

- **Home** = the global anchor (`#index` curation first, then the first remaining tag). Every other direct tag is **linked**.
- **Counts:** active tag cards show `N anchored · M linked`; context labels and the rail use compact `N +M`; Math says `7 in branch`.
- **Focus:** selecting a linked tag re-anchors its linked notes to that tag for the view. `Machine Learning` is the canonical example: `1 anchored · 2 linked`; focusing it shows `How to set up Pytorch` with `home · Machine Learning`, plus `Entropy` and `Compression of language` with `home · Information Theory`.
- **Meta-tags:** a per-tag setting, not a fixed type. Defaults: `Obsidian`, `Zettelkasten`, `Take Note`, `Learning`; any tag can be toggled. Only bridge detection is affected; home, counts, placement, and search are unchanged.
- **Multi-index:** deepest curated tag wins; ties break by tag order; the inspector lists “also curated by”.
- **Home mark:** a 4px filled square before the home tag in the breadcrumb and table.

### 9.2 Bridges lens

A third tab for notes with **2+ non-meta memberships**. It groups by `span` (5, 4, 3, 2) and lists note, home, bridge tags, curation, and date. The inspector shows the home breadcrumb, the bridge tags with a small bridge glyph, and the usual links/actions. This is the management surface for cross-category notes; the Atlas stays spatial.

---

## 10. Status encoding

| Tag | Stage | Exact | Light ring stroke |
|---|---|---|---|
| `#raw` | 1/5 | `#ff9494` | `#d96f6f` |
| `#3rd` | 2/5 | `#feb867` | `#cf8a3a` |
| `#5th` | 3/5 | `#a7e052` | `#7d9f38` |
| `#7th` | 4/5 | `#70ffd4` | `#3a9e86` |
| `#thesis` | 5/5 | `#2d2afe` | `#2d2afe` |
| `#external` | type | `#ffb8fd` | `#c77bc1` |
| `#index` | type | `#9c66ff` | `#7d4bd6` |

`#external` and `#index` are types, not stages. They never enter the doneness count. Color is always paired with segment count or a label; never color alone.

The seven colors are imported from `.obsidian/graph.json` in the real app, so the view follows the user’s own graph palette.

---

## 11. Semantic zoom

| State | What is visible |
|---|---|
| Branch selected (current frames) | Active cards + note rings + active note labels + context labels |
| Zoomed out | Tag cards/labels + sparklines; station counts hide, note labels remain as hover targets |
| Zoomed in | All labels + secondary ticks + annotation lines |
| Search | Matches and ancestor chain stay; unrelated branches dim, not disappear |

Context tags are 62% opacity; context notes 38%; active branch 100%. Selected state adds the 1px halo and the label.

---

## 12. Hidden kitchen layer

This is the only place the steak metaphor appears.

- **Trigger:** press `~` or click the 7px mark at the far right of the footer.
- **Surface:** a 286px popover above the footer, `surface` fill, 1px `line-strong`, 2px radius.
- **Header:** `BUTCHER'S CHART` + a small T-bone line icon.
- **Rows:** `#raw blue`, `#3rd rare`, `#5th medium rare`, `#7th medium well`, `#thesis well done`, with counts.
- **Footer:** `Press ~ or click the 7px footer mark. Never in the main path.`
- No steak language, colors, or icons in the main Atlas, Index, or inspector.

This is a deliberate last-step delight, not a theme.

---

## 13. Do / Don’t

**Do**

- 1px hairlines, 2px radii.
- Solid fills.
- Status color only on data.
- Tabular numerals; aligned counts.
- Labels on hover or close zoom.
- Orthogonal hierarchy routes.
- Generous whitespace; let the map breathe.

**Don’t**

- Blue accent or blue gradients.
- Pills, glass, drop shadows.
- Rounded panels or cards.
- Color-only status encoding.
- More than one accent hue.
- Decorative motion.
- Labels on every node at once.

---

## 14. Assets

All frames are 1600 × 1000, rendered from static HTML/CSS.

The historical design frames are kept local and are not committed: they were rendered against a private vault. The app itself is the current visual reference.

---

## 15. Open questions

- Should the meta flag be visible in the index/tag panel (a small `M` marker), or live only in settings?
- The app toggles Bridges grouping by span or signature; which should be the default?
- Should note-note annotations be visible by default at close zoom, or only on selection?
- Do you want the standalone app to open notes via `obsidian://` links as well as showing the path?
- Motion: state-only transitions (current direction) or a small amount of entrance motion?

---

## 16. Interaction layer (v0.4 — force graph)

- **Shell:** viewport-filling app; topbar and footer fixed; rail and inspector scroll; the canvas is an unbounded, camera-driven force graph with an infinite dot grid and no minimap.
- **Camera:** drag background = pan with no bounds; wheel / `+` / `−` = zoom at cursor; `F` = fit; `0` = 100%. No minimap. Camera transform uses a 300 ms ease-out; direct manipulation uses no transition.
- **Nodes:** tags are cards/stations; focus notes are rings with hover/selected labels. Every tag and focused note node is draggable. A drag follows the pointer while held and rejoins the force simulation on release; there is no pin state. The focused tag is focus-locked under physics. No node is hidden for focus; roots stay visible.
- **Force:** center attraction, inverse-square repulsion, tree spring links, a light home spring for notes, orbit placement, AABB collision for labels. Shared-note links are draw-only; secondary note links carry a light local spring. Defaults 0.50 / 10.30 / 0.68 / 172 / 0.18 cohesion, live in the Forces panel.
- **Focused tag:** a card at its graph position; locked while focused; no fixed stage center. All branch notes join as note nodes; home edges.
- **All-tags view:** tree edges; last-focus station; `Return to <tag>`; click empty canvas to deselect. Shared-note links are faint dotted edges with no spring force.
- **Overview LOD:** station counts hide below 112% zoom; hover, selection, or zoom restores them. Tag names, size classes, status bars, and all note labels remain as hover targets.
- **Hover:** tooltip, relationship dimming, active tree/home edges; selected note remains opaque. Hover fills are translucent tints, never solid blocks; active/selected fills remain solid. Note labels stay visible and are hover targets; station counts use LOD.
- **Grammar:** square = tag; ring = content note; legend names both plus index tree/note home/note link/shared note. Every tag with an edge has one neutral **rectangular port** that slides around its box to the average direction of its lines; tree, note-home, note-link, and shared-note edges all end at its face. Solid tree edges are stepped 90° traces with many corners. Secondary note links appear on hover/selection. Shared-note edges are faint dotted lines with zero spring force.
- **Quick switch:** Obsidian-style overlay with path-ranked tag/note results, badges, and ↑/↓/Enter/Esc. It is the only search surface: `Ctrl+O` / `⌘O` / `/` or the compact topbar trigger; the topbar has no filter input. Double-clicking a tag selects/focuses it.
- **Footer:** interactive status filters, all-notes, unindexed; pinned to viewport bottom.
- **Motion:** force ticks, focus transitions, hover fades, camera fit. No ambient looping motion; reduced-motion respected.

## 17. Next step

The app is built at [app/README.md](app/README.md). Use it to validate the force feel, the level-of-detail rules, node dragging, the focused-card/root treatment, the tag panel, the index table, and the path-copy workflow before any plugin work.
