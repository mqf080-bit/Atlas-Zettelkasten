# Tag Atlas

A local, read-only browser app for the Tag Atlas design. The real vault is **never written to**.

**Open:** the URL printed by `./start.sh` (normally `http://127.0.0.1:4173/`; `start.sh` falls back only if the port is occupied).

Quick start from this directory:

```bash
./start.sh
```

That starts the local API server (`serve.py`) with the vault watcher and opens the browser. The first run asks for the vault directory; the path is stored in `.atlas-config.json`. Theme and force settings persist in browser storage. It is safe to run again: it reuses a running API server. Use `./start.sh --no-open` on a headless machine.

Settings → **Shutdown server** stops the local server.

Manual equivalent:

```bash
python3 serve.py --port 4173
python3 watch.py          # optional standalone watcher
```

## What is implemented

- **Atlas** — a viewport-filling, pannable / zoomable **force-directed tag graph**. Every tag is a draggable node, linked by `#index` containment and by note co-membership; positions seed deterministically and are then owned by the physics simulation. The focused tag becomes a card **at its graph position**; every tag stays on the table, including the roots of the focused branch. Focused branch notes become small note nodes with home edges. There is no pin feature: a dragged node follows the pointer while held, then rejoins the force simulation on release. `Reset layout` reseeds positions. Double-clicking a tag selects/focuses it; double-clicking a note selects it.
- **Force settings** — `Center force 0.50`, `Repel force 10.30`, `Link force 0.68`, `Link distance 172`, `Cohesion 0.18` by default, exposed in the **Forces** panel and live-editable. The panel has a Reset layout action.
- **Level of detail** — at overview zoom, station counts are hidden to keep the graph legible; they return on hover or zoom ≥ 112%. Note labels stay visible so the text itself is a hover target. Tag names, size classes, status bars, 1px station outlines, tree/home edges, and the graph legend remain visible.
- **Clear graph grammar** — square glyph = tag, ring = content note. Every tag with an edge carries one neutral rectangular port that slides around its box; all tree, note, and shared-note lines end at its face. Solid index-tree lines are stepped 90° traces with many corners. Note-home lines run from the note ring to the same port; secondary memberships appear as `note link` on hover/selection. Shared-note edges are faint dotted lines with **zero spring force**.
- **External** — `#external` is a source type, not a maturity stage; pink ring, dedicated Index group, excluded from unsorted/lifecycle counts.
- **Index** — all notes grouped by status and external source type; home / tags; curation (`CURATED` / `UNINDEXED`); paths; selected-note inspector; tag branch filtering.
- **Bridges** — cross-category notes with 2+ non-meta memberships; grouped by **Span** or **Signature**; home, bridge tags, curation, date; curation gap and shared tags.
- **Inspector** — note or focused tag; counts, anchored/linked lists, index coverage, bridge span, note links/backlinks, quick-switcher path, Open note, Copy path, Copy wikilink. The focused-tag **Mark as meta / Open in Obsidian / Open in Index / Clear focus** actions sit in a sticky bottom dock; **Open in Obsidian** opens the tag note (including its `#index` contents) in the vault; the in-branch list scrolls at 260px and can be collapsed by its caret.
- **Quick switch** — `Ctrl+O` / `⌘O` / `/`, or the compact topbar `Search` trigger, opens an Obsidian-style search over tag notes and content notes. The topbar has no filter field. Results are shown by vault path, ranked by title/path match, with `TAG` / `NOTE` and `SYNTH` badges; `↑` / `↓` navigate, `↵` selects, `Esc` closes.
- **Meta-tag settings** — per-tag, view-only; defaults `Obsidian`, `Zettelkasten`, `Take Note`, `Learning`; affects only bridge detection / the Bridges lens.
- **Synthetic demo layer** — 6 notes + 5 new tags (plus references to real tags), marked `SYNTH` / dashed; off by default; one click loads it.
- **Default landing** — clean vault, no focused tag, no selected note, all tags on the atlas. The rail starts fully expanded; tags with children collapse with the caret, and that state survives focus changes.
- **Focus hierarchy** — while a tag is focused, its ancestors/descendants and branch notes render above unrelated tags. Relevant↔irrelevant pairs are excluded from repulsion/springs/collision, so they can pass over each other. Clearing focus restores full collision and runs a multi-pass spread.
- **Interaction** — a tap or double-tap selects; drag any tag or note after 8px to move it while held. On release it rejoins the simulation. There is no pin state. The focused tag is focus-locked under physics. Drag empty canvas to pan without bounds; wheel / `+` / `−` to zoom; `F` to fit the graph; `0` to reset zoom. There is no minimap. Click empty canvas to deselect; click a tag to focus; click a note to select. Hover shows tooltips and relationship dimming; last-focus return and footer filters are interactive. The focus HUD collapses with `−`.
- **Theme** — light / dark; warm paper and warm charcoal. Theme, force values, and Bridges grouping persist in browser localStorage. Hover fills are translucent; active/selected fills stay solid.

