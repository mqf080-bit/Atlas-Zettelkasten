# Vault convention

Tag Atlas is deliberately strict about a small set of conventions. It reads **wikilinks and status markers** from Markdown; it does not depend on frontmatter.

## Folder layout

```text
my vault/
  3. Tags/
    Math.md                 # #index
    Calculus.md             # #index
    Information Theory.md
    Machine Learning.md     # #index
    AI.md
  5. Zettelkasten/
    Entropy.md
    How to set up Pytorch.md
```

- Tag notes live under **`3. Tags/`**. No other folder is treated as tag notes.
- Content notes may live anywhere else.
- `.obsidian/`, `Template/`, and `Excalidraw/` are skipped.
- Only `.md` files are read.

## Tag notes

A tag note is a normal note that other notes link to as a category:

```markdown
Status: #index

Tags:
[[Calculus]]
[[Information Theory]]
[[Exponential]]
```

- `#index` is a **type**, not a lifecycle status. It marks a tag note that curates other tags and/or notes.
- An `#index` tag note can link:
  - **child tag notes** — this creates the tag tree,
  - **content notes** — this curates them.
- A tag note without `#index` is a leaf category.
- `#external` is also a type, not a lifecycle stage.

## Content notes

A content note declares its memberships by linking tag notes:

```markdown
Status: #5th

Tags:
[[Machine Learning]]
[[AI]]
[[Python]]
[[Pytorch]]
```

The order of the tags matters only as a tie-breaker. The first valid tag is not automatically the home; see below.

## Lifecycle statuses

Use exactly one of:

```text
#raw  #3rd  #5th  #7th  #thesis
```

- They form a five-stage lifecycle.
- They are read from the note text, not frontmatter.
- The graph uses five-segment status rings and the status bar in the inspector.
- Do not invent new lifecycle markers without updating the model and palette.

`#index` and `#external` are **types**, not lifecycle stages, and do not replace a status.

## External sources (`#external`)

Paste an external source into a note and mark it:

```markdown
Status: #external

Tags:
[[Politics]]
[[International]]
```

- `#external` means **source type**, not maturity. It deliberately has **no stage / 5**.
- It renders as the pink external ring and gets its own **EXTERNAL** Index group.
- External notes are excluded from:
  - lifecycle counts and status sparklines,
  - “unsorted” / unfiled counts.
- External notes still participate in tag memberships, anchoring, curation, and bridges when they link tags.
- If an external note accidentally also contains `#raw`/`#5th`/etc., the type still wins for presentation; external is not treated as a maturity stage.
- Use the footer **N external** filter or `is:external` in search to find them.

## Index semantics

An `#index` note is a curator.

```markdown
Status: #index

Tags:
[[Calculus]]
[[Information Theory]]
[[Exponential]]
```

- Index → tag links define **containment**.
- Index → note links define **curation**.
- If an index has child tags, it is a **branch** index; if it has no children, it can curate notes directly.
- For a direct note membership, curation is reported as:
  - **Curated** — the index lists the note,
  - **Unindexed** — the note links the tag but the index does not list it,
  - **Stale** — the index lists a note that does not link the tag.

An index can curate both child tags and notes.

## Home, inherited tags, and direct tags

A note has exactly one **home**. The viewer computes it in this order:

1. **Deepest index that curates the note.**
2. If no index curates it, the **most specific direct index** the note links.
3. If no direct index exists, the **shallowest inherited index parent** that the note explicitly links.
4. Otherwise, the first remaining direct tag.

Tie-breaks use the note's tag order.

### Ancestor collapse

If a note links both a parent tag and a child tag, the parent is **inherited**, not direct:

```text
[[Machine Learning]]   -> inherited (AI is a child)
[[AI]]                 -> direct
```

This prevents double-counting a note in a parent and its child. The parent still appears in the branch and in the breadcrumb.

### Example

`How to set up Pytorch` links:

```text
[[Machine Learning]] [[AI]] [[Python]] [[Pytorch]]
```

`AI` is a child of `Machine Learning`, so:

- `Machine Learning` = inherited index parent
- `AI`, `Python`, `Pytorch` = direct tags
- home = **Machine Learning**
- `Machine Learning` = 1 anchored / 2 linked
- `AI` = 0 anchored / 4 linked

## Counts

- **Anchored** — notes whose global home is this tag.
- **Linked** — notes that link this tag but have a home elsewhere.
- **Direct** — anchored + linked.
- **Branch** — unique notes in this tag and all descendants.

## Bridges

A **bridge** is a content note with **2+ non-meta direct memberships** after ancestor collapse.

- `span` is the number of non-meta direct memberships.
- `bridgeTags` excludes the note's home.
- Meta tags affect bridge detection only.

Default meta tags:

```text
Obsidian · Zettelkasten · Take Note · Learning
```

They can be toggled per view in Settings. They are not written to the vault.

## What Tag Atlas does not require

- No frontmatter, YAML, or `tags:` property.
- No special file names beyond tag notes living in `3. Tags/`.
- No index rewrite or note editing.
- No synthetic data in the vault.

## Rules of thumb

1. Create a tag note before linking to it.
2. Use `#index` when a tag note curates children or notes.
3. Link both parent and child tags when the hierarchy is real; the viewer collapses the parent deliberately.
4. Keep indexes honest; the viewer surfaces unindexed and stale links rather than hiding them.
5. Do not rename tag notes without updating their wikilinks.
6. Keep one lifecycle status per content note.
7. Never put synthetic/demo notes into the real vault.
