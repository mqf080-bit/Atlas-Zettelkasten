/* Tag Atlas prototype — interactive three-view app */

import { buildModel, tagSubtree } from "./model.js";
import {
  WORLD,
  FORCE_DEFAULTS,
  seedForTag,
  seedForNote,
  hashString,
  tagNodeSize,
  noteNodeSize,
} from "./layout.js";
import {
  esc,
  fmtDate,
  ringSVG,
  barSegments,
  externalColor,
  statusLabel,
  statusStage,
  synthBadge,
  synthMark,
  chevronDown,
  homeMark,
  noteHomeHtml,
  tagParents,
} from "./render.js";

const app = document.getElementById("app");
const mainEl = document.getElementById("main");
const railListEl = document.getElementById("rail-list");
const inspectorEl = document.getElementById("inspector");
const footerEl = document.getElementById("footer");
const settingsEl = document.getElementById("settings-pop");
const toastEl = document.getElementById("toast");
const demoBtn = document.getElementById("demo-btn");
const quickEl = document.getElementById("quick-switch");
const quickInput = document.getElementById("quick-input");
const quickResultsEl = document.getElementById("quick-results");
const quickCountEl = document.getElementById("quick-count");
const setupEl = document.getElementById("setup");
const setupForm = document.getElementById("setup-form");
const setupPath = document.getElementById("setup-path");
const setupError = document.getElementById("setup-error");
const setupSubmit = document.getElementById("setup-submit");

let vault = null;
let synthetic = null;
let model = null;
let toastTimer = null;
let tagResizeObserver = null;

const state = {
  view: "atlas",
  focus: null,
  selected: null,
  query: "",
  theme: "dark",
  demo: false,
  bridgeGroup: "span",
  settingsOpen: false,
  metaTags: new Set(),
  camera: { x: 0, y: 0, zoom: 1 },
  physics: { ...FORCE_DEFAULTS },
  positions: new Map(),
  graph: null,
  simFrame: null,
  simAlpha: 0,
  prewarmGraph: true,
  ensureFocus: false,
  forcesOpen: false,
  quickOpen: false,
  quickQuery: "",
  quickIndex: 0,
  lastFocus: null,
  pendingFit: true,
  hasRendered: false,
  hudOpen: true,
  hover: null,
  pointer: { x: 0, y: 0 },
  nodeDrag: null,
  pan: null,
  lastNodeTap: null,
  hasInteracted: false,
  railCollapsed: new Set(),
  branchCollapsed: new Set(),
  snapshotKey: null,
  liveTimer: null,
  liveBusy: false,
  apiAvailable: false,
};

const STATUS_ORDER = ["raw", "3rd", "5th", "7th", "thesis"];
const STATUS_NAMES = { raw: "#RAW", "3rd": "#3RD", "5th": "#5TH", "7th": "#7TH", thesis: "#THESIS" };

function noteIsUnfiled(note) {
  return !note.home && !note.status && note.kind !== "external";
}

function noteRingHtml(note, size = 14, selected = false) {
  if (note.kind === "external") return ringSVG(note.status, size, selected, "external");
  if (note.status) return ringSVG(note.status, size, selected);
  return `<span class="ring-unfiled"></span>`;
}

function noteTypeText(note) {
  if (note.kind === "external") return "external · source";
  if (note.status) return `${statusLabel(note.status)} · ${statusStage(note.status)} / 5`;
  return "unfiled";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const PREFS_KEY = "atlas.prefs.v1";

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        theme: state.theme,
        bridgeGroup: state.bridgeGroup,
        physics: state.physics,
      })
    );
  } catch {
    // Local storage can be unavailable in privacy modes; the session still works.
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function fetchApiHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function showSetup(health) {
  if (!setupEl) return;
  setupEl.hidden = false;
  if (setupPath) {
    setupPath.value = health?.defaultVault || "";
    requestAnimationFrame(() => {
      setupPath.focus();
      setupPath.select();
    });
  }
  setupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vaultPath = setupPath?.value.trim() || "";
    if (!vaultPath) {
      if (setupError) setupError.textContent = "Enter the vault folder path.";
      return;
    }
    if (setupSubmit) setupSubmit.disabled = true;
    if (setupError) setupError.textContent = "Reading vault…";
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (setupError) setupError.textContent = data.error || "Could not read that folder.";
        if (setupSubmit) setupSubmit.disabled = false;
        return;
      }
      location.reload();
    } catch {
      if (setupError) setupError.textContent = "The local server did not respond.";
      if (setupSubmit) setupSubmit.disabled = false;
    }
  });
}