## URL parameters

| Parameter | Values | Meaning |
|---|---|---|
| `view` | `atlas`, `index`, `bridges` | initial view |
| `focus` | a tag name, or `none` | initial focused tag; `none` starts on the all-tags map; quote names with spaces in the Quick switch |
| `last` | a tag name | last-focus station/return target when `focus=none` |
| `note` | a note title; empty for none | initial selected note |
| `query` | a filter string | initial search/filter |
| `theme` | `light`, `dark` | theme |
| `demo` | `0`, `1` | synthetic layer off/on |
| `meta` | comma-separated tag names | custom meta-tag set for testing |
| `settings` | `1` | open Meta-tags settings |
| `group` | `span`, `signature` | Bridges grouping |
| `x`, `y`, `zoom` | numbers | initial camera position / zoom |
| `forces` | `1` | open the Forces panel |
| `quick` | `1` | open the Quick switch |
| `q` | text | initial Quick switch query |
| `center`, `repel`, `link`, `distance` | numbers | override force defaults |

Examples:

- `/?view=atlas&focus=Math&note=Entropy&theme=light`
- `/?view=atlas&focus=AI&note=&theme=light` — re-anchored cross-category leaf
- `/?view=atlas&focus=Climate&note=&theme=light` — synthetic tag focus
- `/?view=index&theme=light`
- `/?view=bridges&group=signature&theme=light`
- `/?demo=1` — load the synthetic demo layer (default is clean)
- `/?demo=0` — force clean, real-vault-only state
- `/?view=atlas&focus=Math&note=&settings=1&theme=light` — meta-tag settings
- `/?view=atlas&focus=Math&x=-40&y=80&zoom=0.95` — a saved camera position
- `/?view=atlas&focus=Math&forces=1&theme=light` — open Forces
- `/?view=atlas&quick=1&q=a` — Quick switch for “a”
- `/?view=atlas&focus=Math&center=0.8&repel=12&link=1.2&distance=160` — force override
- `/?view=atlas&focus=none&last=Math&theme=light` — the all-tags map with Math as `LAST`

## Keyboard and canvas

- Drag background: pan.
- Wheel / `+` / `−`: zoom around the cursor / viewport center.
- `F`: fit the graph.
- `0`: reset to 100%.
- Drag any **tag or note node**: it follows the pointer while held; on release the force simulation takes it again.
- Double-click a tag to select/focus it; use **Reset layout** to reseed positions.
- The `−` / `+` at the top-right of the focus panel collapses/expands it so the map tags behind it are visible.
- `Ctrl+O` / `⌘O` or `/`: open Quick switch; `↑` / `↓` navigate, `↵` select, `Esc` close.
- `Esc`: clear selection, then focus (outside Quick switch).

The footer status keys are filters: clicking one opens the Index filtered to that status; clicking it again clears the filter.

