import type { Node, Point, Shape } from "../../../shared/types";

export type ShapeSnapshot = Map<string, Node[]>;

/** Deep copy of the selection's nodes, used as the gesture's source of truth. */
export function snapshotShapes(shapes: Shape[]): ShapeSnapshot {
  return new Map(
    shapes.map((shape) => [
      shape.id,
      shape.nodes.map((node) => ({
        x: node.x,
        y: node.y,
        in: { x: node.in.x, y: node.in.y },
        out: { x: node.out.x, y: node.out.y },
      })),
    ]),
  );
}

/**
 * Writes absolute node positions from the gesture-start snapshot. Working from
 * the snapshot rather than accumulating per-frame deltas keeps document
 * coordinates exact even while snapping switches between targets.
 */
export function translateFromSnapshot(
  shape: Shape,
  snapshot: ShapeSnapshot,
  delta: Point,
) {
  const origin = snapshot.get(shape.id);
  if (!origin) return;
  shape.nodes.forEach((node, index) => {
    const start = origin[index];
    if (!start) return;
    node.x = start.x + delta.x;
    node.y = start.y + delta.y;
    node.in.x = start.in.x + delta.x;
    node.in.y = start.in.y + delta.y;
    node.out.x = start.out.x + delta.x;
    node.out.y = start.out.y + delta.y;
  });
}
