# Architecture

## Shape

Tag Atlas is a zero-build local web app:

```text
Obsidian vault (.md)
        │
        ▼
build_snapshot.py  ──►  data/vault.json
        ▲                     │
        │                     ▼
serve.py (watcher/API)   app.js + model.js + layout.js + render.js
        │                     │
        └──── static files ───┘
```

- **Python** builds the read-only snapshot and serves the app.
- **Vanilla ES modules** own the model, force layout, rendering, and interactions.
- **No bundler, no framework, no network services.**

## Modules

| File | Responsibility |
|---|---|
| `app.js` | App state, views, force simulation, drag/pan/zoom, hover, search, setup, live polling |
| `model.js` | Tag tree, ancestor collapse, home/linked counts, curation, bridges |
| `layout.js` | Deterministic seeds, world size, force defaults |
| `render.js` | SVG rings, status bars, badges, escaping |
| `styles.css` | Design tokens and base components |
| `app.css` | App layout, canvas, rail, inspector, setup, responsive rules |
| `build_snapshot.py` | Markdown scan → `data/vault.json` |
| `serve.py` | Static server, config API, watcher, shutdown |
| `watch.py` | Standalone watcher (optional; `serve.py` has one built in) |

## Snapshot

`data/vault.json` is generated and git-ignored. It contains:

```json
{
  "vault": "vault name",
  "generatedAt": "ISO timestamp",
  "metaDefaults": ["Obsidian", "..."],
  "tags": [{"name": "...", "path": "3. Tags/...", "isIndex": true, "links": []}],
  "notes": [{"title": "...", "path": "...", "kind": "note", "status": "5th", "links": []}]
}
```

Notes are read-only inputs. The app writes only its own local config and snapshot.

## Home algorithm

1. Deepest index curating the note.
2. Most specific direct index.
3. Shallowest inherited index parent.
4. First remaining direct tag.

Ancestor collapse removes a parent from direct memberships when the note also links its child. External notes are a source type (`kind: "external"`), excluded from maturity counts and presented with the pink external ring/group. Full semantics: [VAULT_CONVENTION.md](VAULT_CONVENTION.md).

## Force layout

Defaults:

```text
center 0.50 · repel 10.30 · link 0.68 · distance 172 · cohesion 0.18
```

- Deterministic hierarchy-aware seeds, then a lightweight custom simulation.
- Index-tree springs define the structure; note-home links are local; shared-note dotted links carry **zero spring force**.
- There is no persistent pin. A focused tag is `focusLocked` while focused; dragged nodes are held only during the gesture.
- During focus, relevant tags/notes get a higher collision/spring priority and z-index; unrelated tags are weak and sit below. Clearing focus removes the priority and runs a dedicated collision-spread pass.
- The canvas is unbounded, with an infinite CSS dot grid and no minimap.
- Tag ports are rectangular, one per tag, and all incident edges terminate on the port face.
- Tag box metrics are observed with `ResizeObserver`, so ports stay attached as stations expand on hover/LOD.

## Local API

`serve.py` binds to `127.0.0.1` only.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | server state, configured vault, default path |
| POST | `/api/config` | validate + store vault path, rebuild snapshot |
| POST | `/api/shutdown` | stop server and watcher |

The API is deliberately minimal. There is no authentication because it is a local single-user service.

## Live update

1. Watcher detects vault file changes.
2. `build_snapshot.py` writes atomically to `data/vault.json`.
3. Open tabs poll `data/vault.json` every 1.8s.
4. When JSON changes, the model is rebuilt and the current view re-renders.

## Why not an Obsidian plugin yet?

The model and layout layers are portable, but the app shell, infinite canvas, pointer/drag layer, port routing, and inspector would need a substantial plugin-view rewrite. The standalone app remains the usable target unless that rewrite is justified.
