import { doc } from "../../../shared/document";

/**
 * Selects a shape (and its group siblings). Hidden and locked shapes cannot be
 * picked from the canvas; the layer row's eye/lock buttons are how they are
 * toggled back into reach. Returns false when nothing could be selected.
 */
export function select(id: string, multi: boolean) {
  const s = doc.shapes.find((s) => s.id === id);
  if (!s || s.hidden || s.locked) return false;
  const ids = s.group
    ? doc.shapes
        .filter((x) => x.group === s.group && !x.hidden && !x.locked)
        .map((x) => x.id)
    : [id];
  doc.selected = multi ? [...new Set([...doc.selected, ...ids])] : ids;
  return true;
}

/** Shapes that may be edited directly: selected, visible and not locked. */
export function selectedShapes() {
  return doc.shapes.filter(
    (s) => doc.selected.includes(s.id) && !s.hidden && !s.locked,
  );
}
