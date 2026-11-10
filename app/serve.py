#!/usr/bin/env python3
"""Tag Atlas local server: static files, vault config, watcher, and shutdown API.

Run:
    python3 serve.py --port 4174

The API is local-only. It never writes the vault.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
DEFAULT_VAULT = HERE.parents[1] / "my first vault"
CONFIG = HERE / ".atlas-config.json"
SKIP_DIRS = {".obsidian", "Template", "Excalidraw"}
SNAPSHOT = HERE / "data" / "vault.json"


def vault_signature(vault: Path | None) -> tuple:
    if not vault or not vault.is_dir():
        return ()
    parts = []
    for path in sorted(vault.rglob("*.md")):
        rel = path.relative_to(vault)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        parts.append((rel.as_posix(), st.st_mtime_ns, st.st_size))
    return tuple(parts)


def valid_vault(path: Path) -> bool:
    return path.is_dir() and any(path.rglob("*.md"))


class State:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.server: ThreadingHTTPServer | None = None
        self.vault: Path | None = None
        self.load()

    def load(self) -> None:
        if not CONFIG.is_file():
            return
        try:
            data = json.loads(CONFIG.read_text(encoding="utf-8"))
            path = Path(data.get("vaultPath", "")).expanduser().resolve()
            if valid_vault(path):
                self.vault = path
        except Exception:
            self.vault = None

    def save(self, path: Path) -> None:
        CONFIG.write_text(
            json.dumps({"vaultPath": str(path)}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def build(self) -> tuple[bool, str]:
        if not self.vault:
            return False, "No vault configured."
        try:
            result = subprocess.run(
                [sys.executable, "build_snapshot.py", "--vault", str(self.vault)],
                cwd=HERE,
                text=True,
                capture_output=True,
                check=False,
            )
        except OSError as exc:
            return False, str(exc)
        output = (result.stdout + "\n" + result.stderr).strip()
        if result.returncode != 0:
            return False, output or "Snapshot build failed."
        return True, output

    def health(self) -> dict:
        with self.lock:
            configured = bool(self.vault and valid_vault(self.vault))
            return {
                "ok": True,
                "configured": configured,
                "vaultPath": str(self.vault) if configured else "",
                "defaultVault": str(DEFAULT_VAULT),
                "hasSnapshot": SNAPSHOT.is_file(),
                "pid": os.getpid(),
            }


STATE = State()


def watcher() -> None:
    last = None
    last_vault = None
    while not STATE.stop.wait(0.8):
        vault = STATE.vault
        if not vault:
            last = None
            last_vault = None
            continue
        if vault != last_vault:
            last_vault = vault
            last = None
        sig = vault_signature(vault)
        if sig == last:
            continue
        time.sleep(0.3)
        ok, output = STATE.build()
        print(("[watch] " + output.replace("\n", " | ")) if ok else ("[watch] " + output), flush=True)
        last = vault_signature(vault)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        if str(args[0] if args else "").startswith("GET /data/"):
            return
        super().log_message(fmt, *args)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        route = urlparse(self.path).path
        if route == "/.atlas-config.json" or route.startswith("/.run/"):
            self.send_error(404)
            return
        if route == "/api/health":
            self.json(200, STATE.health())
            return
        if route == "/api/config":
            self.json(200, STATE.health())
            return
        super().do_GET()

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        if route == "/api/config":
            length = int(self.headers.get("Content-Length", "0") or 0)
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                self.json(400, {"ok": False, "error": "Invalid JSON."})
                return
            raw = str(payload.get("vaultPath", "")).strip()
            path = Path(raw).expanduser()
            if not path.is_absolute():
                path = (HERE / path).resolve()
            else:
                path = path.resolve()
            if not valid_vault(path):
                self.json(400, {"ok": False, "error": "That folder has no .md files."})
                return
            old = STATE.vault
            with STATE.lock:
                STATE.vault = path
            ok, output = STATE.build()
            if not ok:
                with STATE.lock:
                    STATE.vault = old
                self.json(500, {"ok": False, "error": output})
                return
            STATE.save(path)
            self.json(200, {"ok": True, "vaultPath": str(path), "output": output})
            return
        if route == "/api/shutdown":
            self.json(200, {"ok": True, "message": "Stopping."})
            threading.Thread(target=shutdown, daemon=True).start()
            return
        self.json(404, {"ok": False, "error": "Not found."})

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()


def shutdown() -> None:
    STATE.stop.set()
    time.sleep(0.15)
    if STATE.server:
        STATE.server.shutdown()
    time.sleep(0.15)
    os._exit(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    if STATE.vault:
        ok, output = STATE.build()
        print(("[start] " + output.replace("\n", " | ")) if ok else ("[start] " + output), flush=True)
    threading.Thread(target=watcher, daemon=True).start()

    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as exc:
        raise SystemExit(f"port {args.port} unavailable: {exc}")
    STATE.server = server
    print(f"Tag Atlas: http://127.0.0.1:{args.port}/", flush=True)
    print(f"Vault: {STATE.vault if STATE.vault else 'not configured (first-open setup)'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STATE.stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
