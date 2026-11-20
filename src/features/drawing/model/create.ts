import { doc } from "../../../shared/document";
import type { Point, Shape } from "../../../shared/types";
export function create(p: Point) {
  const s: Shape = {
    id: crypto.randomUUID(),
    name: "Pen path",
    nodes: [],
    closed: false,
    fill: "none",
    stroke: "#7754dc",
    width: 3,
    opacity: 1,
  };
  doc.shapes.push(s);
  doc.selected = [s.id];
  // Return the reactive proxy, not the raw object: mutations made through the
  // raw shape would bypass reactivity and never reach autosave.
  return doc.shapes[doc.shapes.length - 1];
}
export function add(s: Shape, p: Point) {
  s.nodes.push({ ...p, in: { ...p }, out: { ...p } });
}
