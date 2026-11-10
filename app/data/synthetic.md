# Synthetic fixture — Tag Atlas prototype

`synthetic.json` is hand-built test data, not vault content. Style terms (status ladder, `#index`, tag-note shape, note voice) are copied from `../../my first vault/`, which was only ever read.

12 tags, 6 notes, 5 bridges, 1 empty tag, 1 deliberately unindexed note.

## Tags

| Tag | isIndex | Curates (indexLinks) | Notes tagged | meta |
|---|---|---|---|---|
| Cooking | yes | Cooking as compression, Sourdough starter log | 2 | false |
| Climate | yes | Climate models and entropy | 2 | false |
| Ethics | yes | Ethics of recommender systems | 1 | false |
| Rust | no | — | 1 | false |
| Statistics | no | — | 0 | false |
| AI | no | — | 2 | false |
| Information Theory | no | — | 2 | false |
| Language | no | — | 1 | false |
| Left | no | — | 1 | false |
| Machine Learning | no | — | 1 | false |
| Politics | no | — | 2 | false |
| Python | no | — | 1 | false |

`Statistics` is the cold-start case: no notes, no links, must render as an empty tag note rather than disappear. `Rust` is a non-index tag with a single note and no curation.

**Meta:** no tag in the fixture has `meta: true`. The vault's four meta-tags (`Take Note`, `Learning`, `Obsidian`, `Zettelkasten`) are intentionally absent, so every membership below counts. To exercise meta exclusion, toggle a flag by hand in the inspector.

## Notes

| Title | status | tags | note links | date | home | curated? |
|---|---|---|---|---|---|---|
| Cooking as compression | 7th | Cooking, Information Theory, Language | Compression of language | 2026-11-02 | Cooking | yes |
| Sourdough starter log | raw | Cooking | — | 2026-10-28 | Cooking | yes |
| Climate models and entropy | thesis | Climate, Information Theory, Machine Learning | Entropy | 2026-10-19 | Climate | yes |
| Climate policy reading | raw | Climate, Politics, Left | — | 2026-11-04 | Climate | **no — fallback** |
| Rust for data pipelines | 3rd | Rust, Python, AI | — | 2026-11-06 | Rust | **no — Rust is not an index** |
| Ethics of recommender systems | thesis | Ethics, AI, Politics | 3 International Politics Critique | 2026-10-30 | Ethics | yes |

All three indexes are depth 1 (no index curates another tag), so "deepest curating index" never has to break a tie here.

## Home expectations

1. **Cooking as compression → Cooking.** Curated by the Cooking index.
2. **Sourdough starter log → Cooking.** Curated by the Cooking index.
3. **Climate models and entropy → Climate.** Curated by the Climate index.
4. **Climate policy reading → Climate.** Not in any `indexLinks`; home comes from the first tag rule. This is the important case: it is **tagged** Climate but **not curated** by it, so it counts as anchored in Climate while appearing nowhere in Climate's curation list.
5. **Rust for data pipelines → Rust.** Rust is not an index and no index curates the note; first tag wins.
6. **Ethics of recommender systems → Ethics.** Curated by the Ethics index.

Because Climate's home count includes a fallback note, `anchored = 2` while `indexLinks.length = 1`. Do not render the index-rail count from the link list alone.

## Expected bridges (2+ non-meta memberships)

| Bridge note | span | home | memberships |
|---|---|---|---|
| Cooking as compression | 3 | Cooking | Cooking, Information Theory, Language |
| Climate models and entropy | 3 | Climate | Climate, Information Theory, Machine Learning |
| Climate policy reading | 3 | Climate | Climate, Politics, Left |
| Rust for data pipelines | 3 | Rust | Rust, Python, AI |
| Ethics of recommender systems | 3 | Ethics | Ethics, AI, Politics |

Excluded: **Sourdough starter log** (span 1, Cooking only). Expected bridge count: **5 of 6 notes**.

## Other counts worth asserting

- Anchored: Cooking 2, Climate 2, Ethics 1, Rust 1, Statistics 0.
- Linked-only (home elsewhere): Information Theory 2, Politics 2, AI 2, Language 1, Left 1, Machine Learning 1, Python 1, Statistics 0, Rust 0.
- `Information Theory` is the secondary-tag-focus case: 0 anchored, 2 linked, both homes visible (`Cooking as compression` → Cooking, `Climate models and entropy` → Climate).
- Sequential/status mix: one `raw`-only pair, two `thesis` notes, one each of `7th` and `3rd`; no `5th` note in the fixture.
- Dates are ISO `YYYY-MM-DD`, no time component, and are non-monotonic relative to list order (newest is 2026-11-06).

## Dangling note links (expected)

The three note-to-note links point at real vault titles that are **not** part of this fixture: `Compression of language`, `Entropy`, `3 International Politics Critique`. They are left verbatim on purpose — the app resolves them by title, and adding stub notes would change the tag sets and bridge count. In an offline render they should show as unresolved chips, not errors.
