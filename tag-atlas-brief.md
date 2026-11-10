# Tag Atlas — design brief v0.2

**Status:** standalone app built; interaction pass v0.3 (infinite pan/zoom, draggable branches, hover/home lines, last-focus return); awaiting feedback.
**Date:** 2026-11-09
**Scope:** a read-only graph / index / search view for `my first vault`. The vault is not modified.
**Build route:** standalone browser app first; port to an Obsidian plugin only after the model proves itself.
**Visual direction:** Quiet Atlas + instrument density; kitchen is a hidden easter egg. See [visual-system.md](visual-system.md).
**Prototype:** [app/README.md](app/README.md) · `http://127.0.0.1:4173/`

---

## 1. Purpose

The native graph treats every note as the same kind of node and every link as the same kind of edge. In this vault that produces a hairball: tag notes outnumber content notes, tag notes and content notes look alike, `#index` links duplicate membership, and status is only a color.

The goal is a view where the tagging method *is* the structure, not an obstacle. Three things should be true at a glance:

1. Where a note sits in the tag hierarchy.
2. How mature it is (`#raw → #3rd → #5th → #7th → #thesis`).
3. Whether it is curated by its `#index` note, or only linked.

---

## 2. Evidence from the vault (2026-11-09)

- **43 markdown files**: 27 tag notes, 15 content notes, 1 template.
  - 14 content notes have a status; 1 root note is unfiled (the Selachian design document).
  - 4 tag notes are `#index` in the current vault: `Math`, `Calculus`, `Information Theory`, `Machine Learning` (the last was added during the app work).
- **`Math` is linked from 7 content notes, but all 7 also link to one of its children** (`Calculus`, `Information Theory`, or `Exponential`). The `Math` membership is implied by the hierarchy in every case. Collapsing inherited tags is the single biggest visual win.
- **`Calculus` has 4 notes linking to it, but its `#index` note lists only 3.** `Implicit differentiation` is tagged but not curated. The native graph cannot show this drift; the new view can.
- **`Template/Full Note` currently appears in the graph as an orphan.** Templates should be excluded.
- **Most tag notes are empty files.** They are valid category placeholders, but they add visual noise. `Intelligence`, for example, has zero members.
- **Status colors in `.obsidian/graph.json`:**

  | Status | Hex |
  |---|---|
  | `#raw` | `#ff9494` |
  | `#3rd` | `#feb867` |
  | `#5th` | `#a7e052` |
  | `#7th` | `#70ffd4` |
  | `#thesis` | `#2d2afe` |
  | `#external` | `#ffb8fd` |
  | `#index` | `#9c66ff` |

  `#thesis` is dark; it needs a light outline or a brighter ring to stay visible on a dark theme. The app should import these colors from `graph.json` rather than hardcode a second palette.

---

## 3. Why the native graph tangles

Three relations are drawn on one plane:

1. **Taxonomy** — tag → tag.
2. **Membership** — note → tag.
3. **Annotation** — note → note.

Two node classes are drawn with the same grammar:

- **containers / index entries** (tag notes);
- **contents with a lifecycle** (content notes).

Status is a property, but it is encoded only as color. The force layout then optimizes for a single edge type, so the most connected tags pull everything into one blob.

**Design principle:** one relation per layer; one visual channel per meaning. Status is never an edge. A tag note is not a peer of a content note.

---

## 4. Decisions locked in this discussion

| Question | Decision |
|---|---|
| Default view | **Tag Atlas** (map) + **Index** tab (table) |
| Hierarchy | Links from an `#index` tag note to another tag note mean **containment**; other tag→tag links mean "related" |
| Multi-tag notes | **One anchor + secondary ticks** |
| Empty tags | Collapsed into an **Unused tags** tray; still visible in the Index tab and search |
| Build route | **Standalone app first** |
| External notes | Attached **via the content notes that link to them** |
| Editing | **Read-only**; no note edits, no index rewriting |
| Visual direction | **Quiet Atlas + instrument density**; warm light/dark; 1px rules, 2px radii; kitchen hidden as an easter egg |
| Cross-category | **2+ non-meta memberships** after ancestor collapse |
| Meta-tags | **Per-tag setting**, not a fixed type; defaults to `Obsidian`, `Zettelkasten`, `Take Note`, `Learning`; only affects Bridges inclusion |
| Secondary tag focus | **Re-anchor the linked notes for that view**; the global home stays |
| Counts | **Anchored / linked split**; ancestors use branch counts |
| Multi-index | **Deepest curated tag wins**, tie by tag order; inspector shows “also curated by” |
| Bridges lens | **Third tab** listing notes with 2+ non-meta memberships |

