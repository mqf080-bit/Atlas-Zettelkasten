#!/usr/bin/env python3
"""Rebuild data/vault.json when the read-only Obsidian vault changes.

Run beside the static server:
    python3 watch.py

The browser polls the snapshot, so open tabs update without a manual reload.
The vault itself is never written.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
VAULT = HERE.parents[1] / "my first vault"
SKIP_DIRS = {".obsidian", "Template", "Excalidraw"}


def vault_signature() -> tuple[tuple[str, int, int], ...]:
    parts = []
    for path in sorted(VAULT.rglob("*.md")):
        rel = path.relative_to(VAULT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        parts.append((rel.as_posix(), stat.st_mtime_ns, stat.st_size))
    return tuple(parts)


def rebuild() -> None:
    print("rebuilding data/vault.json…", flush=True)
    try:
        result = subprocess.run(
            [sys.executable, "build_snapshot.py"],
            cwd=HERE,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        print(f"rebuild failed: {exc}", flush=True)
        return
    if result.returncode != 0:
        print(result.stdout.strip(), flush=True)
        print(result.stderr.strip(), flush=True)
        print("rebuild failed; the previous snapshot is still served.", flush=True)
    else:
        print(result.stdout.strip(), flush=True)


def main() -> None:
    if not VAULT.is_dir():
        raise SystemExit(f"vault not found: {VAULT}")
    print(f"watching {VAULT}", flush=True)
    rebuild()
    last = vault_signature()
    while True:
        time.sleep(0.8)
        current = vault_signature()
        if current == last:
            continue
        # Obsidian can save several files in a burst; let it settle.
        time.sleep(0.35)
        current = vault_signature()
        rebuild()
        last = current


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
