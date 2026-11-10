# Setup

## Requirements

- Python 3.10+
- A modern browser
- An Obsidian vault following [VAULT_CONVENTION.md](VAULT_CONVENTION.md)

No Node.js or build step is required.

## Clone and start

```bash
git clone https://github.com/mqf080-bit/Atlas-Zettelkasten.git
cd Atlas-Zettelkasten/app
./start.sh
```

`start.sh` starts `serve.py`, which:

- serves the app,
- rebuilds the snapshot when the vault changes,
- exposes a small local config API,
- opens the browser.

Use `./start.sh --no-open` on a headless machine.

## First run

The app asks:

> Where is your vault?

Enter the absolute path, for example:

```text
/home/you/Documents/my vault
```

The path is stored in `app/.atlas-config.json` (git-ignored). To re-run setup, stop the server and delete that file.

## Ports

The default is `4173`. If occupied, `start.sh` selects the next free port from 4174–4180 and prints the URL.

Manual server:

```bash
cd app
python3 serve.py --port 4173
```

## Live update

Keep `serve.py` running. It watches `.md` files under the configured vault and rebuilds `data/vault.json`. Open tabs poll every 1.8 seconds and re-render with a `Vault updated` toast.

Manual fallback:

```bash
python3 build_snapshot.py --vault "/absolute/path/to/vault"
```

Then hard-refresh.

## Stored state

| State | Where |
|---|---|
| Vault path | `.atlas-config.json` (server-side) |
| Theme | browser `localStorage` |
| Force values | browser `localStorage` |
| Bridges grouping | browser `localStorage` |
| Camera / node positions | in-memory; reset on reload |
| Generated snapshot | `data/vault.json` (git-ignored) |

## Shut down

Settings → **Shutdown server**, or stop the terminal running `start.sh`.

The API is local-only (`127.0.0.1`).

## Troubleshooting

### “That folder has no .md files”

Use the folder that directly contains the Markdown files, not its parent.

### Nothing updates

- Confirm `serve.py` is running.
- Check the terminal/log for watcher output.
- Make sure the edited note is under the configured vault and not in `.obsidian/`, `Template/`, or `Excalidraw/`.
- Hard-refresh once after upgrading.

### The page is blank / setup does not appear

Open the URL printed by `start.sh`, not an old static-server URL. The API server is required for setup, live update, and shutdown.

### Reset the app state

Delete `app/.atlas-config.json` to re-run vault setup. Clear site data / `localStorage` to reset theme and force preferences.