---

## 5. Semantic model

### 5.1 Node kinds

| Kind | Rule | Status? | Graph shape |
|---|---|---|---|
| **Tag** | lives in a tag folder; no status except `#index` | no | card / station |
| **Index tag** | tag + `#index` | no | card with a purple double border |
| **Content note** | has one of the five status tags | yes | dot + five-segment status ring |
| **External** | has `#external` | no | dashed satellite |
| **Unfiled** | none of the above, not a tag | no | warning dot |
| **Template** | in a template folder | excluded | — |

### 5.2 Status scale

`#raw → #3rd → #5th → #7th → #thesis` is the only lifecycle.
`#index` and `#external` are **types**, not stages. The UI should not put them on the same doneness scale.

### 5.3 Edge types

| Edge | From → To | Source | Drawn? |
|---|---|---|---|
| **contains** | tag → tag | `#index` note links to a tag | yes, solid |
| **related** | tag → tag | non-index tag link | yes, dashed |
| **member** | note → tag | `[[]]` in a content note | position, not a line |
| **inherited** | note → ancestor tag | computed after hierarchy | no; breadcrumb only |
| **annotates** | note → note | ordinary `[[]]` link | only in Focus |
| **cites** | note → external | link to an `#external` note | only in Focus |
| **curates** | index tag → note/tag | links inside the `#index` note | not drawn; used for anchor + coverage |

### 5.4 Anchor rule

1. Build the tag tree from `#index` links.
2. For each content note, collect its tag links.
3. Remove ancestor tags that are already implied by a linked descendant; keep them as **inherited**.
4. If a remaining tag is the subject of an `#index` note that lists this note, that tag becomes the **anchor** (deepest curated tag wins).
5. Otherwise, the first remaining direct tag in the note's tag order becomes the anchor.
6. All other remaining direct tags are **secondary ticks**. Inherited tags appear in the breadcrumb, not as ticks.

This rule uses the curation the user already does, and avoids letting raw note order choose a bad anchor. Example: `Compression of language` is curated by `Information Theory` even though `AI` appears first in its tag line.

**Home vs. linked.** The anchor is the note’s **home**. Every other direct tag is a **linked** membership. A note can be linked to several categories; it has one home.

**Re-anchor on focus.** Selecting or filtering a tag temporarily re-anchors its linked notes to that tag for the view. `Machine Learning` has `1 anchored / 2 linked`; focusing it shows `How to set up Pytorch` marked `home · Machine Learning`, alongside `Entropy` and `Compression of language` marked `home · Information Theory`. The global map does not change.

**Multiple `#index` parents.** If two index notes curate the same note, the deepest curated tag wins; ties break by the note’s own tag order. If no index curates it, the most specific direct index wins; if the only index is an inherited parent (collapsed because the note also links its child), that parent becomes home — e.g. `Machine Learning`, not `AI`. The inspector lists the other index as “also curated by”. No duplicate homes.

**Meta-tags.** The meta flag is a per-tag setting, not a property of the note or a new tag type. Defaults: `Obsidian`, `Zettelkasten`, `Take Note`, `Learning`. Any tag can be toggled. The flag only affects the 2+ bridge definition and the Bridges lens; home, counts, placement, filtering, and search are unchanged.

### 5.5 Counts and coverage

For each tag:

- `direct` — content notes that link to it directly (after ancestor collapse); `direct = anchored + linked`;
- `anchored` — notes whose global home is this tag;
- `linked` — notes that link here but home elsewhere;
- `branch` — unique notes in its subtree;
- `curated` — notes linked from its `#index` note;
- `unindexed` — direct members not in `curated`;
- `stale` — `curated` entries that are not direct members;
- `bridge` — notes with 2+ non-meta memberships; `span` is the membership count including the home;
- `status distribution` — counts of raw/3rd/5th/7th/thesis across the branch.

These counts power the index rail, the tag cards, the Bridges lens, and a **curation lens**. A note can be counted in more than one tag (Euler is in Calculus and Exponential); `branch` is unique, child counts can overlap.

---

## 6. View model

### 6.1 Tag Atlas (default)

A stable, deterministic map. Tag cards form the skeleton; content notes are small satellites around their anchor tag. The map does not re-arrange itself on every edit.

