import { doc } from "../../../shared/document";
import type { Shape } from "../../../shared/types";

/**
 * Shapes eligible for editing and snapping. Hidden shapes are not drawn;
 * locked shapes are drawn but neither edited nor used as snap targets.
 */
export function isEditable(shape: Shape) {
  return !shape.hidden && !shape.locked;
}

export function toggleHidden(id: string) {
  const shape = doc.shapes.find((s) => s.id === id);
  if (!shape) return;
  shape.hidden = !shape.hidden;
  if (shape.hidden) doc.selected = doc.selected.filter((x) => x !== id);
}

export function toggleLocked(id: string) {
  const shape = doc.shapes.find((s) => s.id === id);
  if (!shape) return;
  shape.locked = !shape.locked;
  if (shape.locked) doc.selected = doc.selected.filter((x) => x !== id);
}
