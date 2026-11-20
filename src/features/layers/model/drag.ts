import { doc } from "../../../shared/document";
import { translate } from "../lib/translate";

/** Rigid translation of the current selection (keyboard nudges, etc.). */
export function translateSelected(x: number, y: number) {
  doc.shapes
    .filter((s) => doc.selected.includes(s.id) && !s.hidden && !s.locked)
    .forEach((s) => translate(s, x, y));
}