## Force layout

The graph is not positioned by a fixed table. Tags receive deterministic seeds (roots on a wide ring, children beside parents), notes receive seeds around their home tag, and the simulation then applies:

- center attraction to the world center;
- inverse-square repulsion between nodes;
- annotation-only dotted links for note co-membership (no spring), alongside strong containment links;
- AABB collision resolution for the card/label boxes;
- the focused card (locked in place while focused).

The five slider values map directly to the settings exposed in the Forces panel. `Reset layout` clears positions and reseeds.

## Data

- `build_snapshot.py` reads `../../my first vault` and writes `data/vault.json`.
  Rerun it after vault edits, or run `python3 watch.py` to rebuild automatically. `watch.py` does not write the vault.
- `data/synthetic.json` is a **separate demo fixture**. `data/synthetic.md` is the subagent's verification sheet.
- The real vault is opened read-only. Synthetic content exists only in the app.
- The fixture's real tag references (`AI`, `Information Theory`, `Language`, `Left`, `Machine Learning`, `Politics`, `Python`) are ignored as duplicates at merge time; the real tags win.

## Demo layer

It is **off by default**.

1. Click the **Demo** button in the top bar to load or remove it.
2. `/?demo=1` loads it; `/?demo=0` forces clean (the default).

The fixture remains on disk so the demo can be reloaded. To remove it permanently, delete `data/synthetic.json` and `data/synthetic.md` (the `synthetic` branch of the app then disappears). No vault note is touched either way.

## Known limitations

- Viewport-filling app; the canvas is unbounded with an infinite dot grid and pan/zoom, seeded around a 1600 × 1200 field. No minimap; no map edge. On narrow screens the rail or inspector may collapse by CSS.
- Force layouts are inherently imperfect for 30+ labeled nodes. Station counts are hidden at overview zoom (level of detail); hover or zoom in. The Forces panel is the tuning surface.
- Shared-note edges are drawn as faint dotted links. They carry **no spring force**; only index-tree, note-home, and light note-link springs move tags; shared-note links never do. Notes orbit their home tag, so with many shared notes the dotted field can still be visually dense but cannot cluster the graph.
- The simulation is deterministic-seeded, not collaborative/persistent across reloads; camera and node positions reset on reload.
- Co-membership edges are computed from direct tag memberships; they are not weighted by note status.
- Live update needs `python3 watch.py` running alongside the static server. Without it, reload after `build_snapshot.py`.
- No note editing, no merging, no plugin packaging.
- Search is the Quick switch only; path/title ranked, with no fuzzy body search and no saved queries.
- Synthetic notes open only via Copy path (there is no file in the vault).
- The Meta-tag setting is view-only; it is not persisted between page reloads unless encoded in the URL.
- No pinch zoom or touch-specific canvas gestures; pointer drag works, but the layout is desktop-first.

## Files

- `index.html` — app shell.
- `app.js` — state, views, event handling.
- `model.js` — tag tree, ancestor collapse, home/link, curation, bridge derivation.
- `layout.js` — world size, force defaults, deterministic seeds, node sizes.
- `render.js` — rings, bars, badges, escaping.
- `styles.css` — design tokens/components (copied from the design mockups).
- `app.css` — app layout/interaction additions.
- `data/vault.json` — generated snapshot.
- `data/synthetic.json` / `synthetic.md` — demo fixture.
- `build_snapshot.py` — snapshot generator.
- `watch.py` — watches the vault and regenerates the snapshot; open tabs poll and re-render.
- `start.sh` — one-command server + watcher + browser launcher.
- `serve.py` — local server/API: first-run vault config, watcher, static files, shutdown.
- `.atlas-config.json` — stored vault path (created on first run).
- `logo.svg` / `logo-192.png` — Atlas mark and favicon.
- `screens/` — curated screenshots of the current app (kept local; not committed because they show a private vault).
