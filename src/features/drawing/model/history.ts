import { ref } from "vue";
import { doc } from "../../../shared/document";
const past: string[] = [];
const future: string[] = [];
export const revision = ref(0);

/** Snapshot taken when a pointer gesture starts; pushed on release only. */
let pending: string | null = null;

/** Immediate, discrete edit (style change, layer action, …). */
export function beginEdit() {
  past.push(JSON.stringify(doc.shapes));
  if (past.length > 100) past.shift();
  future.length = 0;
}

/**
 * Starts a continuous gesture (drag, pen stroke, handle drag). The snapshot is
 * only recorded on release and only if the document actually changed, so a
 * whole drag yields exactly one undoable operation and a click without
 * movement yields none.
 */
export function beginGesture() {
  // Keep the earliest snapshot if a gesture is already in flight, so nested
  // pointer handling can never lose the true "before" state.
  if (pending === null) pending = JSON.stringify(doc.shapes);
}

export function commitGesture() {
  if (pending === null) return;
  const before = pending;
  pending = null;
  if (before === JSON.stringify(doc.shapes)) return;
  past.push(before);
  if (past.length > 100) past.shift();
  future.length = 0;
}

/** Aborts a gesture and restores the state captured at its start. */
export function cancelGesture() {
  if (pending === null) return;
  const before = pending;
  pending = null;
  if (before === JSON.stringify(doc.shapes)) return;
  doc.shapes = JSON.parse(before);
  doc.selected = doc.selected.filter((id) =>
    doc.shapes.some((s) => s.id === id),
  );
  revision.value++;
}

function install(snapshot: string) {
  doc.shapes = JSON.parse(snapshot);
  doc.selected = doc.selected.filter((id) =>
    doc.shapes.some((s) => s.id === id),
  );
  revision.value++;
}
export function undo() {
  const state = past.pop();
  if (state) {
    future.push(JSON.stringify(doc.shapes));
    install(state);
  }
}
export function redo() {
  const state = future.pop();
  if (state) {
    past.push(JSON.stringify(doc.shapes));
    install(state);
  }
}

/**
 * Drops all history. Used when a document is loaded from storage so the first
 * undo cannot wipe the freshly restored artwork.
 */
export function resetHistory() {
  past.length = 0;
  future.length = 0;
  pending = null;
}