- **Far zoom:** tag cards + branch counts + status distribution bars; station counts hide but note labels remain as hover targets.
- **Counts:** active cards say `N anchored · M linked`; context labels use the compact `N +M`; ancestors such as Math say `7 in branch`.
- **Mid zoom:** note dots with status rings; labels on hover.
- **Near zoom / selection:** labels, secondary tag ticks, note-note annotations.
- **Unused tags:** collapsed tray at the edge.
- **Search:** dims unrelated branches but keeps the ancestor chain of every match visible.
- **Selection:** selecting a note opens the inspector and draws only that note's annotation edges.
- **Secondary tag focus:** selecting `Machine Learning` re-anchors its linked notes for the view; `How to set up Pytorch` shows `home · Machine Learning`, while `Entropy` and `Compression of language` show `home · Information Theory`. Clearing the focus restores the global home.

### 6.2 Index (tab)

A table/tree view for reading and searching:

- tag hierarchy rows with direct/branch counts and a status distribution bar;
- expand a tag to see notes grouped by status;
- sort by status, date, title, or path;
- show **curated** vs. **unindexed** vs. **stale**;
- selecting a row highlights it in the Atlas.

This is the "index" half of the product, not a separate app. Tags show a **home mark**; cross-category notes show their home tag first.

### 6.3 Bridges lens (tab)

A third table for notes with **2+ non-meta memberships**:

- grouped by `span` (5, 4, 3, 2 categories);
- columns: note, home, bridge tags, curation, edited;
- selecting a row opens the bridge inspector: home breadcrumb, bridge tags, curation, sequence links;
- this is the management surface for cross-category content notes, separate from the spatial map.

### 6.4 Focus (selection behavior)

When a note is selected:

- its tag breadcrumb and secondary tags are highlighted;
- its note-note links and backlinks appear with labels;
- external notes it cites appear as dashed satellites;
- everything else dims but remains as context.

