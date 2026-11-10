/* Tag Atlas prototype — world and force-layout seeds.
   No node positions are hard-coded. Seeds are deterministic; the
   force simulation owns the final layout. */

export const WORLD = { w: 1600, h: 1200 };

export const FORCE_DEFAULTS = {
  center: 0.5,
  repel: 10.3,
  link: 0.68,
  distance: 172,
  cohesion: 0.18,
};

export function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function seedForTag(name, index, total) {
  const angle = index * 2.399963229728653 + hashString(name) * 0.9;
  const radius = 110 + 470 * Math.sqrt((index + 0.7) / Math.max(1, total));
  return {
    x: WORLD.w / 2 + Math.cos(angle) * radius * 1.08,
    y: WORLD.h / 2 + Math.sin(angle) * radius * 0.84,
  };
}

export function seedForNote(note, homeNode, index) {
  const angle = hashString(note.title) * Math.PI * 2 + index * 0.7;
  const radius = 52 + (index % 4) * 18;
  return {
    x: (homeNode?.x ?? WORLD.w / 2) + Math.cos(angle) * radius,
    y: (homeNode?.y ?? WORLD.h / 2) + Math.sin(angle) * radius,
  };
}

export function tagNodeSize(tag, focused = false) {
  if (focused) return { w: 180, h: 62 };
  const nameWidth = String(tag.name).length * 6.9 + 58;
  const w = Math.max(94, Math.min(206, nameWidth));
  return { w, h: 38 };
}

export const noteNodeSize = { w: 222, h: 34 };
