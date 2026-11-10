#!/usr/bin/env python3
"""Build the read-only prototype snapshot from the Obsidian vault.

Writes: data/vault.json
The real vault is never modified.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_VAULT = HERE.parents[1] / "my first vault"
OUT = HERE / "data" / "vault.json"
VAULT = DEFAULT_VAULT

STATUSES = ("raw", "3rd", "5th", "7th", "thesis")
SKIP_DIRS = {".obsidian", "Template", "Excalidraw"}
LINK_RE = re.compile(r"\[\[([^\]|#]+)")
DATE_RE = re.compile(r"(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?")
STATUS_RE = re.compile(r"(?<![\w/])#(raw|3rd|5th|7th|thesis)\b")
INDEX_RE = re.compile(r"(?<![\w/])#index\b")
EXTERNAL_RE = re.compile(r"(?<![\w/])#external\b")


def excerpt(body: str, limit: int = 240) -> str:
    raw = body.strip()
    raw = re.sub(r"```.*?```", " ", raw, flags=re.S)
    raw = raw.replace("`", "")
    raw = re.sub(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]", r"\1", raw)
    raw = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", raw)
    for _ in range(6):
        before = raw
        raw = raw.lstrip()
        raw = re.sub(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}\s*", "", raw)
        raw = re.sub(r"^Date:\s*\d{4}-\d{2}-\d{2}\s*\n?", "", raw, flags=re.I)
        raw = re.sub(r"^Status:\s*[^\n]*\n?", "", raw, flags=re.I)
        raw = re.sub(r"^Tags:\s*[^\n]*\n?", "", raw, flags=re.I)
        if raw == before:
            break
    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        if re.match(r"^(Sequence of|Status:|Tags:|Date:)\b", line):
            continue
        lines.append(line)
    text = re.sub(r"\s+", " ", " ".join(lines)).strip()
    if not text:
        return ""
    # Prefer the first sentence; it reads better in the inspector.
    sentence = re.search(r"(?<=[.!?])\s+", text)
    if sentence and sentence.start() > 40:
        return text[: sentence.start() + 1]
    if len(text) <= limit:
        return text
    cut = text[:limit]
    last = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if last > 60:
        return cut[: last + 1]
    return cut.rsplit(" ", 1)[0] + "…"


def parse_note(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    rel = path.relative_to(VAULT).with_suffix("")
    rel_str = rel.as_posix()
    title = path.stem
    statuses = STATUS_RE.findall(text)
    status = statuses[0] if statuses else None
    is_index = bool(INDEX_RE.search(text))
    is_external = bool(EXTERNAL_RE.search(text))
    links = []
    seen = set()
    for raw in LINK_RE.findall(text):
        target = raw.strip()
        if target and target not in seen:
            seen.add(target)
            links.append(target)
    m = DATE_RE.search(text)
    date = m.group(1) if m else None
    body = text
    # Strip the header block for word count/excerpt, keep full body for search.
    header_cut = body.find("# References")
    core = body[:header_cut] if header_cut >= 0 else body
    words = len(re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", core))
    in_tag_folder = rel.parts and rel.parts[0] == "3. Tags"
    if in_tag_folder:
        kind = "tag"
    elif is_external:
        kind = "external"
    elif status:
        kind = "note"
    else:
        kind = "unfiled"
    return {
        "title": title,
        "path": rel_str,
        "kind": kind,
        "status": status,
        "isIndex": is_index,
        "isExternal": is_external,
        "links": links,
        "date": date,
        "body": body,
        "excerpt": excerpt(core),
        "words": words,
        "synthetic": False,
    }


def main() -> None:
    global VAULT
    parser = argparse.ArgumentParser(description="Build the read-only Tag Atlas snapshot")
    parser.add_argument("--vault", default=str(DEFAULT_VAULT))
    args = parser.parse_args()
    VAULT = Path(args.vault).expanduser().resolve()
    if not VAULT.is_dir():
        raise SystemExit(f"vault not found: {VAULT}")
    notes = []
    for path in sorted(VAULT.rglob("*.md")):
        rel = path.relative_to(VAULT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        notes.append(parse_note(path))

    tags = []
    for note in notes:
        if note["kind"] == "tag":
            tags.append(
                {
                    "name": note["title"],
                    "path": note["path"],
                    "isIndex": note["isIndex"],
                    "links": note["links"],
                    "body": note["body"],
                    "synthetic": False,
                }
            )
    content = [n for n in notes if n["kind"] != "tag"]

    snapshot = {
        "vault": VAULT.name,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "metaDefaults": ["Obsidian", "Zettelkasten", "Take Note", "Learning"],
        "tags": sorted(tags, key=lambda t: t["name"].lower()),
        "notes": sorted(content, key=lambda n: (n["kind"], n["title"].lower())),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Write atomically so a live-updating browser never reads a partial JSON.
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT)
    print(f"wrote {OUT} ({len(tags)} tags, {len(content)} content notes)")


if __name__ == "__main__":
    main()
