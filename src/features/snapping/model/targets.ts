import type { Point, Shape } from "../../../shared/types";
import {
  boundsOverlap,
  distance2,
  distanceToBounds,
  nearestOnSegment,
  segmentsOf,
  shapeBounds,
  type Bounds,
  type CurveSegment,
} from "../lib/geometry";

export interface TargetShape {
  shape: Shape;
  bounds: Bounds;
  segments: CurveSegment[];
}

export interface TargetAnchor {
  shape: Shape;
  nodeIndex: number;
  point: Point;
}

export interface TargetIntersection {
  point: Point;
  a: Shape;
  b: Shape;
}

/**
 * Snap targets for one gesture. Shapes in `exclude` (the objects being
 * dragged) are removed first; hidden or locked shapes never enter the set, so
 * no later stage can pick them as a valid target.
 */
export interface Targets {
  shapes: TargetShape[];
  anchors: TargetAnchor[];
  intersections: TargetIntersection[];
}

export function isSnappable(shape: Shape) {
  return !shape.hidden && !shape.locked && shape.nodes.length > 0;
}

export function buildTargets(
  shapes: Shape[],
  exclude: ReadonlySet<string> = new Set(),
): Targets {
  const targets: Targets = { shapes: [], anchors: [], intersections: [] };
  for (const shape of shapes) {
    if (exclude.has(shape.id) || !isSnappable(shape)) continue;
    const segments = segmentsOf(shape);
    targets.shapes.push({ shape, bounds: shapeBounds(shape), segments });
    shape.nodes.forEach((node, nodeIndex) =>
      targets.anchors.push({ shape, nodeIndex, point: node }),
    );
  }
  targets.intersections = findIntersections(targets.shapes);
  return targets;
}

/**
 * Visible curve crossings, computed once per gesture. Pairs whose bounds do
 * not overlap are skipped, so distant curves cost nothing and only real
 * crossings become targets.
 */
function findIntersections(list: TargetShape[]): TargetIntersection[] {
  const hits: TargetIntersection[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      // A small padding still catches curves that touch tangentially.
      if (!boundsOverlap(a.bounds, b.bounds, 4)) continue;
      for (const sa of a.segments) {
        for (const sb of b.segments) {
          for (const point of intersectionsOf(sa, sb)) {
            if (hits.some((h) => distance2(h.point, point) < 0.25)) continue;
            hits.push({ point, a: a.shape, b: b.shape });
          }
        }
      }
    }
  }
  return hits;
}

/** Polyline crossing test; exact enough for guides and cheap enough to cache. */
export function intersectionsOf(a: CurveSegment, b: CurveSegment): Point[] {
  const p = flatten(a, 20);
  const q = flatten(b, 20);
  const hits: Point[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p1 = p[i];
    const p2 = p[i + 1];
    const d1x = p2.x - p1.x;
    const d1y = p2.y - p1.y;
    for (let j = 0; j < q.length - 1; j++) {
      const q1 = q[j];
      const q2 = q[j + 1];
      const d2x = q2.x - q1.x;
      const d2y = q2.y - q1.y;
      const denominator = d1x * d2y - d1y * d2x;
      if (Math.abs(denominator) < 1e-12) continue;
      const t = ((q1.x - p1.x) * d2y - (q1.y - p1.y) * d2x) / denominator;
      const u = ((q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x) / denominator;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const point = { x: p1.x + d1x * t, y: p1.y + d1y * t };
      if (hits.some((h) => distance2(h, point) < 0.2)) continue;
      hits.push(point);
    }
  }
  return hits;
}

function flatten(segment: CurveSegment, steps: number) {
  const { a, b } = segment;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const mt = 1 - t;
    const w0 = mt * mt * mt;
    const w1 = 3 * mt * mt * t;
    const w2 = 3 * mt * t * t;
    const w3 = t * t * t;
    return {
      x: w0 * a.x + w1 * a.out.x + w2 * b.in.x + w3 * b.x,
      y: w0 * a.y + w1 * a.out.y + w2 * b.in.y + w3 * b.y,
    };
  });
}

export interface CurveHit {
  shape: Shape;
  segment: CurveSegment;
  point: Point;
  t: number;
  distance: number;
}

/** Nearest point over every eligible curve, not just anchors. */
export function nearestOnCurves(targets: Targets, point: Point): CurveHit | null {
  return nearestOnCurvesWithin(targets, point, Infinity);
}

/**
 * Nearest point with a cheap bounds pre-test. Shapes whose bounding box is
 * farther than `maxDistance` cannot hold the nearest point, so long paths far
 * from the pointer cost no segment flattening at all.
 */
export function nearestOnCurvesWithin(
  targets: Targets,
  point: Point,
  maxDistance: number,
): CurveHit | null {
  let best: CurveHit | null = null;
  for (const target of targets.shapes) {
    if (distanceToBounds(point, target.bounds) > maxDistance) continue;
    for (const segment of target.segments) {
      const hit = nearestOnSegment(segment, point, 20);
      if (!best || hit.distance < best.distance) {
        best = {
          shape: target.shape,
          segment,
          point: hit.point,
          t: hit.t,
          distance: hit.distance,
        };
      }
    }
  }
  return best;
}
