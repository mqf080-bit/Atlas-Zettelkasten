/* Tag Atlas prototype — derived model (pure, no DOM) */

const STATUS_KEYS = ["raw", "3rd", "5th", "7th", "thesis"];

function uniq(values) {
  return [...new Set(values)];
}

export function buildModel({ vault, synthetic = null, demoOn = true, metaTags = [] }) {
  const useSynthetic = Boolean(demoOn && synthetic);
  const metaSet = new Set(metaTags || []);

  const rawTags = [
    ...(vault.tags || []).map((t) => ({ ...t, synthetic: false })),
    ...(useSynthetic ? (synthetic.tags || []).map((t) => ({ ...t, synthetic: true })) : []),
  ];
  const rawNotes = [
    ...(vault.notes || []).map((n) => ({ ...n, synthetic: false })),
    ...(useSynthetic ? (synthetic.notes || []).map((n) => ({ ...n, synthetic: true })) : []),
  ];

  const tags = new Map();
  for (const raw of rawTags) {
    const name = raw.name;
    if (!name || tags.has(name)) continue;
    tags.set(name, {
      name,
      path: raw.path || `synthetic/${name}`,
      isIndex: Boolean(raw.isIndex),
      synthetic: Boolean(raw.synthetic),
      body: raw.body || "",
      links: raw.links || raw.indexLinks || [],
      parent: null,
      parents: [],
      children: [],
      depth: 0,
      meta: metaSet.has(name),
    });
  }

  // Containment comes only from #index tag notes linking to other tag notes.
  for (const tag of tags.values()) {
    if (!tag.isIndex) continue;
    for (const link of tag.links) {
      if (link === tag.name || !tags.has(link)) continue;
      const child = tags.get(link);
      if (!child.parents.includes(tag.name)) child.parents.push(tag.name);
      if (!child.parent) child.parent = tag.name;
      if (!tag.children.includes(child.name)) tag.children.push(child.name);
    }
  }

  // Depth + cycle-safe ancestor chains.
  const ancestors = (name) => {
    const out = [];
    let cur = tags.get(name);
    const seen = new Set();
    while (cur && cur.parent && !seen.has(cur.parent)) {
      seen.add(cur.parent);
      out.push(cur.parent);
      cur = tags.get(cur.parent);
    }
    return out;
  };
  const assignDepth = (name, depth = 0) => {
    const tag = tags.get(name);
    if (!tag || tag.depth >= depth) return;
    tag.depth = depth;
    for (const child of tag.children) assignDepth(child, depth + 1);
  };
  for (const tag of tags.values()) if (!tag.parent) assignDepth(tag.name, 0);

  const notesByTitle = new Map();
  for (const raw of rawNotes) {
    if (!raw.title || notesByTitle.has(raw.title)) continue;
    notesByTitle.set(raw.title, {
      ...raw,
      synthetic: Boolean(raw.synthetic),
      declaredTags: raw.synthetic ? (raw.tags || []) : [],
      tags: [],
      inherited: [],
      allTags: [],
      home: null,
      linked: [],
      curatedBy: [],
      alsoCuratedBy: [],
      noteLinks: [],
      backlinks: [],
      bridge: false,
      span: 0,
      bridgeTags: [],
      kind: raw.isExternal || raw.kind === "external" ? "external" : raw.status ? "note" : (raw.kind || "unfiled"),
    });
  }

  const isDescendant = (ancestor, name) => ancestors(name).includes(ancestor);

  for (const note of notesByTitle.values()) {
    const rawTagList = note.synthetic
      ? (note.declaredTags || [])
      : (note.links || []).filter((l) => tags.has(l));
    const ordered = uniq(rawTagList.filter((t) => tags.has(t)));
    const inherited = [];
    const direct = [];
    for (const tagName of ordered) {
      const redundant = ordered.some(
        (other) => other !== tagName && isDescendant(tagName, other)
      );
      if (redundant) inherited.push(tagName);
      else direct.push(tagName);
    }
    note.tags = direct;
    note.inherited = uniq(inherited);
    note.allTags = uniq([...direct, ...note.inherited]);

    const curated = [];
    for (const tag of tags.values()) {
      if (tag.isIndex && tag.links.includes(note.title)) curated.push(tag.name);
    }
    note.curatedBy = uniq(curated);
    const curatedDirect = note.curatedBy.filter((t) => direct.includes(t));
    if (curatedDirect.length) {
      const ranked = [...curatedDirect].sort((a, b) => {
        const da = tags.get(a)?.depth || 0;
        const db = tags.get(b)?.depth || 0;
        if (db !== da) return db - da;
        return direct.indexOf(a) - direct.indexOf(b);
      });
      note.home = ranked[0];
    } else {
      // Otherwise prefer the most specific direct index (Calculus over Math).
      const directIndexes = direct
        .map((name) => tags.get(name))
        .filter((tag) => tag && tag.isIndex)
        .sort((a, b) => {
          if (b.depth !== a.depth) return b.depth - a.depth;
          return direct.indexOf(a.name) - direct.indexOf(b.name);
        });
      if (directIndexes.length) {
        note.home = directIndexes[0].name;
      } else {
        // If the note explicitly links an index parent as well as a non-index
        // child tag, ancestor collapse removes the parent from `direct`.
        // The broad index is still the intended home (Machine Learning, not AI).
        const inheritedIndexes = note.inherited
          .map((name) => tags.get(name))
          .filter((tag) => tag && tag.isIndex)
          .sort((a, b) => {
            if (a.depth !== b.depth) return a.depth - b.depth;
            return ordered.indexOf(a.name) - ordered.indexOf(b.name);
          });
        note.home = inheritedIndexes[0]?.name || direct[0] || null;
      }
    }
    note.alsoCuratedBy = note.curatedBy.filter((t) => t !== note.home);
    note.linked = direct.filter((t) => t !== note.home);

    const nonMetaDirect = direct.filter((t) => !tags.get(t)?.meta);
    note.bridge = nonMetaDirect.length >= 2;
    note.span = nonMetaDirect.length;
    note.bridgeTags = nonMetaDirect.filter((t) => t !== note.home);

    note.noteLinks = [];
    for (const title of note.links || []) {
      if (title === note.title) continue;
      if (notesByTitle.has(title)) note.noteLinks.push(title);
    }
  }

  // Backlinks.
  for (const note of notesByTitle.values()) {
    for (const target of note.noteLinks) {
      const other = notesByTitle.get(target);
      if (other && !other.backlinks.includes(note.title)) other.backlinks.push(note.title);
    }
  }

  // Tag statistics.
  for (const tag of tags.values()) {
    tag.directNotes = [];
    tag.anchoredNotes = [];
    tag.linkedNotes = [];
    tag.branchNotes = [];
    tag.branchSet = new Set();
    tag.curatedNotes = [];
    tag.curatedTags = [];
    tag.staleNotes = [];
    tag.unindexedNotes = [];
  }

  for (const note of notesByTitle.values()) {
    for (const tagName of note.tags) {
      const tag = tags.get(tagName);
      if (!tag) continue;
      tag.directNotes.push(note.title);
      if (note.home === tagName) tag.anchoredNotes.push(note.title);
      else tag.linkedNotes.push(note.title);
      // Branch membership includes every ancestor.
      let cur = tagName;
      const seen = new Set();
      while (cur && tags.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const t = tags.get(cur);
        if (!t.branchSet.has(note.title)) {
          t.branchSet.add(note.title);
          t.branchNotes.push(note.title);
        }
        cur = tags.get(cur).parent;
      }
    }
    // A home can be an inherited index parent (Machine Learning) that was
    // removed from `note.tags` by ancestor collapse. It still anchors the
    // note and must be counted as its home tag.
    if (note.home && !note.tags.includes(note.home)) {
      const homeTag = tags.get(note.home);
      if (homeTag) {
        homeTag.directNotes.push(note.title);
        homeTag.anchoredNotes.push(note.title);
      }
    }
  }

  for (const tag of tags.values()) {
    if (!tag.isIndex) continue;
    for (const link of tag.links) {
      if (tags.has(link)) {
        tag.curatedTags.push(link);
      } else if (notesByTitle.has(link)) {
        tag.curatedNotes.push(link);
      }
    }
    tag.curatedNotes = uniq(tag.curatedNotes);
    tag.staleNotes = tag.curatedNotes.filter((title) => !tag.directNotes.includes(title));
    const curatesNotes = tag.isIndex && (tag.curatedNotes.length > 0 || tag.children.length === 0);
    tag.unindexedNotes = curatesNotes
      ? tag.directNotes.filter((title) => !tag.curatedNotes.includes(title))
      : [];
  }

  for (const tag of tags.values()) {
    tag.anchoredCount = tag.anchoredNotes.length;
    tag.linkedCount = tag.linkedNotes.length;
    tag.directCount = tag.directNotes.length;
    tag.branchCount = tag.branchSet.size;
    tag.hasChildren = tag.children.length > 0;
    tag.displayCount = tag.hasChildren
      ? tag.branchCount
      : tag.anchoredCount + tag.linkedCount;
    tag.curatedCount = tag.curatedNotes.length;
    tag.unindexedCount = tag.unindexedNotes.length;
    tag.staleCount = tag.staleNotes.length;
    tag.dist = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
    for (const title of tag.branchNotes) {
      const n = notesByTitle.get(title);
      if (n?.status && n.kind !== "external" && tag.dist[n.status] != null) tag.dist[n.status] += 1;
    }
  }

  const notes = [...notesByTitle.values()];
  const tagList = [...tags.values()];
  const roots = tagList.filter((t) => !t.parent).sort((a, b) => a.name.localeCompare(b.name));
  const bridgeNotes = notes.filter((n) => n.bridge);
  const unfiledNotes = notes.filter((n) => !n.home && !n.status && n.kind !== "external");
  const externalNotes = notes.filter((n) => n.kind === "external");
  const stagedNotes = notes.filter((n) => n.status && n.kind !== "external");

  const statusCounts = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
  for (const note of stagedNotes) if (statusCounts[note.status] != null) statusCounts[note.status] += 1;

  const unindexedNoteSet = new Set();
  for (const tag of tagList) {
    for (const title of tag.unindexedNotes || []) unindexedNoteSet.add(title);
  }

  const sharedTagCounts = new Map();
  for (const note of bridgeNotes) {
    for (const tagName of note.tags) {
      if (tags.get(tagName)?.meta) continue;
      sharedTagCounts.set(tagName, (sharedTagCounts.get(tagName) || 0) + 1);
    }
  }
  const sharedTags = [...sharedTagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  return {
    vault: vault.vault || "vault",
    generatedAt: vault.generatedAt,
    syntheticOn: useSynthetic,
    tags: tagList,
    tagRoots: roots,
    notes,
    notesByTitle,
    tagsByName: tags,
    bridgeNotes,
    unfiledNotes,
    externalNotes,
    stagedNotes,
    statusCounts,
    counts: {
      notes: notes.length,
      staged: stagedNotes.length,
      unfiled: unfiledNotes.length,
      external: externalNotes.length,
      tags: tagList.length,
      indexes: tagList.filter((t) => t.isIndex).length,
      bridges: bridgeNotes.length,
      unindexedNotes: unindexedNoteSet.size,
      syntheticNotes: notes.filter((n) => n.synthetic).length,
      syntheticTags: tagList.filter((t) => t.synthetic).length,
    },
    sharedTags,
    metaTags: new Set(metaTags),
  };
}

export function tagSubtree(tag, allTags) {
  if (!tag) return [];
  const out = [];
  const walk = (name) => {
    const t = allTags instanceof Map ? allTags.get(name) : allTags.find((x) => x.name === name);
    if (!t) return;
    out.push(t);
    for (const child of t.children) walk(child);
  };
  walk(tag.name);
  return out;
}
