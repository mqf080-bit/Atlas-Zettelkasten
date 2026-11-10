/* Shared render helpers for the prototype */

export const STATUS = {
  raw: { hex: "#ff9494", stage: 1, label: "#raw", name: "RAW" },
  "3rd": { hex: "#feb867", stage: 2, label: "#3rd", name: "3RD" },
  "5th": { hex: "#a7e052", stage: 3, label: "#5th", name: "5TH" },
  "7th": { hex: "#70ffd4", stage: 4, label: "#7th", name: "7TH" },
  thesis: { hex: "#2d2afe", stage: 5, label: "#thesis", name: "THESIS" },
};

const RING_LIGHT = {
  raw: "#d96f6f",
  "3rd": "#cf8a3a",
  "5th": "#7d9f38",
  "7th": "#3a9e86",
  thesis: "#2d2afe",
};

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function fmtDate(date) {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${d} ${months[Number(m) - 1] || ""} ${y}`;
}

function arcPath(cx, cy, r, a0, a1) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 0 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

export function ringSVG(statusKey, size = 16, selected = false) {
  const st = STATUS[statusKey] || STATUS.raw;
  const isLight = document.body.dataset.theme === "light";
  const arcColor = isLight ? (RING_LIGHT[statusKey] || st.hex) : st.hex;
  const cx = 10;
  const cy = 10;
  const r = 7.2;
  const thickness = selected ? 2.6 : 2.3;
  const arcs = [];
  for (let i = 0; i < 5; i += 1) {
    const a0 = -90 + i * 72 + 7;
    const a1 = a0 + 58;
    const on = i < st.stage;
    arcs.push(
      `<path d="${arcPath(cx, cy, r, a0, a1)}" fill="none" stroke="${on ? arcColor : "var(--ring-off)"}" stroke-width="${thickness}" stroke-linecap="butt"/>`
    );
  }
  let extra = "";
  if (statusKey === "thesis") {
    extra += `<circle cx="10" cy="10" r="8.75" fill="none" stroke="var(--thesis-edge)" stroke-width="0.7" opacity="0.8"/>`;
  } else if (!selected) {
    extra += `<circle cx="10" cy="10" r="8.55" fill="none" stroke="var(--ring-edge)" stroke-width="0.55" opacity="0.55"/>`;
  }
  if (selected) {
    extra += `<circle cx="10" cy="10" r="9.0" fill="none" stroke="var(--ink)" stroke-width="0.8" opacity="0.24"/>`;
  }
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">${arcs.join("")}${extra}<circle cx="10" cy="10" r="${selected ? 3.1 : 2.7}" fill="${st.hex}" stroke="var(--ring-edge)" stroke-width="0.45"/></svg>`;
}

export function barSegments(dist) {
  let html = "";
  for (const key of ["raw", "3rd", "5th", "7th", "thesis"]) {
    const n = dist?.[key] || 0;
    if (!n) continue;
    html += `<span class="seg" style="flex:${n};background:${STATUS[key].hex}"></span>`;
  }
  return html || `<span class="seg empty" style="flex:1"></span>`;
}

export function statusLabel(status) {
  return STATUS[status]?.label || "—";
}

export function statusStage(status) {
  return STATUS[status]?.stage || 0;
}

export function synthBadge() {
  return `<span class="synth-badge">SYNTH</span>`;
}

export function synthMark() {
  return `<span class="synth-mark" title="Synthetic demo data"></span>`;
}

export function chevronDown() {
  return `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M2 3l2 2 2-2"/></svg>`;
}

export function chevronRight() {
  return `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M3 2l2 2-2 2"/></svg>`;
}

export function homeMark() {
  return `<span class="home-mark" title="Home anchor"></span>`;
}

export function tagParents(tag, tagsByName) {
  const out = [];
  let cur = tagsByName.get(tag?.parent);
  const seen = new Set();
  while (cur && !seen.has(cur.name)) {
    seen.add(cur.name);
    out.unshift(cur.name);
    cur = tagsByName.get(cur.parent);
  }
  return out;
}

export function noteHomeHtml(note, tagsByName) {
  if (!note.home) return `<span style="color:var(--ink-3)">—</span>`;
  const parents = tagParents(tagsByName.get(note.home), tagsByName);
  const bits = [];
  for (const p of parents) bits.push(`<span class="ancestor">${esc(p)}</span>`);
  bits.push(`${homeMark()}${esc(note.home)}`);
  return bits.join(`<span class="slash">/</span>`);
}

export function noteSecondary(note) {
  if (!note.tags || note.tags.length <= 1) return "";
  const extras = note.tags.filter((t) => t !== note.home);
  if (!extras.length) return "";
  return `<span class="plus">+${extras.length}</span>`;
}