### 6.5 Rough layout

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Tag Atlas        [ tag:Math status:#5th            ]   Atlas │ Index │ Bridges │
├────────────────┬─────────────────────────────────────────┬───────────────┤
│ INDEX          │                                         │ SELECTED      │
│ Math       7   │            ┌─────────┐                  │ Entropy       │
│  Calculus  4   │            │  Math   │                  │ #5th  ●●●○○   │
│  Info Th.  3   │            └────┬────┘                  │ path …        │
│  Exponential   │        ┌────────┴────────┐             │ tags …        │
│ AI         2   │   ┌────┴────┐       ┌────┴────┐        │ index …       │
│ …              │   │Calculus │       │Info Th. │        │ links …       │
│                │   └────┬────┘       └────┬────┘        │ [Open][Copy]  │
│ Unused (1)     │      ·  ·  ·            ·  ·           │               │
├────────────────┴─────────────────────────────────────────┴───────────────┤
│ #raw 2   #3rd 2   #5th 4   #7th 3   #thesis 3      15 notes · 27 tags    │
└──────────────────────────────────────────────────────────────────────────┘
```

The sketch is about **information architecture**, not skin. Panel widths, card shapes, and typography are still open.

---

## 7. Visual grammar

The detailed system is in [visual-system.md](visual-system.md). The short version:

- **Active tags are cards; context tags are label-only stations.** This is the main decluttering move.
- **Notes are five-segment status rings.** Color plus segment count, never color alone.
- **Membership is position; hierarchy is a stepped 90° wire; note-note links appear only on focus.**
- **Status is the only chromatic channel.** Panels, wires, and type stay neutral.
- **Light and dark are warm mid-tones**, not white and not black.
- **1px hairlines, 2px radii, no gradients, no drop shadows, no pills.**

The hidden kitchen layer is documented in [visual-system.md](visual-system.md#12-hidden-kitchen-layer).

---

## 8. Interaction and search

- `Ctrl+O` / `⌘O` / `/` opens the Quick switch search; the top bar has no filter field. `Esc` closes.
- Search syntax: free text plus `tag:`, `status:`, `kind:`, `path:`, `link:`, `is:index`, `is:external`, `is:unfiled`, `unindexed:true`, `stale:true`, `-` negation.
- Results preserve ancestor context; no orphaned matches.
- Click tag: select branch, expand index; double-click a tag selects/focuses it. Click note: select and inspect; double-click a note selects it.
- Selected note inspector:
  - title, kind, status badge with doneness ring;
  - path in quick-switcher form, e.g. `5. Zettelkasten/Entropy`, click to copy; hint "Ctrl+O → paste";
  - tag breadcrumb and secondary tags;
  - curated-by index note; unindexed/stale badges;
  - outgoing/backlink counts; external citations;
  - actions: **Open**, **Copy path**, **Copy wikilink**.
- Keyboard: arrows move selection; `Enter` opens; `C` copies path (proposal).

---

## 9. Chosen visual direction (v0.2)

**Quiet Atlas / editorial base + instrument-panel density.** Warm paper and warm charcoal; restrained serif titles; compact mono data; 1px hairlines; 2px radii; solid fills. Status is the only chromatic channel. The kitchen/steak idea is a hidden easter egg, not a visible theme.

Constraints accepted:

- No unnecessary blue gradients or glow.
- No excessive rounded corners; panels are square, controls are 2px.
- Light and dark are warm mid-tones, not white and not black.
- The kitchen layer is the last step: hidden behind `~` or the 7px footer mark.

Frames:

The historical design frames are kept local and are not committed: they were rendered against a private vault. The app itself is the current visual reference.

---

## 10. Standalone app scope

**Built:** [app/README.md](app/README.md) · `http://127.0.0.1:4173/`.

- Read-only browser app; real vault data via a generated JSON snapshot (later: File System Access API for live reads).
- Implements: Tag Atlas, Index tab, Bridges lens, Focus inspector, search/filter, path copy, optional `obsidian://` open link.
- Uses the visual tokens and component rules in [visual-system.md](visual-system.md).
- Does not implement: note editing, index rewriting, plugin packaging, mobile, 10k-node performance.
- **Success criteria:**
  - "What is in Math?" — one click.
  - "What is still raw?" — one filter.
  - "Where does Entropy sit?" — visible anchor + breadcrumb.
  - "What is tagged but unindexed?" — visible badge/lens.
  - "Open this note in Obsidian" — path is visible and copyable.
- After validation: port the model and layout to an Obsidian plugin.

---

## 11. Interaction layer (app v0.4 — force graph)

- The app fills the viewport: topbar and footer are fixed, the rail and inspector scroll internally, and the canvas is an **infinite force-directed tag graph** seeded around a 1600 × 1200 field, with no map edge or minimap.
- Tags receive deterministic seeds (roots on a wide ring, children beside parents); co-membership links are derived from notes that share tags. The force simulation then owns the layout.
- Defaults are the tuned settings: **Center 0.50**, **Repel 10.30**, **Link 0.68**, **Link distance 172**, **Cohesion 0.18**, exposed live in the **Forces** panel.
- Every tag node — focused or not — is draggable. While held, the node follows the pointer; on release it rejoins the force simulation. There is no pin feature. Double-click a tag selects/focuses it (double-click a note selects it); `Reset layout` reseeds positions.
- The focused tag becomes a card **at its graph position**. It is locked while focused; it is never teleported to a fixed center and other tags are never filtered out to make room.
- Selecting a branch descends into its tree without hiding the root: all ancestors/descendants stay on the graph and are marked; the tree edges are visible at all times.
- Focused branch notes become small note nodes with home edges. Overview zoom hides station counts (level of detail); note labels remain as hover targets, and hover/selection or zoom ≥112% restores counts.
- Clearing focus keeps the camera and graph. Clicking empty canvas deselects; the last tag stays as a full-name `LAST` station; the HUD offers `Return to <tag>`; Fit or Return restores the graph position.
- Tree edges are visible even when no tag is focused and route as hard stepped 90° traces with multiple corners. Each tag with an edge has one neutral rectangular port that slides around its box; every tree, note, and dotted edge touching that tag ends at its face. Shared-note co-membership is drawn as a faint dotted field with **no spring force** — it is annotation only. Note-tag membership is drawn from the note ring to the same tag port (solid) and to secondary tags (on hover/selection); notes are placed on a home orbit so they cannot push the index tree apart.
- The dot lattice and affinity edges use a higher contrast than the previous pass.
- Footer status keys are filters into the Index; counts and the unindexed flag are interactive.
- Motion is state-only: force ticks, camera fit, focus transitions, hover. No ambient motion.

Still not in this pass: collaborative persistence of node positions, pinch/touch gestures, live vault watching, or plugin packaging.

## 12. Open questions for the next round

- Should the meta flag be visible as a small marker on ambient stations, or live only in settings?
- The Bridges lens now toggles Span / Signature; is one of them the better default?
- Should the all-tags view start at 100% (current `focus=none`) or fit the world?
- Should the Forces panel be open by default, or remain behind the Forces button?
- Should note-note annotations be visible at close zoom by default, or only on selection?
- Do you want the standalone app to open notes via `obsidian://` links as well as showing the path?
- How much motion do you want? Current direction: state-only transitions, no ambient motion.

---

## 13. Next step

Review the force-graph app against the visual system and the semantic model. Collect feedback on the force feel, the level-of-detail rules, the focused-card/root treatment, node dragging, the Forces panel, the tag panel, the Index table, and the Bridges lens. Then port the model and layout to an Obsidian plugin. No note edits, no plugin code yet.
