import { beginEdit } from "../../drawing";
import { doc } from "../../../shared/document";
import { isEditable } from "./visibility";

export function group() {
  const selected = doc.shapes.filter(
    (s) => doc.selected.includes(s.id) && isEditable(s),
  );
  if (selected.length < 2) return;
  beginEdit();
  const id = crypto.randomUUID();
  selected.forEach((s) => (s.group = id));
  const ids = new Set(selected.map((s) => s.id));
  const top = doc.shapes.map((s) => ids.has(s.id)).lastIndexOf(true);
  const below = doc.shapes.slice(0, top + 1).filter((s) => !ids.has(s.id));
  const above = doc.shapes.slice(top + 1);
  doc.shapes = [...below, ...selected, ...above];
}

export function reorder(delta: number) {
  const first = doc.shapes.find(
    (s) => doc.selected.includes(s.id) && isEditable(s),
  );
  if (!first) return;
  const blocks: (typeof doc.shapes)[] = [];
  for (const shape of doc.shapes) {
    const last = blocks.at(-1);
    if (shape.group && last?.[0].group === shape.group) last.push(shape);
    else blocks.push([shape]);
  }
  const i = blocks.findIndex((b) => b.some((s) => s.id === first.id)),
    j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  beginEdit();
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  doc.shapes = blocks.flat();
}

export function remove() {
  const removable = doc.shapes.filter(
    (s) => doc.selected.includes(s.id) && !s.locked,
  );
  if (!removable.length) return;
  beginEdit();
  const ids = new Set(removable.map((s) => s.id));
  doc.shapes = doc.shapes.filter((s) => !ids.has(s.id));
  doc.selected = doc.selected.filter((id) => !ids.has(id));
}