async function init() {
  const params = new URLSearchParams(location.search);
  const health = await fetchApiHealth();
  state.apiAvailable = Boolean(health?.ok);
  if (health?.ok && !health.configured) {
    showSetup(health);
    return;
  }
  const [vaultData, synthData] = await Promise.all([
    fetch("data/vault.json").then((r) => {
      if (!r.ok) throw new Error("vault.json");
      return r.json();
    }),
    fetch("data/synthetic.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  vault = vaultData;
  synthetic = synthData;
  state.metaTags = new Set(vault.metaDefaults || []);

  const requestedView = params.get("view");
  state.view = ["atlas", "index", "bridges"].includes(requestedView) ? requestedView : "atlas";
  const prefs = loadPrefs();
  if (params.has("theme")) state.theme = params.get("theme") === "light" ? "light" : "dark";
  else state.theme = prefs.theme === "light" ? "light" : "dark";
  if (params.has("group")) state.bridgeGroup = params.get("group") === "signature" ? "signature" : "span";
  else state.bridgeGroup = prefs.bridgeGroup === "signature" ? "signature" : "span";
  if (prefs.physics && typeof prefs.physics === "object") {
    for (const key of ["center", "repel", "link", "distance", "cohesion"]) {
      const value = Number(prefs.physics[key]);
      if (Number.isFinite(value) && !params.has(key)) state.physics[key] = value;
    }
  }
  state.demo = params.get("demo") === "1" && Boolean(synthetic);
  const requestedFocus = params.get("focus");
  const noFocus = requestedFocus === "none";
  state.focus = noFocus ? null : requestedFocus || null;
  state.lastFocus = params.has("last") ? params.get("last") : null;
  state.forcesOpen = params.get("forces") === "1";
  state.quickOpen = params.get("quick") === "1";
  state.quickQuery = params.get("q") || "";
  state.selected = params.has("note") ? (params.get("note") || null) : null;
  state.query = params.has("query")
    ? params.get("query")
    : state.focus
      ? tagQuery(state.focus)
      : "";
  state.settingsOpen = params.get("settings") === "1";
  if (params.has("meta")) {
    state.metaTags = new Set(
      params.get("meta").split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  let cameraOverride = false;
  const px = Number(params.get("x"));
  const py = Number(params.get("y"));
  const pz = Number(params.get("zoom"));
  if (Number.isFinite(px) && params.has("x")) {
    state.camera.x = px;
    cameraOverride = true;
  }
  if (Number.isFinite(py) && params.has("y")) {
    state.camera.y = py;
    cameraOverride = true;
  }
  if (Number.isFinite(pz) && params.has("zoom")) {
    state.camera.zoom = clamp(pz, 0.35, 2.5);
    cameraOverride = true;
  }
  for (const key of ["center", "repel", "link", "distance", "cohesion"]) {
    if (!params.has(key)) continue;
    const value = Number(params.get(key));
    if (Number.isFinite(value)) state.physics[key] = value;
  }
  if (cameraOverride || noFocus) state.pendingFit = false;

  document.body.dataset.theme = state.theme;
  rebuild();

  if (state.selected && state.view === "atlas") {
    const note = model.notesByTitle.get(state.selected);
    if (note && state.focus && !noteInTagBranch(note, state.focus)) {
      state.focus = note.home || state.focus;
      state.query = tagQuery(state.focus);
    }
    if (note && !state.focus) state.focus = note.home || "Math";
  }

  renderAll();
  bindEvents();
  installCanvasEvents();
  state.snapshotKey = JSON.stringify(vault);
  startLivePoll();
  if (state.quickOpen) {
    renderQuickSwitch();
    requestAnimationFrame(() => {
      quickInput?.focus();
      quickInput?.select();
    });
  }

  if (params.get("debug") === "1") {
    window.__atlas = {
      state,
      get model() {
        return model;
      },
      renderAll,
      fitGraph,
      computeStage,
      resolveCollisions,
      updateGraphDom,
      applyCamera,
      setHover,
      clearHover,
      get graph() {
        return state.graph;
      },
    };
  }
}

async function checkLiveSnapshot() {
  if (
    document.hidden ||
    state.liveBusy ||
    state.nodeDrag ||
    state.pan ||
    state.quickOpen ||
    state.settingsOpen
  ) {
    return;
  }
  state.liveBusy = true;
  try {
    const response = await fetch(`data/vault.json?live=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const next = await response.json();
    const key = JSON.stringify(next);
    if (key === state.snapshotKey) return;
    state.snapshotKey = key;
    vault = next;
    rebuild();
    renderAll();
    toast("Vault updated");
  } catch {
    // The static snapshot remains valid while the vault is being saved.
  } finally {
    state.liveBusy = false;
  }
}

function startLivePoll() {
  if (state.liveTimer) return;
  state.liveTimer = window.setInterval(checkLiveSnapshot, 1800);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkLiveSnapshot();
  });
}

function rebuild() {
  model = buildModel({
    vault,
    synthetic,
    demoOn: state.demo,
    metaTags: [...state.metaTags],
  });
  if (state.focus && !model.tagsByName.has(state.focus)) {
    state.focus = model.tagRoots[0]?.name || null;
    if (state.focus) state.query = tagQuery(state.focus);
  }
  if (state.focus && model.tagsByName.get(state.focus)?.branchCount === 0) {
    state.focus = model.tagRoots.find((t) => t.branchCount > 0)?.name || null;
  }
  if (state.selected && !model.notesByTitle.has(state.selected)) {
    state.selected = null;
  }
  if (state.focus && !model.tagsByName.get(state.focus)?.branchCount) {
    state.focus = model.tagRoots.find((t) => t.branchCount > 0)?.name || null;
  }
}

/* ------------------------------------------------------------------ */
/* Query                                                               */
/* ------------------------------------------------------------------ */

function parseQuery(query) {
  const filters = { text: [], tag: [], status: [], kind: [], path: [], is: [], meta: [] };
  if (!query || !query.trim()) return filters;
  const re = /(-?)(\w+):"([^"]*)"|(-?)(\w+):(\S+)|(-?)"([^"]*)"|(-?)(\S+)/g;
  let m;
  while ((m = re.exec(query))) {
    let neg = false;
    let key = null;
    let value = "";
    if (m[2]) {
      neg = m[1] === "-";
      key = m[2].toLowerCase();
      value = m[3];
    } else if (m[5]) {
      neg = m[4] === "-";
      key = m[5].toLowerCase();
      value = m[6];
    } else if (m[8]) {
      neg = m[7] === "-";
      value = m[8];
    } else {
      neg = m[9] === "-";
      value = m[10];
    }
    value = value.replace(/^"|"$/g, "");
    if (key && filters[key]) filters[key].push({ value, neg });
    else filters.text.push({ value: value.toLowerCase(), neg });
  }
  return filters;
}

function queryTag(query) {
  const f = parseQuery(query);
  return f.tag.find((t) => !t.neg)?.value || null;
}

function queryActive(query) {
  return Boolean(query && query.trim());
}

function tagQuery(name) {
  return /[\s"]/.test(name) ? `tag:"${String(name).replaceAll('"', '\\"')}"` : `tag:${name}`;
}

function tagDescendantNames(tagName) {
  const tag = model.tagsByName.get(tagName);
  if (!tag) return new Set();
  return new Set(tagSubtree(tag, model.tagsByName).map((t) => t.name));
}

function noteInTagBranch(note, tagName) {
  const names = tagDescendantNames(tagName);
  if (!names.size) return false;
  return [note.home, ...note.tags, ...note.inherited].some((x) => x && names.has(x));
}

function noteIsUnindexed(note) {
  return model.tags.some((t) => t.unindexedNotes?.includes(note.title));
}

function matchNote(note, filters) {
  const check = (ok, neg) => (neg ? !ok : ok);
  for (const f of filters.text) {
    const hay = [
      note.title,
      note.path,
      note.body || "",
      note.home || "",
      ...(note.tags || []),
      ...(note.inherited || []),
    ]
      .join(" ")
      .toLowerCase();
    if (!check(hay.includes(f.value), f.neg)) return false;
  }
  for (const f of filters.tag) {
    if (!check(noteInTagBranch(note, f.value), f.neg)) return false;
  }
  for (const f of filters.status) {
    const value = f.value.replace(/^#/, "");
    if (!check(note.status === value, f.neg)) return false;
  }
  for (const f of filters.kind) {
    if (!check(note.kind === f.value, f.neg)) return false;
  }
  for (const f of filters.path) {
    if (!check((note.path || "").toLowerCase().includes(f.value.toLowerCase()), f.neg)) return false;
  }
  for (const f of filters.is) {
    const v = f.value.toLowerCase();
    let ok = false;
    if (v === "bridge") ok = note.bridge;
    else if (v === "unindexed") ok = noteIsUnindexed(note);
    else if (v === "unfiled") ok = noteIsUnfiled(note);
    else if (v === "index") ok = Boolean(model.tagsByName.get(note.home)?.isIndex);
    else if (v === "external") ok = note.kind === "external";
    else if (v === "note") ok = note.kind === "note";
    if (!check(ok, f.neg)) return false;
  }
  for (const f of filters.meta) {
    const hasMeta = note.tags.some((t) => model.tagsByName.get(t)?.meta);
    const ok = f.value === "true" ? hasMeta : !hasMeta;
    if (!check(ok, f.neg)) return false;
  }
  return true;
}

function visibleNotesForView() {
  const filters = parseQuery(state.query);
  let notes = model.notes.filter((n) => matchNote(n, filters));
  if (state.focus) {
    notes = notes.filter((n) => noteInTagBranch(n, state.focus));
  }
  return notes;
}

function visibleBridgeNotes() {
  const filters = parseQuery(state.query);
  let notes = model.bridgeNotes.filter((n) => matchNote(n, filters));
  if (state.focus) notes = notes.filter((n) => noteInTagBranch(n, state.focus));
  return notes.sort((a, b) => b.span - a.span || a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------ */
/* Stage / Atlas                                                       */
/* ------------------------------------------------------------------ */

function gridNotePositions(card, count, cols = 2) {
  const out = [];
  const cellW = 240;
  const cellH = 48;
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: card.x + (i % cols) * cellW,
      y: card.y + card.h + 32 + Math.floor(i / cols) * cellH,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Focus stage                                                         */
/* ------------------------------------------------------------------ */

function computeStage() {
  if (!state.focus) return null;
  const focus = model.tagsByName.get(state.focus);
  if (!focus || focus.branchCount === 0) return null;
  const notes = focus.branchNotes
    .map((title) => model.notesByTitle.get(title))
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
  return {
    focus,
    notes,
    branch: focus.hasChildren,
    mode: focus.hasChildren ? "branch" : "leaf",
  };
}

function stageMetaLine(stage) {
  if (!stage) return "";
  if (stage.branch) {
    return `${stage.focus.branchCount} in branch · ${stage.focus.children.length} tags · ${stage.notes.length} shown`;
  }
  return `${stage.focus.directCount} direct · ${stage.focus.anchoredCount} anchored · ${stage.focus.linkedCount} linked`;
}

function activeTagMeta(tag) {
  if (tag.hasChildren) return `${tag.branchCount} in branch`;
  return `${tag.anchoredCount} anchored${tag.linkedCount ? ` · ${tag.linkedCount} linked` : ""}`;
}

function tagMetaRight(tag, active) {
  if (tag.hasChildren) return `${tag.children.length} tags`;
  if (active && tag.isIndex) {
    if (tag.unindexedCount > 0) return "unindexed";
    if (tag.curatedCount > 0) return "curated";
    return "index";
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Graph nodes, edges, and force simulation                            */
/* ------------------------------------------------------------------ */

function focusRelations() {
  const focus = state.focus ? model.tagsByName.get(state.focus) : null;
  if (!focus) return { focus: null, ancestors: new Set(), descendants: new Set() };
  const ancestors = new Set(tagParents(focus, model.tagsByName));
  const descendants = new Set(
    tagSubtree(focus, model.tagsByName)
      .map((t) => t.name)
      .filter((name) => name !== focus.name)
  );
  return { focus, ancestors, descendants };
}

function tagCardHtml(tag, { node, focus = false, relation = null }) {
  if (!node) return "";
  const classes = ["tag-card"];
  if (tag.isIndex) classes.push("is-index");
  classes.push("active");
  if (focus) classes.push("hub");
  if (relation?.ancestor) classes.push("is-ancestor");
  if (relation?.descendant) classes.push("is-descendant");
  if (tag.synthetic) classes.push("synthetic");
  const metaLeft = activeTagMeta(tag);
  const right = tagMetaRight(tag, true);
  const synth = tag.synthetic ? synthMark() : "";
  node.renderW = node.w;
  node.renderH = node.h;
  return `
    <div class="${classes.join(" ")}" style="left:${node.x - node.w / 2}px;top:${node.y - node.h / 2}px;width:${node.w}px;height:${node.h}px" data-tag="${esc(tag.name)}" data-node-id="${esc(node.id)}">
      <div class="tag-top">
        <span class="tag-name">${synth}${esc(tag.name)}</span>
        ${tag.isIndex ? `<span class="tag-index">INDEX</span>` : ""}
      </div>
      <div class="tag-meta"><span>${metaLeft}</span>${right ? `<span>${right}</span>` : ""}</div>
      <div class="tag-bar">${barSegments(tag.dist)}</div>
      <span class="tag-port" data-port aria-hidden="true"></span>
    </div>`;
}

function tagScaleClass(tag) {
  const size = tag.hasChildren ? tag.branchCount : tag.directCount;
  if (size >= 8) return "size-xl";
  if (size >= 4) return "size-lg";
  if (size >= 2) return "size-md";
  return "size-sm";
}

function ambientTagHtml(tag, node, { lastFocus = false, relation = null } = {}) {
  if (!node) return "";
  const classes = ["tag-station", tagScaleClass(tag)];
  if (tag.isIndex) classes.push("is-index");
  if (tag.synthetic) classes.push("synthetic");
  if (lastFocus && !state.focus) classes.push("last-focus");
  if (relation?.ancestor) classes.push("is-ancestor");
  if (relation?.descendant) classes.push("is-descendant");
  const synth = tag.synthetic ? synthMark() : "";
  const index = tag.isIndex ? `<span class="station-index">INDEX</span>` : "";
  const last = lastFocus && !state.focus ? `<span class="station-last">last</span>` : "";
  const notes = tag.hasChildren ? tag.branchCount : tag.directCount;
  const unit = notes === 1 ? "note" : "notes";
  const tagsLine = tag.hasChildren
    ? `${tag.children.length} ${tag.children.length === 1 ? "tag" : "tags"}`
    : tag.linkedCount
      ? `+${tag.linkedCount} linked`
      : tag.isIndex
        ? "indexed"
        : "";
  const metaText = `${notes} ${unit}${tagsLine ? `  ${tagsLine}` : ""}`;
  const nameWidth = Math.min(176, String(tag.name).length * 6.25 + 18);
  const metaWidth = metaText.length * 5.0 + 34;
  const displayWidth = Math.max(
    62,
    nameWidth + (tag.isIndex ? 42 : 0),
    metaWidth,
    lastFocus && !state.focus ? 124 : 0
  );
  node.renderW = displayWidth;
  node.renderH = node.h;
  return `
    <button class="${classes.join(" ")}" style="left:${node.x - displayWidth / 2}px;top:${node.y - node.h / 2}px;width:${displayWidth}px" data-tag="${esc(tag.name)}" data-node-id="${esc(node.id)}">
      <span class="station-top">
        <span class="station-name">${synth}${esc(tag.name)}</span>
        ${index}
        ${last}
      </span>
      <span class="station-meta">
        <span class="station-count">${notes}</span>
        <span class="station-unit">${unit}</span>
        ${tagsLine ? `<span class="station-tags">${tagsLine}</span>` : ""}
      </span>
      <span class="station-bar">${barSegments(tag.dist)}</span>
      <span class="tag-port" data-port aria-hidden="true"></span>
    </button>`;
}
function noteHtml(note, node, { selected, showHome, dim }) {
  if (!node) return "";
  const classes = ["note"];
  if (selected) classes.push("selected");
  if (dim) classes.push("dim");
  const labelClass = `note-label minor ${node.labelSide === "left" ? "left" : "right"}`;
  const homeLine =
    showHome && note.home
      ? `<span class="n-home">home · ${esc(note.home)}</span>`
      : "";
  const synth = note.synthetic ? synthBadge() : "";
  const sub = "";
  return `
    <div class="${classes.join(" ")}" style="left:${node.x}px;top:${node.y}px" data-note="${esc(note.title)}" data-node-id="${esc(node.id)}">
      ${noteRingHtml(note, selected ? 24 : 16, selected)}
      <div class="${labelClass}">
        <span class="n-title">${esc(note.title)}${synth}</span>
        ${homeLine}
        ${sub}
      </div>
    </div>`;
}

function graphNodeFor(id) {
  return state.graph?.byId.get(id) || null;
}

function addNodePosition(id, seed) {
  const existing = state.positions.get(id);
  if (existing) return existing;
  const pos = { x: seed.x, y: seed.y };
  state.positions.set(id, pos);
  return pos;
}

function buildGraph({ prewarm = false } = {}) {
  const focus = state.focus ? model.tagsByName.get(state.focus) : null;
  const stage = computeStage();
  const tagList = model.tags
    .filter((tag) => tag.branchCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const nodes = [];
  const byId = new Map();

  // Deterministic hierarchy-aware seeds: roots on a wide ring, children
  // beside their parent. The force simulation then owns the final shape.
  const seedByName = new Map();
  const roots = tagList.filter((tag) => !tag.parent);
  roots.forEach((tag, index) => {
    seedByName.set(tag.name, seedForTag(tag.name, index, roots.length));
  });
  const queue = [...roots];
  while (queue.length) {
    const parent = queue.shift();
    const parentSeed = seedByName.get(parent.name);
    for (const childName of parent.children) {
      const child = model.tagsByName.get(childName);
      if (!child || !tagList.includes(child)) continue;
      const angle = hashString(child.name) * Math.PI * 2;
      const radius = 92 + hashString(`${child.name}:r`) * 54;
      seedByName.set(child.name, {
        x: parentSeed.x + Math.cos(angle) * radius,
        y: parentSeed.y + Math.sin(angle) * radius * 0.82,
      });
      queue.push(child);
    }
  }

  tagList.forEach((tag, index) => {
    const id = `tag:${tag.name}`;
    const seed =
      seedByName.get(tag.name) ||
      seedForTag(tag.name, index, tagList.length);
    const pos = addNodePosition(id, seed);
    const size = tagNodeSize(tag, tag.name === state.focus);
    const node = {
      id,
      kind: "tag",
      tag,
      name: tag.name,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      w: size.w,
      h: size.h,
      focusLocked: tag.name === state.focus,
    };
    nodes.push(node);
    byId.set(id, node);
  });

  const stageNotes = stage?.notes || [];
  stageNotes.forEach((note, index) => {
    const id = `note:${note.title}`;
    const homeId = note.home ? `tag:${note.home}` : null;
    const homeNode = homeId ? byId.get(homeId) : null;
    const seed = seedForNote(note, homeNode, index);
    const pos = addNodePosition(id, seed);
    const node = {
      id,
      kind: "note",
      note,
      title: note.title,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      w: noteNodeSize.w,
      h: noteNodeSize.h,
      focusLocked: false,
    };
    nodes.push(node);
    byId.set(id, node);
  });

  // Notes orbit their home tag instead of piling up on one side. The angle
  // also decides which side the label sits on, so labels face out.
  const notesByHome = new Map();
  for (const node of nodes) {
    if (node.kind !== "note" || !node.note.home) continue;
    const list = notesByHome.get(node.note.home) || [];
    list.push(node);
    notesByHome.set(node.note.home, list);
  }
  for (const [home, list] of notesByHome) {
    list.sort((a, b) => a.title.localeCompare(b.title));
    const n = list.length;
    list.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, n)) * Math.PI * 2;
      node.orbit = {
        angle,
        radius: n > 3 ? 206 : 196,
      };
      node.labelSide = Math.cos(angle) < -0.22 ? "left" : "right";
    });
  }

  const edges = [];
  const edgeKeys = new Set();
  const treePairs = new Set();

  const addEdge = (source, target, type, weight = 1, strength = 1, home = null, linked = false) => {
    if (!byId.has(source) || !byId.has(target) || source === target) return;
    const key = `${source}|${target}|${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      id: `edge:${edges.length + 1}`,
      source,
      target,
      type,
      weight,
      strength,
      home,
      linked,
    });
  };

  for (const tag of tagList) {
    const parentId = `tag:${tag.name}`;
    for (const childName of tag.children) {
      const childId = `tag:${childName}`;
      if (!byId.has(childId)) continue;
      addEdge(parentId, childId, "tree", 1, 1.7);
      treePairs.add([parentId, childId].sort().join("|"));
    }
  }

  // Co-membership: tags that share a note are pulled together. This is what
  // keeps non-hierarchical concepts (Politics/Left/China, etc.) physically
  // close instead of leaving isolated particles.
  const pairs = new Map();
  for (const note of model.notes) {
    const tagIds = note.tags
      .map((name) => `tag:${name}`)
      .filter((id) => byId.has(id));
    for (let i = 0; i < tagIds.length; i += 1) {
      for (let j = i + 1; j < tagIds.length; j += 1) {
        const a = tagIds[i];
        const b = tagIds[j];
        const key = [a, b].sort().join("|");
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  for (const [key, count] of pairs) {
    if (treePairs.has(key)) continue;
    const [a, b] = key.split("|");
    addEdge(a, b, "affinity", count, 0.065);
  }

  // A content note belongs to every tag it links. Draw the home edge strong
  // and the secondary memberships as light "note link" edges, so the note is
  // visibly attached to all of its tags, not only its home.
  for (const node of nodes) {
    if (node.kind !== "note") continue;
    const note = node.note;
    const memberships = (note.tags || []).filter((name) => byId.has(`tag:${name}`));
    if (note.home && byId.has(`tag:${note.home}`)) {
      addEdge(node.id, `tag:${note.home}`, "note", 1, 1.7, note.home, false);
    }
    for (const name of memberships) {
      if (name === note.home) continue;
      addEdge(node.id, `tag:${name}`, "note", 1, 0.18, note.home, true);
    }
  }

  const graph = { nodes, byId, edges };
  state.graph = graph;

  if (prewarm) {
    let alpha = 1;
    for (let i = 0; i < 360; i += 1) {
      stepGraph(graph, alpha);
      alpha *= 0.985;
    }
    // Expand around the focused card, not the world centre: the focus stays
    // put and its branch opens up instead of tearing away from it.
    const anchor =
      (state.focus && graph.byId.get(`tag:${state.focus}`)) || {
        x: WORLD.w / 2,
        y: WORLD.h / 2,
      };
    for (const node of graph.nodes) {
      if (node === anchor) continue;
      node.x = anchor.x + (node.x - anchor.x) * 1.26;
      node.y = anchor.y + (node.y - anchor.y) * 1.26;
    }
    updateTagPorts(graph);
    declutterNoteLabels(graph);
    resolveCollisions(graph, 2);
    updateTagPorts(graph);
    syncGraphPositions();
  }

  return graph;
}

function nodeCx(node) {
  if (node.kind !== "note") return node.x;
  return node.labelSide === "left" ? node.x - 104 : node.x + 104;
}

function stepGraph(graph, alpha) {
  if (!graph) return;
  const { nodes } = graph;
  const physics = state.physics;
  const cx = WORLD.w / 2;
  const cy = WORLD.h / 2;
  // Center force is only a gentle tether. The old 0.0048 value overwhelmed
  // short-range repulsion and collapsed the whole graph into a ~100px blob.
  const centerK = physics.center * 0.00003;
  // 405 (was 260) gives the default 10.30 enough reach to separate labels;
  // the slider still maps linearly to this scale.
  const repelK = physics.repel * 405;
  const linkK = physics.link * 0.75;

  for (const node of nodes) {
    node.vx = 0;
    node.vy = 0;
    if (node.dragging || node.focusLocked) continue;
    node.vx += (cx - node.x) * centerK * alpha;
    node.vy += (cy - node.y) * centerK * alpha;
  }

  // Extra weak cohesion: a global pull toward the graph centroid. This is
  // what keeps a node dragged far away from abandoning the rest of the atlas.
  if (physics.cohesion > 0 && nodes.length > 1) {
    let gx = 0;
    let gy = 0;
    for (const node of nodes) {
      gx += node.x;
      gy += node.y;
    }
    gx /= nodes.length;
    gy /= nodes.length;
    const cohesionK = physics.cohesion * 0.0016;
    for (const node of nodes) {
      if (node.dragging || node.focusLocked) continue;
      node.vx += (gx - node.x) * cohesionK * alpha;
      node.vy += (gy - node.y) * cohesionK * alpha;
    }
  }

  for (const node of nodes) {
    if (node.kind !== "note" || !node.orbit) continue;
    if (node.dragging || node.focusLocked) continue;
    const home = graph.byId.get(`tag:${node.note.home}`);
    if (!home) continue;
    const tx = home.x + Math.cos(node.orbit.angle) * node.orbit.radius;
    const ty = home.y + Math.sin(node.orbit.angle) * node.orbit.radius;
    node.vx += (tx - node.x) * 0.014 * alpha;
    node.vy += (ty - node.y) * 0.014 * alpha;
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      const acx = nodeCx(a);
      const bcx = nodeCx(b);
      let dx = bcx - acx;
      let dy = b.y - a.y;
      if (!dx && !dy) {
        dx = (i - j) * 0.1 + 0.01;
        dy = 0.01;
      }
      const dist2 = Math.max(900, dx * dx + dy * dy);
      const dist = Math.sqrt(dist2);
      const force = Math.min(2.8, (repelK / dist2) * alpha);

      if (!a.dragging && !a.focusLocked) {
        a.vx -= (dx / dist) * force;
        a.vy -= (dy / dist) * force;
      }
      if (!b.dragging && !b.focusLocked) {
        b.vx += (dx / dist) * force;
        b.vy += (dy / dist) * force;
      }

      // AABB collision for the label/card boxes, keeping the space around
      // focused cards and note labels clear.
      const overlapX = (a.w + b.w) / 2 + 8 - Math.abs(dx);
      const overlapY = (a.h + b.h) / 2 + 8 - Math.abs(dy);
      if (overlapX > 0 && overlapY > 0) {
        const sx = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
        const sy = dy === 0 ? (j % 2 ? 1 : -1) : Math.sign(dy);
        if (overlapX < overlapY) {
          const push = overlapX * 0.8 * alpha;
          if (!a.dragging && !a.focusLocked) a.vx -= sx * push;
          if (!b.dragging && !b.focusLocked) b.vx += sx * push;
        } else {
          const push = overlapY * 0.8 * alpha;
          if (!a.dragging && !a.focusLocked) a.vy -= sy * push;
          if (!b.dragging && !b.focusLocked) b.vy += sy * push;
        }
      }
    }
  }

  for (const edge of graph.edges) {
    // Shared-note and note-tag lines are annotation. Notes sit on their
    // home orbit, tags sit on the tree; neither line drags the other node
    // into a pile. Only index-tree edges carry spring force.
    if (edge.type === "affinity") continue;
    const a = graph.byId.get(edge.source);
    const b = graph.byId.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
    const target =
      physics.distance *
      (edge.type === "note" ? 1.05 : 1.55);
    const force = ((dist - target) / dist) * linkK * edge.strength * alpha;
    if (!a.dragging && !a.focusLocked) {
      a.vx += dx * force;
      a.vy += dy * force;
    }
    if (!b.dragging && !b.focusLocked) {
      b.vx -= dx * force;
      b.vy -= dy * force;
    }
  }

  for (const node of nodes) {
    if (node.dragging || node.focusLocked) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    // Keep the unbounded canvas numerically stable. This is only a safety
    // rail far outside any practical workspace, not a visible map edge.
    const speed = Math.hypot(node.vx, node.vy);
    if (speed > 80) {
      node.vx = (node.vx / speed) * 80;
      node.vy = (node.vy / speed) * 80;
    }
    node.vx *= 0.78;
    node.vy *= 0.78;
    node.x = Math.max(-1e6, Math.min(1e6, node.x + node.vx));
    node.y = Math.max(-1e6, Math.min(1e6, node.y + node.vy));
  }

  resolveCollisions(graph, 3);
  syncGraphPositions();
}

function noteLabelBox(node) {
  const width = Math.min(232, Math.max(44, node.title.length * 6.15 + 10));
  const height = 28;
  const x =
    node.labelSide === "left" ? node.x - 16 - width : node.x + 16;
  return { x, y: node.y - height / 2, w: width, h: height };
}

// The generic AABB collision uses the note ring; the text label is wider and
// taller. This pass moves free notes until their readable label boxes stop
// covering other labels or tag cards.
function declutterNoteLabels(graph) {
  const notes = graph.nodes.filter(
    (node) => node.kind === "note" && !node.dragging
  );
  const tags = graph.nodes.filter((node) => node.kind === "tag");
  for (let pass = 0; pass < 5; pass += 1) {
    let moved = false;
    for (let i = 0; i < notes.length; i += 1) {
      const a = notes[i];
      const boxA = noteLabelBox(a);
      const blockers = [
        ...tags.map((tag) => ({
          x: tag.x - tag.w / 2,
          y: tag.y - tag.h / 2,
          w: tag.w,
          h: tag.h,
        })),
        ...notes
          .filter((note) => note !== a)
          .map((note) => noteLabelBox(note)),
      ];
      for (const b of blockers) {
        const ox = Math.min(boxA.x + boxA.w, b.x + b.w) - Math.max(boxA.x, b.x);
        const oy = Math.min(boxA.y + boxA.h, b.y + b.h) - Math.max(boxA.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        const dir = a.y >= b.y + b.h / 2 ? 1 : -1;
        a.y += dir * (oy + 3) * 0.55;
        boxA.y = a.y - boxA.h / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function resolveCollisions(graph, iterations = 2) {
  for (let pass = 0; pass < iterations; pass += 1) {
    for (let i = 0; i < graph.nodes.length; i += 1) {
      const a = graph.nodes[i];
      for (let j = i + 1; j < graph.nodes.length; j += 1) {
        const b = graph.nodes[j];
        const dx = nodeCx(b) - nodeCx(a);
        const dy = b.y - a.y;
        const overlapX = (a.w + b.w) / 2 + 10 - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 + 10 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const sx = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
        const sy = dy === 0 ? (j % 2 ? 1 : -1) : Math.sign(dy);
        const ax = a.dragging || a.focusLocked;
        const bx = b.dragging || b.focusLocked;
        if (ax && bx) continue;
        const xFirst = overlapX < overlapY;
        const overlap = xFirst ? overlapX : overlapY;
        const s = xFirst ? sx : sy;
        if (ax) {
          if (xFirst) b.x += s * overlap;
          else b.y += s * overlap;
        } else if (bx) {
          if (xFirst) a.x -= s * overlap;
          else a.y -= s * overlap;
        } else {
          if (xFirst) {
            a.x -= s * overlap * 0.5;
            b.x += s * overlap * 0.5;
          } else {
            a.y -= s * overlap * 0.5;
            b.y += s * overlap * 0.5;
          }
        }
      }
    }
  }
}

function syncGraphPositions() {
  if (!state.graph) return;
  for (const node of state.graph.nodes) {
    const pos = state.positions.get(node.id);
    if (!pos) continue;
    pos.x = node.x;
    pos.y = node.y;
  }
}

function reheatSimulation(alpha = 0.7) {
  state.simAlpha = Math.max(state.simAlpha, alpha);
  if (!state.simFrame && state.view === "atlas") startSimulation();
}

function startSimulation() {
  if (state.view !== "atlas" || !state.graph) return;
  if (state.simAlpha <= 0) state.simAlpha = 0.7;
  cancelAnimationFrame(state.simFrame);
  const tick = () => {
    if (state.view !== "atlas" || !state.graph) {
      state.simFrame = null;
      return;
    }
    const alpha = state.simAlpha;
    stepGraph(state.graph, alpha);
    updateGraphDom();
    state.simAlpha = alpha * 0.984;
    if (state.simAlpha > 0.012) {
      state.simFrame = requestAnimationFrame(tick);
    } else {
      state.simAlpha = 0;
      state.simFrame = null;
      declutterNoteLabels(state.graph);
      resolveCollisions(state.graph, 2);
      syncGraphPositions();
      updateGraphDom();
    }
  };
  state.simFrame = requestAnimationFrame(tick);
}

function stopSimulation() {
  cancelAnimationFrame(state.simFrame);
  state.simFrame = null;
  state.simAlpha = 0;
}

function graphBounds() {
  if (!state.graph || !state.graph.nodes.length) {
    return { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
  }
  const nodes = state.graph.nodes;
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2));
  const minY = Math.min(...nodes.map((n) => n.y - n.h / 2));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w / 2));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h / 2));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function fitGraph({ animate = true, minZoom = 0.95 } = {}) {
  if (state.view !== "atlas") return;
  const bounds = graphBounds();
  const vw = mainEl.clientWidth;
  const vh = mainEl.clientHeight;
  if (!vw || !vh) return;
  const padding = 80;
  const fitZoom = Math.min(
    (vw - padding * 2) / Math.max(1, bounds.w),
    (vh - padding * 2) / Math.max(1, bounds.h)
  );
  // Fit the whole world into the canvas; the old 0.95 floor cropped the
  // outer tags and made the remaining centre look like one dense cluster.
  const zoom = clamp(fitZoom, minZoom, 1.1);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  setCamera({ x: vw / 2 - cx * zoom, y: vh / 2 - cy * zoom, zoom }, { animate });
}

function ensureFocusVisible() {
  if (!state.focus || state.view !== "atlas" || !state.graph) return;
  const node = state.graph.byId.get(`tag:${state.focus}`);
  if (!node) return;
  const vw = mainEl.clientWidth;
  const vh = mainEl.clientHeight;
  const z = state.camera.zoom;
  const margin = 76;
  const left = state.camera.x + (node.x - node.w / 2) * z;
  const right = state.camera.x + (node.x + node.w / 2) * z;
  const top = state.camera.y + (node.y - node.h / 2) * z;
  const bottom = state.camera.y + (node.y + node.h / 2) * z;
  let dx = 0;
  let dy = 0;
  if (left < margin) dx = margin - left;
  else if (right > vw - margin) dx = vw - margin - right;
  if (top < margin) dy = margin - top;
  else if (bottom > vh - margin) dy = vh - margin - bottom;
  if (dx || dy) {
    state.camera.x += dx;
    state.camera.y += dy;
    applyCamera({ animate: true });
  }
}

/* ------------------------------------------------------------------ */
/* Camera and HUD tools                                                */
/* ------------------------------------------------------------------ */

function applyCamera({ animate = false } = {}) {
  const world = mainEl.querySelector(".canvas-world");
  if (!world) return;
  world.classList.toggle("is-interacting", !animate);
  world.style.transform = `translate(${state.camera.x}px, ${state.camera.y}px) scale(${state.camera.zoom})`;
  const canvas = mainEl.querySelector(".atlas-canvas");
  if (canvas) {
    canvas.classList.toggle("zoom-far", state.camera.zoom < 1.12);
    canvas.classList.toggle("zoom-near", state.camera.zoom >= 1.12);
    const grid = 24 * state.camera.zoom;
    canvas.style.backgroundSize = `${grid}px ${grid}px`;
    canvas.style.backgroundPosition = `${state.camera.x}px ${state.camera.y}px`;
  }
  updateZoomUi();
}

function setCamera(target, { animate = false } = {}) {
  state.camera = {
    x: target.x,
    y: target.y,
    zoom: clamp(target.zoom, 0.35, 2.5),
  };
  applyCamera({ animate });
}

function zoomAt(nextZoom, anchorX, anchorY) {
  const rect = mainEl.getBoundingClientRect();
  const ax = (anchorX ?? rect.left + rect.width / 2) - rect.left;
  const ay = (anchorY ?? rect.top + rect.height / 2) - rect.top;
  const zoom = clamp(nextZoom, 0.35, 2.5);
  const wx = (ax - state.camera.x) / state.camera.zoom;
  const wy = (ay - state.camera.y) / state.camera.zoom;
  state.camera = { x: ax - wx * zoom, y: ay - wy * zoom, zoom };
  applyCamera({ animate: false });
}

function resetZoom() {
  const rect = mainEl.getBoundingClientRect();
  const ax = rect.width / 2;
  const ay = rect.height / 2;
  const wx = (ax - state.camera.x) / state.camera.zoom;
  const wy = (ay - state.camera.y) / state.camera.zoom;
  state.camera = { x: ax - wx, y: ay - wy, zoom: 1 };
  applyCamera({ animate: true });
}

function updateZoomUi() {
  const value = `${Math.round(state.camera.zoom * 100)}%`;
  mainEl.querySelectorAll(".zoom-readout").forEach((el) => {
    el.textContent = value;
  });
}


function forcesHtml() {
  if (!state.forcesOpen) return "";
  const p = state.physics;
  const row = (key, label, value, min, max, step) => `
    <label class="force-row">
      <span class="force-label">${label}</span>
      <span class="force-value" data-force-value="${key}">${Number(value).toFixed(key === "distance" ? 0 : 2)}</span>
      <input class="force-slider" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-force="${key}" aria-label="${label}">
    </label>`;
  const focusLocked = state.graph?.nodes.filter((n) => n.focusLocked).length || 0;
  return `
    <div class="forces-pop" id="forces-pop">
      <div class="forces-head">
        <span class="forces-title">Forces</span>
        <button class="forces-close" data-action="toggle-forces" aria-label="Close forces">×</button>
      </div>
      ${row("center", "Center force", p.center, 0, 2, 0.01)}
      ${row("repel", "Repel force", p.repel, 0, 20, 0.1)}
      ${row("link", "Link force", p.link, 0, 3, 0.01)}
      ${row("distance", "Link distance", p.distance, 60, 340, 1)}
      ${row("cohesion", "Cohesion", p.cohesion, 0, 0.6, 0.01)}
      <div class="forces-note">No shared-note spring. Focus re-settles the branch; the dotted lines follow.</div>
      <div class="forces-foot">
        <span title="${focusLocked ? "The focused tag is locked under physics." : ""}">${focusLocked ? `${focusLocked} locked` : "Free"}</span>
        <button data-action="reset-layout">Reset layout</button>
      </div>
    </div>`;
}

function canvasToolsHtml() {
  const used = state.hasInteracted ? " used" : "";
  return `
    <div class="canvas-tools">
      <button class="tool-btn" data-action="zoom-out" title="Zoom out (−)">−</button>
      <button class="tool-btn zoom-readout" data-action="zoom-reset" title="Reset zoom (0)">${Math.round(state.camera.zoom * 100)}%</button>
      <button class="tool-btn" data-action="zoom-in" title="Zoom in (+)">+</button>
      <span class="tool-sep"></span>
      <button class="tool-btn" data-action="fit-stage" title="Fit graph (F)">Fit</button>
      <button class="tool-btn" data-action="toggle-forces" title="Forces">Forces</button>
    </div>
    <div class="canvas-hint${used}">drag nodes · drag empty canvas to pan · scroll to zoom</div>`;
}

/* ------------------------------------------------------------------ */
/* Graph edges / DOM update                                            */
/* ------------------------------------------------------------------ */

function edgeClass(edge, relations) {
  const classes = ["graph-edge", edge.type === "note" ? "note-edge" : edge.type];
  if (edge.type === "note") {
    classes.push(edge.linked ? "is-linked" : "is-home");
    if (edge.linked && state.selected && edge.source === `note:${state.selected}`) {
      classes.push("is-selected");
    }
  }
  if (edge.type === "tree") {
    const a = edge.source.startsWith("tag:") ? edge.source.slice(4) : "";
    const b = edge.target.startsWith("tag:") ? edge.target.slice(4) : "";
    if (
      relations.focus &&
      (relations.ancestors.has(a) ||
        relations.descendants.has(a) ||
        relations.ancestors.has(b) ||
        relations.descendants.has(b) ||
        a === relations.focus.name ||
        b === relations.focus.name)
    ) {
      classes.push("is-focus-path");
    }
  }
  return classes.join(" ");
}

function edgeAttrs(edge) {
  const sourceTag = edge.source.startsWith("tag:") ? edge.source.slice(4) : "";
  const targetTag = edge.target.startsWith("tag:") ? edge.target.slice(4) : "";
  const sourceNote = edge.source.startsWith("note:") ? edge.source.slice(5) : "";
  const targetNote = edge.target.startsWith("note:") ? edge.target.slice(5) : "";
  return `data-edge-id="${esc(edge.id)}" data-source="${esc(edge.source)}" data-target="${esc(edge.target)}" data-source-tag="${esc(sourceTag)}" data-target-tag="${esc(targetTag)}" data-source-note="${esc(sourceNote)}" data-target-note="${esc(targetNote)}" data-home="${esc(edge.home || "")}"`;
}

function edgesHtml(relations) {
  if (!state.graph) return "";
  return state.graph.edges
    .map((edge) => `<path class="${edgeClass(edge, relations)}" ${edgeAttrs(edge)}/>`)
    .join("");
}

const PORT_OUT = 6;

function tagPortPoint(node) {
  if (node?.port) {
    return {
      x: node.port.tipX,
      y: node.port.tipY,
      nx: node.port.nx,
      ny: node.port.ny,
    };
  }
  return { x: node.x, y: node.y + node.h / 2, nx: 0, ny: 1 };
}

// One port per tag: the wedge slides around the card to face the average
// direction of every edge touching it. All edges land on that one tip.
function updateTagPorts(graph) {
  if (!graph) return;
  for (const node of graph.nodes) {
    if (node.kind !== "tag") continue;
    let sx = 0;
    let sy = 0;
    let weight = 0;
    for (const edge of graph.edges) {
      let otherId = null;
      if (edge.source === node.id) otherId = edge.target;
      else if (edge.target === node.id) otherId = edge.source;
      if (!otherId) continue;
      const other = graph.byId.get(otherId);
      if (!other) continue;
      const dx = other.x - node.x;
      const dy = other.y - node.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;
      // The index tree sets the port direction; notes and dotted links
      // follow it. Otherwise four notes can outvote a parent edge.
      const w =
        edge.type === "tree"
          ? 6
          : edge.type === "affinity"
            ? 0.4
            : edge.linked
              ? 0.25
              : 1;
      sx += (dx / dist) * w;
      sy += (dy / dist) * w;
      weight += w;
    }
    const renderW = node.renderW || node.w;
    const renderH = node.renderH || node.h;
    if (!weight) {
      node.port = null;
      node.portAngle = null;
      continue;
    }
    let angle = Math.atan2(sy, sx);
    if (node.portAngle != null) {
      let delta = angle - node.portAngle;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      angle = node.portAngle + delta * 0.35;
    }
    node.portAngle = angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = renderW / 2;
    const hh = renderH / 2;
    const tx = hw / Math.max(0.0001, Math.abs(cos));
    const ty = hh / Math.max(0.0001, Math.abs(sin));
    const t = Math.min(tx, ty);
    const bx = node.x + cos * t;
    const by = node.y + sin * t;
    const horizontal = tx <= ty;
    const side = horizontal
      ? cos >= 0
        ? "right"
        : "left"
      : sin >= 0
        ? "bottom"
        : "top";
    const nx = side === "right" ? 1 : side === "left" ? -1 : 0;
    const ny = side === "bottom" ? 1 : side === "top" ? -1 : 0;
    node.port = {
      x: bx,
      y: by,
      side,
      nx,
      ny,
      tipX: bx + nx * PORT_OUT,
      tipY: by + ny * PORT_OUT,
    };
  }
}

function orthogonalPath(pts) {
  const dx = pts.x2 - pts.x1;
  const dy = pts.y2 - pts.y1;
  if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) return "";
  if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) {
    return `M ${pts.x1.toFixed(2)} ${pts.y1.toFixed(2)} L ${pts.x2.toFixed(2)} ${pts.y2.toFixed(2)}`;
  }

  // A stepped trace, not a single elbow: alternate horizontal and vertical
  // moves, starting on the parent port axis and ending on the child port
  // axis. The more distance, the more 90° corners.
  const startAxis = Math.abs(pts.n1x) > 0.5 ? "h" : "v";
  const endAxis = Math.abs(pts.n2x) > 0.5 ? "h" : "v";
  const rough = Math.abs(dx) + Math.abs(dy);
  const steps = Math.max(8, Math.min(16, Math.round(rough / 55)));
  const axes = [];
  let axis = startAxis;
  for (let i = 0; i < steps; i += 1) {
    axes.push(axis);
    axis = axis === "h" ? "v" : "h";
  }
  if (axes[axes.length - 1] !== endAxis) axes.push(endAxis);
  const hCount = axes.filter((a) => a === "h").length;
  const vCount = axes.filter((a) => a === "v").length;
  let x = pts.x1;
  let y = pts.y1;
  const points = [{ x, y }];
  for (const a of axes) {
    if (a === "h") x += dx / Math.max(1, hCount);
    else y += dy / Math.max(1, vCount);
    points.push({ x, y });
  }
  points[points.length - 1] = { x: pts.x2, y: pts.y2 };
  const clean = [];
  for (const point of points) {
    const last = clean[clean.length - 1];
    if (!last || Math.abs(last.x - point.x) > 0.4 || Math.abs(last.y - point.y) > 0.4) {
      clean.push(point);
    }
  }
  return `M ${clean.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")}`;
}
function curvedPath(pts) {
  const tangent1 = Math.abs(pts.n1x) + Math.abs(pts.n1y) > 0.5;
  const tangent2 = Math.abs(pts.n2x) + Math.abs(pts.n2y) > 0.5;
  const c1x = tangent1
    ? pts.x1 + pts.n1x * 46
    : pts.x1 + (pts.x2 - pts.x1) * 0.2;
  const c1y = tangent1
    ? pts.y1 + pts.n1y * 46
    : pts.y1 + (pts.y2 - pts.y1) * 0.2;
  const c2x = tangent2
    ? pts.x2 + pts.n2x * 46
    : pts.x2;
  const c2y = tangent2
    ? pts.y2 + pts.n2y * 46
    : pts.y2;
  return `M ${pts.x1} ${pts.y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts.x2} ${pts.y2}`;
}

function edgeEndpoints(edge) {
  const a = state.graph?.byId.get(edge.source);
  const b = state.graph?.byId.get(edge.target);
  if (!a || !b) return null;
  if (edge.type === "tree") {
    const p1 = tagPortPoint(a);
    const p2 = tagPortPoint(b);
    return {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      n1x: p1.nx,
      n1y: p1.ny,
      n2x: p2.nx,
      n2y: p2.ny,
      orthogonal: true,
    };
  }
  if (edge.type === "note") {
    const tag = a.kind === "tag" ? a : b;
    const note = a.kind === "note" ? a : b;
    const p = tagPortPoint(tag);
    return {
      x1: note.x,
      y1: note.y,
      x2: p.x,
      y2: p.y,
      n1x: 0,
      n1y: 0,
      n2x: p.nx,
      n2y: p.ny,
    };
  }
  if (edge.type === "affinity") {
    const p1 = tagPortPoint(a);
    const p2 = tagPortPoint(b);
    return {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      n1x: p1.nx,
      n1y: p1.ny,
      n2x: p2.nx,
      n2y: p2.ny,
    };
  }
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, n1x: 0, n1y: 0, n2x: 0, n2y: 0 };
}
function edgePath(edge) {
  const pts = edgeEndpoints(edge);
  if (!pts) return "";
  if (pts.orthogonal) return orthogonalPath(pts);
  return curvedPath(pts);
}

function bindGraphDom() {
  if (!state.graph) return;
  const nodeEls = new Map();
  mainEl.querySelectorAll("[data-node-id]").forEach((el) => {
    nodeEls.set(el.dataset.nodeId, el);
  });
  for (const node of state.graph.nodes) {
    node.el = nodeEls.get(node.id) || null;
    node.portEl = node.el?.querySelector(".tag-port") || null;
    if (node.el?.offsetWidth) node.renderW = node.el.offsetWidth;
    if (node.el?.offsetHeight) node.renderH = node.el.offsetHeight;
  }
  const edgeEls = new Map();
  mainEl.querySelectorAll("[data-edge-id]").forEach((el) => {
    edgeEls.set(el.dataset.edgeId, el);
  });
  for (const edge of state.graph.edges) edge.el = edgeEls.get(edge.id) || null;
  tagResizeObserver?.disconnect();
  if (window.ResizeObserver) {
    tagResizeObserver = new ResizeObserver(() => {
      let changed = false;
      for (const node of state.graph?.nodes || []) {
        if (node.kind !== "tag" || !node.el) continue;
        const w = node.el.offsetWidth;
        const h = node.el.offsetHeight;
        if (w && w !== node.renderW) {
          node.renderW = w;
          changed = true;
        }
        if (h && h !== node.renderH) {
          node.renderH = h;
          changed = true;
        }
      }
      if (changed) {
        updateTagPorts(state.graph);
        updateGraphDom();
      }
    });
    for (const node of state.graph.nodes) {
      if (node.kind === "tag" && node.el) tagResizeObserver.observe(node.el);
    }
  }
  updateGraphDom();
  scheduleTagMetrics();
}

function updateWireViewport() {
  const svg = mainEl.querySelector(".graph-wires");
  if (!svg || !state.graph) return;
  const bounds = graphBounds();
  const pad = 180;
  const x = bounds.x - pad;
  const y = bounds.y - pad;
  const w = Math.max(1, bounds.w + pad * 2);
  const h = Math.max(1, bounds.h + pad * 2);
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  svg.style.left = `${x}px`;
  svg.style.top = `${y}px`;
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;
}

function measureTagMetrics() {
  if (!state.graph) return;
  for (const node of state.graph.nodes) {
    if (node.kind !== "tag" || !node.el) continue;
    const w = node.el.offsetWidth;
    const h = node.el.offsetHeight;
    if (w) node.renderW = w;
    if (h) node.renderH = h;
  }
  updateTagPorts(state.graph);
  updateGraphDom();
}

function scheduleTagMetrics() {
  requestAnimationFrame(() => {
    measureTagMetrics();
    // Webfonts can settle after the first frame and change the station box.
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => measureTagMetrics()).catch(() => {});
    }
  });
}

function updateGraphDom() {
  if (!state.graph) return;
  updateTagPorts(state.graph);
  updateWireViewport();
  for (const node of state.graph.nodes) {
    if (!node.el) continue;
    if (node.kind === "tag") {
      const w = node.renderW || node.w;
      const h = node.renderH || node.h;
      const top = node.y - h / 2;
      const left = node.x - w / 2;
      node.el.style.left = `${left}px`;
      node.el.style.top = `${top}px`;
      if (node.portEl) {
        if (!node.port) {
          node.portEl.style.display = "none";
        } else {
          const side = node.port.side;
          const horizontal = side === "left" || side === "right";
          node.portEl.style.display = "block";
          node.portEl.dataset.side = side;
          node.portEl.style.left = horizontal
            ? side === "right"
              ? `${w}px`
              : "0px"
            : `${node.port.x - left}px`;
          node.portEl.style.top = horizontal
            ? `${node.port.y - top}px`
            : side === "bottom"
              ? `${h}px`
              : "0px";
        }
      }
    } else {
      node.el.style.left = `${node.x}px`;
      node.el.style.top = `${node.y}px`;
    }
  }
  for (const edge of state.graph.edges) {
    if (!edge.el) continue;
    edge.el.setAttribute("d", edgePath(edge));
  }
}

function atlasHtml() {
  const stage = computeStage();
  const relations = focusRelations();
  const focus = relations.focus;
  const lastReturn =
    !focus && state.lastFocus
      ? `<button class="canvas-link" data-action="focus-last">Return to ${esc(state.lastFocus)}</button>`
      : "";
  const clearAction = focus
    ? `<button class="canvas-link" data-action="clear-focus">Clear focus</button>`
    : "";
  const focusLabel = focus ? (stage?.branch ? `${focus.name} branch` : focus.name) : "All tags";
  const focusLine = stage
    ? stageMetaLine(stage)
    : `${model.counts.notes} notes · ${model.counts.tags} tags · ${model.counts.indexes} indexes`;

  const tagNodes = state.graph?.nodes
    .filter((n) => n.kind === "tag")
    .map((node) => {
      const tag = node.tag;
      const relation = {
        ancestor: relations.ancestors.has(tag.name),
        descendant: relations.descendants.has(tag.name),
      };
      if (tag.name === state.focus) {
        return tagCardHtml(tag, { node, focus: true, relation });
      }
      return ambientTagHtml(tag, node, {
        lastFocus: tag.name === state.lastFocus,
        relation,
      });
    })
    .join("") || "";

  const noteNodes = state.graph?.nodes
    .filter((n) => n.kind === "note")
    .map((node) => {
      const note = node.note;
      const isSelected = note.title === state.selected;
      const dim = queryActive(state.query) && !isSelected && !matchNote(note, parseQuery(state.query));
      return noteHtml(note, node, {
        selected: isSelected,
        showHome: Boolean(note.home && note.home !== state.focus),
        dim,
      });
    })
    .join("") || "";

  return `
    <div class="atlas-canvas" id="atlas-canvas">
      <div class="canvas-world" style="transform:translate(${state.camera.x}px, ${state.camera.y}px) scale(${state.camera.zoom})">
        <svg class="graph-wires" aria-hidden="true">${edgesHtml(relations)}</svg>
        ${tagNodes}
        ${noteNodes}
      </div>

      <div class="canvas-meta${state.hudOpen ? "" : " collapsed"}">
        <div class="canvas-meta-head">
          <span class="eyebrow">Focus / ${esc(focusLabel)}</span>
          <button class="canvas-hud-toggle" data-action="toggle-hud" title="${state.hudOpen ? "Collapse focus panel" : "Expand focus panel"}">${state.hudOpen ? "−" : "+"}</button>
        </div>
        <span class="meta-line"><strong>${esc(focusLine)}</strong></span>
        <div class="canvas-meta-actions">
          <button class="canvas-link" data-action="fit-stage">Fit</button>
          ${lastReturn}
          ${clearAction}
        </div>
      </div>

      ${canvasToolsHtml()}
      ${forcesHtml()}
      <div class="graph-legend">
        <span><i class="lg-note"></i>content note</span>
        <span><i class="lg-tag"></i>tag</span>
        <span><i class="lg-tree"></i>index tree</span>
        <span><i class="lg-home"></i>note home</span>
        <span><i class="lg-note-link"></i>note link</span>
        <span><i class="lg-affinity"></i>shared note</span>
      </div>
      <div class="graph-tooltip" id="graph-tooltip"></div>
    </div>`;
}

function updateGraphAfterRender() {
  bindGraphDom();
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

function curationFor(note) {
  const homeTag = model.tagsByName.get(note.home);
  if (!homeTag?.isIndex) return { label: "—", kind: "none" };
  const curated = note.curatedBy.includes(homeTag.name);
  return { label: curated ? "Curated" : "Unindexed", kind: curated ? "curated" : "unindexed" };
}

function indexRowsHtml(notes) {
  const groups = new Map();
  for (const note of notes) {
    const key = note.kind === "external" ? "external" : note.status || "unfiled";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  const order = [...STATUS_ORDER, "external", "unfiled"];
  const html = [];
  for (const key of order) {
    const list = groups.get(key);
    if (!list || !list.length) continue;
    list.sort((a, b) => a.title.localeCompare(b.title));
    const color = key === "unfiled" ? null : key === "external" ? externalColor() : statusColor(key);
    const groupName = key === "unfiled" ? "UNFILED" : key === "external" ? "EXTERNAL" : STATUS_NAMES[key];
    html.push(`
      <div class="table-group">
        ${color ? `<span class="sw" style="background:${color}"></span>` : `<span class="sw" style="border:1px solid var(--ink-3)"></span>`}
        <span>${groupName}</span>
        <span class="count">${list.length}</span>
        <span class="rule"></span>
      </div>`);
    for (const note of list) {
      const cur = curationFor(note);
      const ring = noteRingHtml(note, 14, false);
      const homeCell = `${noteHomeHtml(note, model.tagsByName)}${note.tags.length > 1 ? `<span class="plus">+${note.tags.length - 1}</span>` : ""}`;
      const synth = note.synthetic ? synthBadge() : "";
      html.push(`
        <div class="table-row${note.title === state.selected ? " selected" : ""}" data-note="${esc(note.title)}">
          <div class="cell"><span class="note-ring">${ring}</span></div>
          <div class="cell row-title" title="${esc(note.title)}">${synth}${esc(note.title)}</div>
          <div class="cell row-path" title="${esc(note.path)}">${esc(note.path || "")}</div>
          <div class="cell row-tags">${homeCell}</div>
          <div class="cell"><span class="row-curation" style="color:${cur.kind === "unindexed" ? "var(--warn)" : "var(--ink-3)"}">${cur.label}</span></div>
          <div class="cell row-date">${fmtDate(note.date)}</div>
        </div>`);
    }
  }
  return html.join("");
}

function statusColor(key) {
  return {
    raw: "#ff9494",
    "3rd": "#feb867",
    "5th": "#a7e052",
    "7th": "#70ffd4",
    thesis: "#2d2afe",
  }[key];
}

function indexHtml() {
  const notes = visibleNotesForView();
  const filtered = queryActive(state.query);
  const title = state.focus ? state.focus : filtered ? "Filtered notes" : "All notes";
  const subtitle = state.focus
    ? `${notes.length} notes in branch · ${model.counts.tags} tags`
    : filtered
      ? `${notes.length} of ${model.counts.notes} notes · ${model.counts.staged} staged · ${model.counts.tags} tags`
      : `${model.counts.notes} notes · ${model.counts.staged} staged · ${model.counts.tags} tags`;
  return `
    <div class="table-view">
      <div class="table-head">
        <div>
          <div class="eyebrow">Index / ${state.focus ? "Branch" : filtered ? "Filter" : "All notes"}</div>
          <h1 class="table-title">${esc(title)}</h1>
          <div class="table-sub">${esc(subtitle)}</div>
        </div>
        <button class="table-sort">Status ${chevronDown()}</button>
      </div>
      <div class="table-columns">
        <span></span><span>Note</span><span>Path</span><span>Home / Tags</span><span>Curation</span><span>Edited</span>
      </div>
      <div class="table-scroll">
        ${notes.length ? indexRowsHtml(notes) : `<div class="atlas-empty" style="position:static;padding:32px 0"><strong>No notes match.</strong><br>Clear the filter or choose another tag.</div>`}
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Bridges                                                             */
/* ------------------------------------------------------------------ */

function bridgeSignature(note) {
  return note.tags
    .filter((t) => !model.tagsByName.get(t)?.meta)
    .sort((a, b) => a.localeCompare(b))
    .join(" × ");
}

function bridgeSpanSummary(notes) {
  const counts = new Map();
  for (const n of notes) counts.set(n.span, (counts.get(n.span) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[0] - a[0]);
}

function bridgesHtml() {
  const notes = visibleBridgeNotes();
  const spans = bridgeSpanSummary(notes);
  const minSpan = spans.length ? Math.min(...spans.map(([s]) => s)) : 0;
  const maxSpan = spans.length ? Math.max(...spans.map(([s]) => s)) : 0;
  const maxCount = Math.max(1, ...spans.map(([, c]) => c));

  const groups = new Map();
  for (const note of notes) {
    const key = state.bridgeGroup === "signature" ? bridgeSignature(note) : String(note.span);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => {
    if (state.bridgeGroup === "span") return Number(b) - Number(a);
    return groups.get(b).length - groups.get(a).length || a.localeCompare(b);
  });

  const groupsHtml = groupKeys
    .map((key) => {
      const list = groups.get(key).sort((a, b) => b.span - a.span || a.title.localeCompare(b.title));
      const label =
        state.bridgeGroup === "signature"
          ? `<span class="sig">${esc(key)}</span>`
          : `<span>SPAN ${esc(key)}</span>`;
      return `
        <div class="bridge-group">
          ${bridgeGlyph()}
          ${label}
          <span class="count">${list.length}</span>
          <span class="rule"></span>
        </div>
        ${list
          .map((note) => {
            const cur = curationFor(note);
            const synth = note.synthetic ? synthBadge() : "";
            return `
              <div class="bridge-row${note.title === state.selected ? " selected" : ""}" data-note="${esc(note.title)}">
                <div class="cell"><span class="note-ring">${noteRingHtml(note, 14, false)}</span></div>
                <div class="cell row-title" title="${esc(note.title)}">${synth}${esc(note.title)}</div>
                <div class="cell bridge-home">${homeMark()}${esc(note.home || "—")}</div>
                <div class="cell bridge-tags">${note.bridgeTags.map((t) => `<span>${esc(t)}</span>`).join('<span class="sep">·</span>')}</div>
                <div class="cell"><span class="row-curation" style="color:${cur.kind === "unindexed" ? "var(--warn)" : "var(--ink-3)"}">${cur.label}</span></div>
                <div class="cell row-date">${fmtDate(note.date)}</div>
              </div>`;
          })
          .join("")}`;
    })
    .join("");

  const curated = notes.filter((n) => n.curatedBy.length > 0).length;
  const notCurated = notes.length - curated;
  const memberships = notes.reduce((sum, n) => sum + n.bridgeTags.length, 0);

  const shared = new Map();
  for (const note of notes) {
    for (const tag of note.tags) {
      if (model.tagsByName.get(tag)?.meta) continue;
      shared.set(tag, (shared.get(tag) || 0) + 1);
    }
  }
  const sharedTags = [...shared.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4);

  return `
    <div class="bridges-view${state.bridgeGroup === "signature" ? " bridges-signature" : ""}">
      <div class="bridges-head">
        <div>
          <div class="eyebrow">Lens / Cross-category</div>
          <h1 class="bridges-title">Bridges</h1>
          <div class="bridges-sub">${notes.length} notes · spanning ${minSpan}–${maxSpan} categories</div>
          <div class="bridges-summary">
            <span class="span-label">Span</span>
            <div class="span-items">
              ${spans
                .map(
                  ([span, count]) => `
                    <span class="span-item"><span class="n">${span}</span><span class="span-track"><i style="width:${Math.round((count / maxCount) * 100)}%"></i></span><span>${count}</span></span>`
                )
                .join("")}
            </div>
          </div>
        </div>
        <button class="bridges-sort" data-action="toggle-group">
          ${state.bridgeGroup === "span" ? "Span" : "Signature"} ${chevronDown()}
        </button>
      </div>

      <div class="bridge-columns">
        <span></span><span>Note</span><span>Home</span><span>Bridge tags</span><span>Curation</span><span>Edited</span>
      </div>

      <div class="bridge-scroll">
        ${notes.length ? groupsHtml : `<div class="atlas-empty" style="position:static;padding:32px 0"><strong>No bridges match.</strong><br>Clear the filter or choose another tag.</div>`}
      </div>

      <div class="bridges-insight">
        <div class="insight-block">
          <div class="meta-label">Curation gap</div>
          <div class="insight-line"><strong>${notCurated} of ${notes.length}</strong> bridges are not in an index.</div>
          <div class="insight-sub">${curated} curated · ${memberships} bridge memberships · ${model.counts.syntheticNotes ? `${model.counts.syntheticNotes} synthetic notes included` : "real vault only"}</div>
        </div>
        <div class="insight-block">
          <div class="meta-label">Shared tags</div>
          <div class="insight-tags">
            ${sharedTags.map(([name, count]) => `<span>${esc(name)} <b>${count}</b></span>`).join("")}
          </div>
        </div>
      </div>

      <div class="bridges-note">${notes.length} bridges · ${memberships} bridge memberships · ${curated} curated</div>
    </div>`;
}

function bridgeGlyph() {
  return `<svg class="bridge-glyph" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><circle cx="2" cy="4" r="0.9" fill="currentColor" stroke="none"/><circle cx="10" cy="4" r="0.9" fill="currentColor" stroke="none"/><path d="M2.9 4h6.2"/><path d="M2 3.1C4 1.4 8 1.4 10 3.1"/></svg>`;
}

/* ------------------------------------------------------------------ */
/* Rail, inspector, footer, settings                                   */
/* ------------------------------------------------------------------ */

function railRow(tag, { depth = 0, active = false, collapsed = false } = {}) {
  const caret = tag.hasChildren
    ? `<button type="button" class="idx-caret rail-toggle${collapsed ? " is-collapsed" : ""}" data-rail-toggle="${esc(tag.name)}" aria-label="${collapsed ? "Expand" : "Collapse"} ${esc(tag.name)}" aria-expanded="${collapsed ? "false" : "true"}">${chevronDown()}</button>`
    : `<span class="idx-caret empty"></span>`;
  const mark = tag.isIndex ? `<span class="idx-mark"></span>` : `<span class="idx-mark blank"></span>`;
  const warn = tag.unindexedCount > 0 ? `<span class="idx-warn" title="${tag.unindexedCount} tagged notes not in index"></span>` : "";
  const bar = tag.branchCount > 0 ? `<span class="idx-bar">${barSegments(tag.dist)}</span>` : `<span class="idx-bar empty"></span>`;
  const mainCount = tag.hasChildren ? tag.branchCount : tag.anchoredCount;
  const linkedHtml = !tag.hasChildren && tag.linkedCount > 0 ? `<span class="plus">+${tag.linkedCount}</span>` : "";
  const synth = tag.synthetic ? synthMark() : "";
  return `
    <div class="idx-row${active ? " active" : ""}" style="padding-left:${8 + depth * 17}px" data-tag="${esc(tag.name)}" role="button" tabindex="0">
      ${caret}
      ${mark}
      <span class="idx-name">${synth}${esc(tag.name)}</span>
      ${warn}
      ${bar}
      <span class="idx-count">${mainCount}${linkedHtml}</span>
    </div>`;
}
function renderRail() {
  document.getElementById("rail-tag-count").textContent = `${model.counts.tags} tags`;
  const rows = [];
  const allActive = !state.focus && state.view !== "atlas";
  rows.push(`
    <div class="idx-row all${allActive ? " active" : ""}" data-action="all-notes" role="button" tabindex="0">
      <span class="idx-caret empty"></span>
      <span class="idx-mark blank"></span>
      <span class="idx-name">All notes</span>
      <span class="idx-count">${model.counts.notes}</span>
    </div>`);
  const roots = model.tagRoots.filter((t) => t.branchCount > 0);
  const walk = (tag, depth) => {
    const collapsed = state.railCollapsed.has(tag.name);
    rows.push(
      railRow(tag, {
        depth,
        active: tag.name === state.focus,
        collapsed,
      })
    );
    if (!tag.hasChildren || collapsed) return;
    for (const childName of tag.children) {
      const child = model.tagsByName.get(childName);
      if (!child || child.branchCount === 0) continue;
      walk(child, depth + 1);
    }
  };
  for (const root of roots) walk(root, 0);
  railListEl.innerHTML = rows.join("");
  const unused = model.tags.filter((t) => t.branchCount === 0).length;
  document.getElementById("review-unused-count").textContent = String(unused);
  const unsorted = document.getElementById("review-unsorted-count");
  if (unsorted) unsorted.textContent = String(model.unfiledNotes.length);
  requestAnimationFrame(() => {
    railListEl.querySelector(".idx-row.active")?.scrollIntoView({ block: "nearest" });
  });
}

function toggleRail(name) {
  if (state.railCollapsed.has(name)) state.railCollapsed.delete(name);
  else state.railCollapsed.add(name);
  renderRail();
}
function tagPanelHtml(tag) {
  const anchored = tag.anchoredNotes
    .map((title) => model.notesByTitle.get(title))
    .filter(Boolean);
  const linked = tag.linkedNotes
    .map((title) => model.notesByTitle.get(title))
    .filter(Boolean);
  const branch = tag.branchNotes
    .map((title) => model.notesByTitle.get(title))
    .filter(Boolean);

  const noteRow = (note, withHome = false) => `
    <button class="panel-note" data-note="${esc(note.title)}">
      <span class="panel-note-title">${esc(note.title)}</span>
      <span class="panel-note-meta">
        ${noteTypeText(note)}
        ${withHome && note.home ? ` · home ${esc(note.home)}` : ""}
        ${note.synthetic ? " · synth" : ""}
      </span>
    </button>`;

  const coverage = tag.isIndex
    ? tag.children.length
      ? `${tag.children.length} child tags · ${tag.curatedCount} curated notes · ${tag.unindexedCount} unindexed`
      : `${tag.curatedCount} curated · ${tag.unindexedCount} unindexed · ${tag.staleCount} stale`
    : "No #index note";
  const branchCollapsed = state.branchCollapsed.has(tag.name);

  return `
    <div class="insp-head">
      <span class="eyebrow">Focused tag</span>
      <button class="insp-close" data-action="clear-focus" aria-label="Clear focus">×</button>
    </div>

    <div>
      <h1 class="insp-title">${esc(tag.name)}</h1>
      <div class="tag-panel-badges">
        ${tag.isIndex ? `<span class="badge">Index</span>` : ""}
        ${tag.meta ? `<span class="badge">Meta</span>` : ""}
        ${tag.synthetic ? `<span class="badge warn">Synthetic</span>` : ""}
        ${tag.hasChildren ? `<span class="badge">Branch</span>` : `<span class="badge">Leaf</span>`}
      </div>
      <div class="tag-panel-counts">
        <span><b>${tag.branchCount}</b> in branch</span>
        <span><b>${tag.anchoredCount}</b> anchored</span>
        <span><b>${tag.linkedCount}</b> linked</span>
      </div>
      <div class="tag-panel-bar">${barSegments(tag.dist)}</div>
    </div>

    <div class="divider"></div>

    <section class="panel-section">
      <div class="meta-label">Anchored here · ${anchored.length}</div>
      ${anchored.length ? anchored.map((n) => noteRow(n)).join("") : `<div class="panel-empty">No note has this as its home.</div>`}
    </section>

    <section class="panel-section">
      <div class="meta-label">Linked here · ${linked.length}</div>
      ${linked.length ? linked.map((n) => noteRow(n, true)).join("") : `<div class="panel-empty">No cross-category link lands here.</div>`}
    </section>

    ${tag.hasChildren ? `<section class="panel-section branch-section">
      <button class="branch-head" data-branch-toggle="${esc(tag.name)}" aria-expanded="${branchCollapsed ? "false" : "true"}">
        <span class="meta-label">In branch · ${branch.length}</span>
        <span class="branch-caret${branchCollapsed ? " is-collapsed" : ""}">${chevronDown()}</span>
      </button>
      <div class="branch-scroll${branchCollapsed ? " collapsed" : ""}">
        ${branch.map((n) => noteRow(n, true)).join("")}
      </div>
    </section>` : ""}

    <section class="panel-section">
      <div class="meta-label">Index coverage</div>
      <div class="panel-empty" style="font-family:var(--font-mono);font-size:7.5px">${esc(coverage)}</div>
    </section>

    <div class="insp-actions inspector-dock">
      <button class="meta-toggle${tag.meta ? " active" : ""}" data-meta-tag="${esc(tag.name)}">
        <span class="tick"></span>${tag.meta ? "Meta-tag" : "Mark as meta"}
      </button>
      ${tag.synthetic ? "" : `<a class="btn btn-primary" href="obsidian://open?vault=${encodeURIComponent(model.vault)}&file=${encodeURIComponent(tag.path)}" title="Open this tag note in Obsidian to edit its index">Open in Obsidian</a>`}
      <div class="action-grid">
        <button class="btn btn-secondary" data-action="open-index">Open in Index</button>
        <button class="btn btn-secondary" data-action="clear-focus">Clear focus</button>
      </div>
    </div>`;
}

function noteInspectorHtml(note) {
  const homeTag = model.tagsByName.get(note.home);
  const cur = curationFor(note);
  const focusTag = model.tagsByName.get(state.focus);
  const reAnchored = focusTag && !focusTag.children.length && state.focus !== note.home;
  const secondary = note.tags.filter((t) => t !== note.home);
  const alsoCurated = note.alsoCuratedBy || [];
  const homeParents = tagParents(homeTag, model.tagsByName);
  const inheritedExtra = note.inherited.filter((t) => t !== note.home && !homeParents.includes(t));
  const isReal = !note.synthetic;
  const notePath = note.path || note.title;
  const indexBadge = cur.kind === "curated" ? "Curated" : cur.kind === "unindexed" ? "Not listed" : "—";

  const linkList = (titles) =>
    titles.length
      ? titles
          .map((title) => {
            const n = model.notesByTitle.get(title);
            return `<button class="panel-note" data-note="${esc(title)}"><span class="panel-note-title">${esc(title)}</span><span class="panel-note-meta">${n?.status ? statusLabel(n.status) : "note"}${n?.synthetic ? " · synth" : ""}</span></button>`;
          })
          .join("")
      : `<div class="panel-empty">—</div>`;

  return `
    <div class="insp-head">
      <span class="eyebrow">Selected note</span>
      <button class="insp-close" data-action="clear-selection" aria-label="Clear selection">×</button>
    </div>

    <div>
      <h1 class="insp-title">${esc(note.title)}</h1>
      <div class="insp-status">
        <span class="status-badge${note.kind === "external" ? " external" : ""}">
          <span style="width:12px;height:12px;display:inline-block">${noteRingHtml(note, 12, false)}</span>
          ${note.kind === "external" ? "external" : statusLabel(note.status)}
          <span class="stage">${note.kind === "external" ? "source" : `${statusStage(note.status)} / 5`}</span>
        </span>
        ${note.synthetic ? `<span class="badge warn">Synthetic</span>` : ""}
        ${reAnchored ? `<span class="badge">Re-anchored · ${esc(state.focus)}</span>` : ""}
      </div>
    </div>

    <p class="insp-excerpt${note.excerpt ? "" : " muted"}">${esc(note.excerpt || "No body text yet.")}</p>

    <div class="divider"></div>

    <section class="insp-section">
      <div class="meta-label">Path</div>
      <div class="path-field">
        <span class="path-text">${esc(notePath)}</span>
        <button class="path-copy" data-action="copy-path" aria-label="Copy path">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="0.5"/><path d="M2.5 8.5V2.5H8.5"/></svg>
        </button>
      </div>
      <div class="path-hint">${isReal ? "Ctrl+O → paste" : "Synthetic fixture path"}</div>
    </section>

    <section class="insp-section">
      <div class="meta-label">Home / tags</div>
      <div class="tag-breadcrumb">${noteHomeHtml(note, model.tagsByName)}</div>
      ${secondary.length ? `<div class="tag-secondary">+ ${secondary.map((t) => esc(t)).join(" · ")}</div>` : ""}
      ${inheritedExtra.length ? `<div class="tag-secondary" style="color:var(--ink-3)">inherited · ${inheritedExtra.map((t) => esc(t)).join(" · ")}</div>` : ""}
    </section>

    <section class="insp-section">
      <div class="meta-label">Index</div>
      <div class="index-line">
        ${homeTag?.isIndex ? `<span class="index-mark"></span><span>${esc(homeTag.name)}</span><span class="badge${cur.kind === "unindexed" ? " warn" : ""}">${indexBadge}</span>` : `<span style="color:var(--ink-3)">No #index note for this home</span>`}
      </div>
      ${alsoCurated.length ? `<div class="tag-secondary">Also curated by · ${alsoCurated.map((t) => esc(t)).join(" · ")}</div>` : ""}
    </section>

    ${note.bridge ? `<section class="insp-section"><div class="meta-label">Bridges</div><div class="index-line"><span class="badge">Span ${note.span}</span><span>${note.bridgeTags.map((t) => `<button class="link-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join(" · ")}</span></div></section>` : ""}

    <section class="insp-section">
      <div class="meta-label">Links · ${note.noteLinks.length}</div>
      ${linkList(note.noteLinks)}
    </section>

    <section class="insp-section">
      <div class="meta-label">Backlinks · ${note.backlinks.length}</div>
      ${linkList(note.backlinks)}
    </section>

    ${cur.kind === "unindexed" && homeTag ? `<div class="curation-note"><span class="diamond"></span><span class="curation-copy">Tagged ${esc(homeTag.name)}, but the ${esc(homeTag.name)} #index note doesn’t list this note. It appears in the branch, not in the curated index.</span></div>` : ""}

    <div class="insp-actions">
      <div class="action-grid">
        ${isReal ? `<a class="btn btn-primary" href="obsidian://open?vault=${encodeURIComponent(model.vault)}&file=${encodeURIComponent(notePath)}">Open note <span class="kbd">↵</span></a>` : `<button class="btn btn-secondary" data-action="copy-path">Copy path</button>`}
        <button class="btn btn-secondary" data-action="${isReal ? "copy-path" : "clear-selection"}">${isReal ? "Copy path" : "Close"}</button>
      </div>
      <button class="text-btn" data-action="copy-wikilink">Copy wikilink</button>
    </div>

    <div class="insp-footer">
      <span>Last edit ${esc(fmtDate(note.date))}</span>
      <span>${note.words ? `${note.words} words` : "no body"}</span>
    </div>`;
}

function toggleBranch(name) {
  if (state.branchCollapsed.has(name)) state.branchCollapsed.delete(name);
  else state.branchCollapsed.add(name);
  renderInspector();
}

function renderInspector() {
  const note = state.selected ? model.notesByTitle.get(state.selected) : null;
  if (note) {
    inspectorEl.innerHTML = noteInspectorHtml(note);
    return;
  }
  const tag = state.focus ? model.tagsByName.get(state.focus) : null;
  if (tag) {
    inspectorEl.innerHTML = tagPanelHtml(tag);
    return;
  }
  inspectorEl.innerHTML = `
    <div class="insp-head"><span class="eyebrow">Overview</span></div>
    <h1 class="insp-title">${model.counts.notes} notes</h1>
    <p class="insp-excerpt">${model.counts.tags} tags · ${model.counts.bridges} bridges · ${model.counts.unindexedNotes} unindexed notes.</p>
    <div class="divider"></div>
    <div class="atlas-empty" style="position:static;padding:0">Select a tag in the rail or a note in the map. The Index tab lists everything; the Bridges lens isolates the cross-category notes.</div>`;
}

function activeStatusFilter() {
  const f = parseQuery(state.query);
  const hit = f.status.find((x) => !x.neg);
  return hit ? hit.value.replace(/^#/, "") : null;
}

function renderFooter() {
  const counts = model.statusCounts;
  const active = activeStatusFilter();
  footerEl.innerHTML = `
    <div class="footer-left">
      <span class="footer-label">Status</span>
      ${STATUS_ORDER.map(
        (k) => `<button class="status-key${active === k ? " active" : ""}" data-status-key="${k}"><span class="sw" style="background:${statusColor(k)}"></span>${statusLabel(k)} <span class="n">${counts[k]}</span></button>`
      ).join("")}
    </div>
    <button class="footer-mid" data-action="all-notes">${model.counts.notes} notes · ${model.counts.tags} tags · ${model.counts.indexes} indexes</button>
    <div class="footer-right">
      ${model.counts.external ? `<button class="review-flag" data-action="show-external"><span class="external-dot" style="background:${externalColor()}"></span>${model.counts.external} external</button>` : ""}
      <button class="review-flag" data-action="show-unindexed"><span class="diamond"></span>${model.counts.unindexedNotes} unindexed</button>
      <span class="egg-mark" title="Butcher’s chart"></span>
    </div>`;
}

function renderSettings() {
  if (!state.settingsOpen) {
    settingsEl.classList.remove("open");
    settingsEl.innerHTML = "";
    return;
  }
  settingsEl.classList.add("open");
  const rows = [...model.tags]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tag) => {
      const meta = state.metaTags.has(tag.name);
      return `
        <button class="settings-row${meta ? " meta" : ""}" data-meta-tag="${esc(tag.name)}">
          <span class="settings-check">${meta ? "✓" : ""}</span>
          ${tag.synthetic ? synthMark() : ""}
          <span class="settings-name">${esc(tag.name)}</span>
          <span class="settings-name" style="flex:none;font-family:var(--font-mono);font-size:7px">${tag.branchCount}</span>
        </button>`;
    })
    .join("");
  settingsEl.innerHTML = `
    <div class="settings-head">
      <span class="settings-title">Meta-tags</span>
      <button class="settings-close" data-action="close-settings">Close</button>
    </div>
    <div class="settings-note">Excluded from bridge detection. Placement, counts, search, and the Atlas are unchanged. This is a view setting; the vault is not edited.</div>
    <div class="settings-list">${rows}</div>
    <div class="settings-foot">
      <span>${state.metaTags.size} flagged</span>
      <button data-action="reset-meta">Reset defaults</button>
    </div>
    ${state.apiAvailable ? `<div class="settings-power"><button data-action="shutdown-server">Shutdown server</button></div>` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Topbar / render                                                     */
/* ------------------------------------------------------------------ */

function renderTopbar() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.view);
  });
  demoBtn.classList.toggle("active", state.demo);
  demoBtn.title = state.demo
    ? "Synthetic demo data is on; click to remove"
    : "Synthetic demo data is off; click to load";
}

function renderAll() {
  document.body.dataset.theme = state.theme;
  state.hover = null;
  renderTopbar();
  renderRail();
  if (state.view === "atlas") {
    stopSimulation();
    const prewarm = state.prewarmGraph || !state.hasRendered;
    state.prewarmGraph = false;
    state.graph = buildGraph({ prewarm });
    mainEl.innerHTML = atlasHtml();
    bindGraphDom();
    applyCamera({ animate: false });
    const animate = state.hasRendered;
    if (state.pendingFit) {
      state.pendingFit = false;
      requestAnimationFrame(() => {
        if (state.view === "atlas") {
          fitGraph({ animate });
          if (state.focus) ensureFocusVisible();
        }
      });
    } else if (state.ensureFocus) {
      state.ensureFocus = false;
      ensureFocusVisible();
    }
    state.hasRendered = true;
    if (!state.simAlpha) state.simAlpha = prewarm ? 0.16 : 0.3;
    startSimulation();
  } else {
    stopSimulation();
    tagResizeObserver?.disconnect();
    state.graph = null;
    mainEl.innerHTML = state.view === "index" ? indexHtml() : bridgesHtml();
  }
  renderInspector();
  renderFooter();
  renderSettings();
}

/* ------------------------------------------------------------------ */
/* Quick switch (Obsidian-style search)                                */
/* ------------------------------------------------------------------ */

function quickItems() {
  if (!model) return [];
  const items = [];
  for (const tag of model.tags) {
    items.push({
      kind: "tag",
      title: tag.name,
      path: tag.path || `3. Tags/${tag.name}`,
      status: tag.isIndex ? "index" : "tag",
      synthetic: tag.synthetic,
      tag,
    });
  }
  for (const note of model.notes) {
    items.push({
      kind: "note",
      title: note.title,
      path: note.path || note.title,
      status: note.kind === "external" ? "external" : note.status || "unfiled",
      synthetic: note.synthetic,
      note,
    });
  }
  return items;
}

function quickScore(item, query) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const title = item.title.toLowerCase();
  const path = item.path.toLowerCase();
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (path === q) return 2;
  if (path.startsWith(q)) return 3;
  if (title.includes(q)) return 4;
  if (path.includes(q)) return 5;
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => title.includes(part) || path.includes(part))) {
    return 6;
  }
  return -1;
}

function quickResults() {
  const q = state.quickQuery.trim();
  return quickItems()
    .map((item, index) => ({ item, index, score: quickScore(item, q) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 80)
    .map((entry) => entry.item);
}

function renderQuickSwitch() {
  if (!quickEl) return;
  if (!state.quickOpen) {
    quickEl.classList.remove("open");
    quickEl.setAttribute("aria-hidden", "true");
    return;
  }
  quickEl.classList.add("open");
  quickEl.setAttribute("aria-hidden", "false");
  if (quickInput && document.activeElement !== quickInput) {
    quickInput.value = state.quickQuery;
  }
  const items = quickResults();
  if (state.quickIndex >= items.length) state.quickIndex = Math.max(0, items.length - 1);
  if (quickCountEl) {
    quickCountEl.textContent = `${items.length} ${items.length === 1 ? "result" : "results"}`;
  }
  if (!quickResultsEl) return;
  if (!items.length) {
    quickResultsEl.innerHTML = `<div class="quick-empty">No notes or tags match.</div>`;
    return;
  }
  quickResultsEl.innerHTML = items
    .map((item, index) => {
      const active = index === state.quickIndex ? " active" : "";
      return `<button class="quick-row${active}" data-quick-kind="${esc(item.kind)}" data-quick-title="${esc(item.title)}">
        <span class="quick-path">${esc(item.path)}</span>
        <span class="quick-badge${item.kind === "note" && item.note?.kind === "external" ? " external" : ""}">${item.kind === "tag" ? "TAG" : item.note?.kind === "external" ? "EXT" : "NOTE"}</span>
        ${item.synthetic ? `<span class="quick-synth">SYNTH</span>` : ""}
      </button>`;
    })
    .join("");
  requestAnimationFrame(() => {
    quickResultsEl.querySelector(".quick-row.active")?.scrollIntoView({ block: "nearest" });
  });
}

function openQuickSwitch() {
  if (!model) return;
  state.quickOpen = true;
  state.quickQuery = "";
  state.quickIndex = 0;
  if (quickInput) quickInput.value = "";
  renderQuickSwitch();
  requestAnimationFrame(() => {
    quickInput?.focus();
    quickInput?.select();
  });
}

function closeQuickSwitch() {
  state.quickOpen = false;
  state.quickQuery = "";
  state.quickIndex = 0;
  renderQuickSwitch();
}

function chooseQuickItem(kind, title) {
  closeQuickSwitch();
  state.view = "atlas";
  if (kind === "tag") {
    focusTag(title);
  } else {
    selectNote(title);
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied`);
  } catch {
    toast(`Copy failed — ${text}`);
  }
}

function focusTag(name) {
  const tag = model.tagsByName.get(name);
  if (!tag) return;
  state.focus = name;
  state.lastFocus = name;
  state.selected = null;
  state.query = tagQuery(name);
  if (state.view === "atlas") {
    state.ensureFocus = true;
    state.simAlpha = Math.max(state.simAlpha, 1);
  }
  renderAll();
}

function selectNote(title) {
  const note = model.notesByTitle.get(title);
  if (!note) return;
  state.selected = title;
  if (state.view === "atlas") {
    if (!state.focus || !noteInTagBranch(note, state.focus)) {
      state.focus = note.home || state.focus;
      state.lastFocus = state.focus || state.lastFocus;
      state.ensureFocus = true;
      state.simAlpha = Math.max(state.simAlpha, 1);
      if (state.focus && !state.query) state.query = tagQuery(state.focus);
    }
  }
  renderAll();
}

function setView(view) {
  const previous = state.view;
  state.view = view;
  if (previous === "atlas" && view !== "atlas") {
    state.focus = null;
    state.query = "";
  }
  if (view === "atlas") {
    if (!state.focus) {
      state.focus = model.tagsByName.has(state.lastFocus)
        ? state.lastFocus
        : state.selected
          ? model.notesByTitle.get(state.selected)?.home || "Math"
          : "Math";
    }
    if (!model.tagsByName.has(state.focus)) state.focus = "Math";
    state.lastFocus = state.focus;
    state.pendingFit = true;
    state.simAlpha = Math.max(state.simAlpha, 0.8);
  }
  renderAll();
}

function allNotes() {
  state.view = "index";
  state.focus = null;
  state.selected = null;
  state.query = "";
  renderAll();
}

function clearSelection() {
  state.selected = null;
  renderAll();
}

function clearFocus() {
  if (state.focus) state.lastFocus = state.focus;
  state.focus = null;
  state.selected = null;
  state.query = "";
  state.ensureFocus = false;
  state.simAlpha = Math.max(state.simAlpha, 1);
  // Keep the camera; notes disappear, the tag graph closes the gap by force.
  renderAll();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  savePrefs();
  document.body.dataset.theme = state.theme;
  renderAll();
}

function toggleDemo() {
  if (!synthetic) {
    toast("No synthetic fixture found");
    return;
  }
  state.demo = !state.demo;
  if (!state.demo) {
    const focusTagObj = model.tagsByName.get(state.focus);
    const selectedNote = state.selected ? model.notesByTitle.get(state.selected) : null;
    if (focusTagObj?.synthetic) {
      state.focus = "Math";
      state.lastFocus = "Math";
      state.query = tagQuery("Math");
      state.ensureFocus = true;
    }
    if (selectedNote?.synthetic) state.selected = null;
    if (state.view === "atlas") {
      state.pendingFit = true;
      state.simAlpha = Math.max(state.simAlpha, 1);
    }
    rebuild();
    renderAll();
    toast("Synthetic layer removed — the real vault is untouched.");
  } else {
    if (state.view === "atlas") {
      state.pendingFit = true;
      state.simAlpha = Math.max(state.simAlpha, 1);
    }
    rebuild();
    renderAll();
    toast("Synthetic layer loaded — demo data only.");
  }
}

async function shutdownServer() {
  if (!state.apiAvailable) {
    toast("Server controls are available only through the local server.");
    return;
  }
  if (!window.confirm("Shut down the local Tag Atlas server?")) return;
  try {
    await fetch("/api/shutdown", { method: "POST" });
    toast("Server stopped. You can close this tab.");
    document.body.classList.add("server-stopped");
  } catch {
    toast("Could not reach the local server.");
  }
}

function toggleMeta(name) {
  if (!model.tagsByName.has(name)) return;
  if (state.metaTags.has(name)) state.metaTags.delete(name);
  else state.metaTags.add(name);
  rebuild();
  renderAll();
  const tag = model.tagsByName.get(name);
  toast(`${name} is ${tag?.meta ? "a meta-tag" : "a topic tag"} — Bridges updated.`);
}

function resetMeta() {
  state.metaTags = new Set(vault.metaDefaults || []);
  rebuild();
  renderAll();
  toast("Meta-tags reset to defaults.");
}

function toggleGroup() {
  state.bridgeGroup = state.bridgeGroup === "span" ? "signature" : "span";
  savePrefs();
  renderAll();
}

function showUnused() {
  const unused = model.tags.filter((t) => t.branchCount === 0).map((t) => t.name);
  toast(unused.length ? `Unused tags: ${unused.join(", ")}` : "No unused tags");
}

function showUnsorted() {
  state.view = "index";
  state.focus = null;
  state.query = "";
  state.selected = model.unfiledNotes[0]?.title || null;
  renderAll();
}

function filterStatus(key) {
  const active = activeStatusFilter() === key;
  if (active) {
    state.query = "";
    renderAll();
    return;
  }
  state.view = "index";
  state.focus = null;
  state.selected = null;
  state.query = `status:${key}`;
  renderAll();
}

function showUnindexed() {
  state.view = "index";
  state.focus = null;
  state.selected = null;
  state.query = "is:unindexed";
  renderAll();
}

function showExternal() {
  state.view = "index";
  state.focus = null;
  state.selected = null;
  state.query = "is:external";
  renderAll();
}



function resetLayout() {
  state.positions.clear();
  state.prewarmGraph = true;
  state.pendingFit = true;
  state.simAlpha = 1;
  renderAll();
  toast("Layout reset — a new force layout is settling.");
}



function toggleForces() {
  state.forcesOpen = !state.forcesOpen;
  renderAll();
}

function focusLast() {
  if (state.lastFocus && model.tagsByName.has(state.lastFocus)) {
    focusTag(state.lastFocus);
  }
}

function handleAction(action) {
  switch (action) {
    case "all-notes":
      allNotes();
      break;
    case "clear-query":
      state.query = "";
      renderAll();
      break;
    case "clear-focus":
      clearFocus();
      break;
    case "focus-last":
      focusLast();
      break;
    case "reset-layout":
      resetLayout();
      break;
    case "toggle-forces":
      toggleForces();
      break;
    case "open-quick":
      openQuickSwitch();
      break;
    case "close-quick":
      closeQuickSwitch();
      break;
    case "zoom-in":
      zoomAt(state.camera.zoom * 1.22);
      state.hasInteracted = true;
      break;
    case "zoom-out":
      zoomAt(state.camera.zoom / 1.22);
      state.hasInteracted = true;
      break;
    case "zoom-reset":
      resetZoom();
      state.hasInteracted = true;
      break;
    case "fit-stage":
      fitGraph({ animate: true, minZoom: 0.3 });
      state.hasInteracted = true;
      break;
    case "toggle-hud":
      state.hudOpen = !state.hudOpen;
      renderAll();
      break;
    case "show-unindexed":
      showUnindexed();
      break;
    case "show-external":
      showExternal();
      break;
    case "clear-selection":
      clearSelection();
      break;
    case "toggle-theme":
      toggleTheme();
      break;
    case "toggle-demo":
    case "clear-demo":
      if (action === "clear-demo" && !state.demo) break;
      toggleDemo();
      break;
    case "open-settings":
      state.settingsOpen = !state.settingsOpen;
      renderSettings();
      break;
    case "close-settings":
      state.settingsOpen = false;
      renderSettings();
      break;
    case "reset-meta":
      resetMeta();
      break;
    case "toggle-group":
      toggleGroup();
      break;
    case "shutdown-server":
      shutdownServer();
      break;
    case "copy-path": {
      const note = model.notesByTitle.get(state.selected);
      if (note) copyText(note.path || note.title, "Path");
      break;
    }
    case "copy-wikilink": {
      const note = model.notesByTitle.get(state.selected);
      if (note) copyText(`[[${note.title}]]`, "Wikilink");
      break;
    }
    case "unused":
      showUnused();
      break;
    case "unsorted":
      showUnsorted();
      break;
    case "open-index":
      state.view = "index";
      renderAll();
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Hover, tooltip, node drag, pan, zoom                                */
/* ------------------------------------------------------------------ */

function tagTooltipHtml(tag) {
  const notes = tag.hasChildren ? tag.branchCount : tag.directCount;
  const childLine = tag.hasChildren
    ? `<span><b>${tag.children.length}</b> ${tag.children.length === 1 ? "tag" : "tags"}</span>`
    : "";
  const coverage = tag.isIndex
    ? `<span><b>${tag.curatedCount}</b> curated</span><span><b>${tag.unindexedCount}</b> unindexed</span>`
    : "";
  return `
    <div class="tooltip-eyebrow">Tag ${tag.isIndex ? "· index" : ""}${tag.meta ? " · meta" : ""}${tag.synthetic ? " · synth" : ""}</div>
    <div class="tooltip-title">${esc(tag.name)}</div>
    <div class="tooltip-meta">
      <span><b>${notes}</b> ${tag.hasChildren ? "branch" : "direct"} notes</span>
      ${childLine}
      <span><b>${tag.anchoredCount}</b> anchored</span>
      <span><b>${tag.linkedCount}</b> linked</span>
      ${coverage}
    </div>
    <div class="tooltip-hint">Click to focus · drag the node to move it</div>`;
}

function noteTooltipHtml(note) {
  const status = note.kind === "external" ? "external · source" : note.status ? `${statusLabel(note.status)} · ${statusStage(note.status)} / 5` : "unfiled";
  const bridge = note.bridge ? `<span><b>span ${note.span}</b> bridge</span>` : "";
  return `
    <div class="tooltip-eyebrow">Note ${note.synthetic ? "· synth" : ""}</div>
    <div class="tooltip-title">${esc(note.title)}</div>
    <div class="tooltip-meta">
      <span>${esc(status)}</span>
      ${note.home ? `<span>home <b>${esc(note.home)}</b></span>` : note.kind === "external" ? `<span>external</span>` : `<span>unfiled</span>`}
      <span><b>${note.tags.length}</b> tags</span>
      ${bridge}
    </div>
    <div class="tooltip-hint">Click to select · drag the node to move it</div>`;
}

function positionTooltip() {
  const tip = mainEl.querySelector(".graph-tooltip");
  if (!tip) return;
  const rect = mainEl.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let x = state.pointer.x - rect.left + 16;
  let y = state.pointer.y - rect.top + 18;
  x = clamp(x, 8, Math.max(8, rect.width - tw - 8));
  y = clamp(y, 8, Math.max(8, rect.height - th - 8));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function applyHoverClasses() {
  const world = mainEl.querySelector(".canvas-world");
  if (!world) return;
  world.querySelectorAll(".is-hover, .is-related").forEach((el) => {
    el.classList.remove("is-hover", "is-related");
  });
  world.querySelectorAll(".graph-edge.is-active").forEach((el) => {
    el.classList.remove("is-active");
  });
  world.classList.toggle("has-hover", Boolean(state.hover));
  if (!state.hover) return;

  const { kind, name } = state.hover;
  if (kind === "tag") {
    const tag = model.tagsByName.get(name);
    world.querySelectorAll("[data-tag]").forEach((el) => {
      if (el.dataset.tag === name) el.classList.add("is-hover");
      if (tag && (tagParents(tag, model.tagsByName).includes(el.dataset.tag) || tag.children.includes(el.dataset.tag))) {
        el.classList.add("is-related");
      }
    });
    world.querySelectorAll(".note[data-note]").forEach((el) => {
      const note = model.notesByTitle.get(el.dataset.note);
      if (note && (note.home === name || note.tags.includes(name))) {
        el.classList.add("is-related");
      }
    });
    world.querySelectorAll(".graph-edge").forEach((line) => {
      if (
        line.dataset.sourceTag === name ||
        line.dataset.targetTag === name ||
        line.dataset.sourceNote === name ||
        line.dataset.targetNote === name
      ) {
        line.classList.add("is-active");
      }
    });
  } else if (kind === "note") {
    const note = model.notesByTitle.get(name);
    if (!note) return;
    world.querySelectorAll(".note[data-note]").forEach((el) => {
      if (el.dataset.note === name) el.classList.add("is-hover");
    });
    const relatedTags = new Set([note.home, ...note.tags].filter(Boolean));
    world.querySelectorAll("[data-tag]").forEach((el) => {
      if (relatedTags.has(el.dataset.tag)) el.classList.add("is-related");
    });
    world.querySelectorAll(".graph-edge").forEach((line) => {
      if (line.dataset.sourceNote === name || line.dataset.targetNote === name) {
        line.classList.add("is-active");
      }
    });
  }
}

function showTooltip() {
  const tip = mainEl.querySelector(".graph-tooltip");
  if (!tip || !state.hover) return;
  if (state.hover.kind === "tag") {
    const tag = model.tagsByName.get(state.hover.name);
    if (!tag) return;
    tip.innerHTML = tagTooltipHtml(tag);
  } else {
    const note = model.notesByTitle.get(state.hover.name);
    if (!note) return;
    tip.innerHTML = noteTooltipHtml(note);
  }
  tip.classList.add("show");
  positionTooltip();
}

function clearHover() {
  state.hover = null;
  const tip = mainEl.querySelector(".graph-tooltip");
  if (tip) tip.classList.remove("show");
  applyHoverClasses();
}

function setHover(kind, name) {
  if (state.hover && state.hover.kind === kind && state.hover.name === name) {
    positionTooltip();
    return;
  }
  state.hover = { kind, name };
  applyHoverClasses();
  showTooltip();
}

function updateHover(event) {
  if (state.nodeDrag || state.pan) return;
  if (event.target.closest(".canvas-tools, .canvas-meta, .forces-pop, .graph-tooltip")) {
    clearHover();
    return;
  }
  const tagEl = event.target.closest(".tag-card[data-tag], .tag-station[data-tag]");
  if (tagEl) {
    setHover("tag", tagEl.dataset.tag);
    return;
  }
  const noteEl = event.target.closest(".note[data-note]");
  if (noteEl) {
    setHover("note", noteEl.dataset.note);
    return;
  }
  clearHover();
}

function nodeAtEvent(event) {
  const el = event.target.closest("[data-node-id]");
  if (!el || !state.graph) return null;
  return state.graph.byId.get(el.dataset.nodeId) || null;
}

function startNodeDrag(event) {
  const node = nodeAtEvent(event);
  if (!node) return;
  clearHover();
  const rect = mainEl.getBoundingClientRect();
  const wx = (event.clientX - rect.left - state.camera.x) / state.camera.zoom;
  const wy = (event.clientY - rect.top - state.camera.y) / state.camera.zoom;
  state.nodeDrag = {
    node,
    offX: node.x - wx,
    offY: node.y - wy,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  try {
    mainEl.setPointerCapture?.(event.pointerId);
  } catch {}
  state.hasInteracted = true;
}

function startCanvasPan(event) {
  clearHover();
  state.pan = {
    type: "canvas",
    startX: event.clientX,
    startY: event.clientY,
    cx: state.camera.x,
    cy: state.camera.y,
    moved: false,
  };
  mainEl.querySelector(".atlas-canvas")?.classList.add("is-panning");
  try {
    mainEl.setPointerCapture?.(event.pointerId);
  } catch {}
  state.hasInteracted = true;
}


function handleCanvasPointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".canvas-tools, .canvas-meta, .forces-pop, .graph-tooltip")) return;
  const node = nodeAtEvent(event);
  if (node) {
    const now = performance.now();
    const tap = state.lastNodeTap;
    if (tap && tap.id === node.id && now - tap.time < 340) {
      // Reliable double-tap/double-click: do not start a drag on the second
      // press; select the node explicitly.
      state.lastNodeTap = null;
      state.suppressClick = true;
      if (node.kind === "tag") focusTag(node.name);
      else if (node.kind === "note") selectNote(node.title);
      event.preventDefault();
      return;
    }
    state.lastNodeTap = { id: node.id, time: now };
    startNodeDrag(event);
    return;
  }
  state.lastNodeTap = null;
  if (event.target.closest(".atlas-canvas")) {
    event.preventDefault();
    startCanvasPan(event);
  }
}

function handleCanvasPointerMove(event) {
  state.pointer = { x: event.clientX, y: event.clientY };
  if (state.nodeDrag) {
    const { node } = state.nodeDrag;
    if (
      !state.nodeDrag.moved &&
      Math.abs(event.clientX - state.nodeDrag.startX) +
        Math.abs(event.clientY - state.nodeDrag.startY) <=
        8
    ) {
      return;
    }
    if (!state.nodeDrag.moved) {
      state.nodeDrag.moved = true;
      state.lastNodeTap = null;
      node.dragging = true;
      node.focusLocked = false;
      node.el?.classList.add("is-dragged");
      state.simAlpha = Math.max(state.simAlpha, 0.55);
      startSimulation();
    }
    const rect = mainEl.getBoundingClientRect();
    const wx = (event.clientX - rect.left - state.camera.x) / state.camera.zoom;
    const wy = (event.clientY - rect.top - state.camera.y) / state.camera.zoom;
    node.x = wx + state.nodeDrag.offX;
    node.y = wy + state.nodeDrag.offY;
    node.vx = 0;
    node.vy = 0;
    const pos = state.positions.get(node.id);
    if (pos) {
      pos.x = node.x;
      pos.y = node.y;
    }
    updateGraphDom();
    state.simAlpha = Math.max(state.simAlpha, 0.45);
    startSimulation();
    return;
  }
  if (state.pan && state.pan.type === "canvas") {
    const dx = event.clientX - state.pan.startX;
    const dy = event.clientY - state.pan.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.pan.moved = true;
    state.camera = {
      x: state.pan.cx + dx,
      y: state.pan.cy + dy,
      zoom: state.camera.zoom,
    };
    applyCamera({ animate: false });
    return;
  }
  updateHover(event);
}

function endCanvasInteraction(event) {
  const wasNode = Boolean(state.nodeDrag);
  const wasPan = Boolean(state.pan);
  const moved = state.nodeDrag?.moved || state.pan?.moved;
  if (wasNode) {
    state.nodeDrag.node.dragging = false;
    state.nodeDrag.node.el?.classList.remove("is-dragged");
    state.nodeDrag = null;
    if (moved) {
      state.simAlpha = Math.max(state.simAlpha, 0.5);
      startSimulation();
    }
  }
  if (wasPan) {
    mainEl.querySelector(".atlas-canvas")?.classList.remove("is-panning");
    state.pan = null;
  }
  if (moved) {
    state.suppressClick = true;
    setTimeout(() => {
      state.suppressClick = false;
    }, 120);
  }
  try {
    if (mainEl.hasPointerCapture?.(event.pointerId)) {
      mainEl.releasePointerCapture(event.pointerId);
    }
  } catch {}
}

function handleWheel(event) {
  if (!event.target.closest(".atlas-canvas")) return;
  if (event.target.closest(".canvas-tools, .canvas-meta, .forces-pop")) return;
  event.preventDefault();
  state.hasInteracted = true;
  clearHover();
  const factor = Math.exp(-event.deltaY * 0.0015);
  zoomAt(state.camera.zoom * factor, event.clientX, event.clientY);
}

function handleDoubleClick(event) {
  if (!event.target.closest(".atlas-canvas")) return;
  const node = nodeAtEvent(event);
  if (node) {
    // Double-click is the deliberate selection gesture; it must not fall
    // through to the old unpin behaviour.
    if (node.kind === "tag") {
      focusTag(node.name);
    } else if (node.kind === "note") {
      selectNote(node.title);
    }
    return;
  }
  if (event.target.closest(".canvas-tools, .canvas-meta, .forces-pop")) return;
  fitGraph({ animate: true, minZoom: 0.3 });
  state.hasInteracted = true;
}

function installCanvasEvents() {
  mainEl.addEventListener("pointerdown", handleCanvasPointerDown);
  mainEl.addEventListener("pointermove", handleCanvasPointerMove);
  mainEl.addEventListener("pointerup", endCanvasInteraction);
  mainEl.addEventListener("pointercancel", endCanvasInteraction);
  mainEl.addEventListener("pointerleave", () => {
    if (!state.nodeDrag && !state.pan) clearHover();
  });
  mainEl.addEventListener("wheel", handleWheel, { passive: false });
  mainEl.addEventListener("dblclick", handleDoubleClick);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.view === "atlas" && !state.nodeDrag && !state.pan) {
        fitGraph({ animate: false });
        measureTagMetrics();
      }
    }, 140);
  });
}

function bindEvents() {
  railListEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".idx-row");
    if (!row || event.target.closest("[data-rail-toggle]")) return;
    event.preventDefault();
    if (row.dataset.tag) focusTag(row.dataset.tag);
    else if (row.dataset.action === "all-notes") allNotes();
  });
  app.addEventListener("click", (event) => {
    if (state.suppressClick) {
      state.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (state.quickOpen) {
      const quickRow = event.target.closest("[data-quick-title]");
      if (quickRow) {
        event.preventDefault();
        chooseQuickItem(quickRow.dataset.quickKind, quickRow.dataset.quickTitle);
        return;
      }
      if (event.target.closest(".quick-switch") && !event.target.closest(".quick-box")) {
        event.preventDefault();
        closeQuickSwitch();
        return;
      }
    }
    const statusEl = event.target.closest("[data-status-key]");
    if (statusEl) {
      event.preventDefault();
      filterStatus(statusEl.dataset.statusKey);
      return;
    }
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      event.preventDefault();
      handleAction(actionEl.dataset.action);
      return;
    }
    const viewEl = event.target.closest("[data-view]");
    if (viewEl) {
      setView(viewEl.dataset.view);
      return;
    }
    const metaEl = event.target.closest("[data-meta-tag]");
    if (metaEl) {
      event.preventDefault();
      toggleMeta(metaEl.dataset.metaTag);
      return;
    }
    const railToggle = event.target.closest("[data-rail-toggle]");
    if (railToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleRail(railToggle.dataset.railToggle);
      return;
    }
    const tagEl = event.target.closest("[data-tag]");
    if (tagEl) {
      event.preventDefault();
      focusTag(tagEl.dataset.tag);
      return;
    }
    const branchToggle = event.target.closest("[data-branch-toggle]");
    if (branchToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleBranch(branchToggle.dataset.branchToggle);
      return;
    }
    const noteEl = event.target.closest("[data-note]");
    if (noteEl) {
      event.preventDefault();
      selectNote(noteEl.dataset.note);
      return;
    }
    if (
      state.view === "atlas" &&
      (state.focus || state.selected) &&
      event.target.closest(".atlas-canvas") &&
      !event.target.closest(
        ".tag-card, .tag-station, .note, .canvas-tools, .canvas-meta, .forces-pop, .graph-tooltip"
      )
    ) {
      event.preventDefault();
      clearFocus();
    }
  });

  app.addEventListener("input", (event) => {
    const slider = event.target.closest("[data-force]");
    if (!slider) return;
    const key = slider.dataset.force;
    const value = Number(slider.value);
    if (!Number.isFinite(value) || state.physics[key] == null) return;
    state.physics[key] = value;
    savePrefs();
    const output = slider.closest(".force-row")?.querySelector("[data-force-value]");
    if (output) {
      output.textContent =
        key === "distance" ? value.toFixed(0) : value.toFixed(2);
    }
    state.simAlpha = 1;
    if (state.graph) {
      for (let i = 0; i < 28; i += 1) stepGraph(state.graph, 1 - i / 36);
      updateGraphDom();
    }
    startSimulation();
  });

  if (quickInput) {
    quickInput.addEventListener("input", () => {
      state.quickQuery = quickInput.value;
      state.quickIndex = 0;
      renderQuickSwitch();
    });

    quickInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        const items = quickResults();
        state.quickIndex = Math.min(items.length - 1, state.quickIndex + 1);
        renderQuickSwitch();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        state.quickIndex = Math.max(0, state.quickIndex - 1);
        renderQuickSwitch();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const item = quickResults()[state.quickIndex];
        if (item) chooseQuickItem(item.kind, item.title);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeQuickSwitch();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (state.quickOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeQuickSwitch();
      }
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "o"
    ) {
      event.preventDefault();
      openQuickSwitch();
      return;
    }
    if (event.key === "/" && !event.target.closest("input, textarea")) {
      event.preventDefault();
      openQuickSwitch();
      return;
    }
    if (
      state.view === "atlas" &&
      !event.target.closest("input, textarea") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        fitGraph({ animate: true, minZoom: 0.3 });
        state.hasInteracted = true;
        return;
      }
      if (key === "0") {
        event.preventDefault();
        resetZoom();
        state.hasInteracted = true;
        return;
      }
      if (key === "+" || key === "=") {
        event.preventDefault();
        zoomAt(state.camera.zoom * 1.22);
        state.hasInteracted = true;
        return;
      }
      if (key === "-" || key === "_") {
        event.preventDefault();
        zoomAt(state.camera.zoom / 1.22);
        state.hasInteracted = true;
        return;
      }
    }
    if (event.key === "Escape") {
      if (state.settingsOpen) {
        state.settingsOpen = false;
        renderSettings();
      } else if (state.selected) {
        clearSelection();
      } else if (state.focus) {
        clearFocus();
      }
    }
  });

}

init().catch((err) => {
  console.error(err);
  mainEl.innerHTML = `<div class="atlas-empty" style="position:static;padding:32px">Failed to load prototype data: ${esc(err.message)}</div>`;
});
