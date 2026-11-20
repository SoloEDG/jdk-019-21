import type { Node, Point, Shape } from "../../../shared/types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CurveSegment {
  shape: Shape;
  index: number;
  a: Node;
  b: Node;
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance2(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Cubic segments that the path renderer actually draws. */
export function segmentsOf(shape: Shape): CurveSegment[] {
  const nodes = shape.nodes;
  if (nodes.length < 2) return [];
  const segments: CurveSegment[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    segments.push({ shape, index: i, a: nodes[i], b: nodes[i + 1] });
  }
  if (shape.closed) {
    segments.push({
      shape,
      index: nodes.length - 1,
      a: nodes[nodes.length - 1],
      b: nodes[0],
    });
  }
  return segments;
}

export function cubicPoint(segment: CurveSegment, t: number): Point {
  const { a, b } = segment;
  const mt = 1 - t;
  const w0 = mt * mt * mt;
  const w1 = 3 * mt * mt * t;
  const w2 = 3 * mt * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * a.out.x + w2 * b.in.x + w3 * b.x,
    y: w0 * a.y + w1 * a.out.y + w2 * b.in.y + w3 * b.y,
  };
}

/** Unit tangent of a cubic at t, or a zero vector for a degenerate segment. */
export function cubicTangent(segment: CurveSegment, t: number): Point {
  const { a, b } = segment;
  const mt = 1 - t;
  const w0 = 3 * mt * mt;
  const w1 = 6 * mt * t;
  const w2 = 3 * t * t;
  const x =
    w0 * (a.out.x - a.x) + w1 * (b.in.x - a.out.x) + w2 * (b.x - b.in.x);
  const y =
    w0 * (a.out.y - a.y) + w1 * (b.in.y - a.out.y) + w2 * (b.y - b.in.y);
  const length = Math.hypot(x, y);
  return length > 1e-9 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function curvePoints(segment: CurveSegment, steps = 16): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) =>
    cubicPoint(segment, i / steps),
  );
}

/**
 * Real nearest point on a cubic segment: coarse sampling followed by a
 * ternary refinement. Long curves therefore snap in their middle instead of
 * only offering the two anchors at the ends.
 */
export function nearestOnSegment(
  segment: CurveSegment,
  point: Point,
  steps = 12,
): { point: Point; t: number; distance: number } {
  let bestIndex = 0;
  let bestSquared = Infinity;
  for (let i = 0; i <= steps; i++) {
    const squared = distance2(cubicPoint(segment, i / steps), point);
    if (squared < bestSquared) {
      bestSquared = squared;
      bestIndex = i;
    }
  }
  const step = 1 / steps;
  let lo = Math.max(0, (bestIndex - 1) * step);
  let hi = Math.min(1, (bestIndex + 1) * step);
  // Refining the bracket by (2/3)^n converges fast; 12 rounds already give
  // sub-thousandth-of-a-unit accuracy, far beyond what a 12 px capture needs.
  for (let i = 0; i < 12; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (
      distance2(cubicPoint(segment, m1), point) <
      distance2(cubicPoint(segment, m2), point)
    ) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  const t = (lo + hi) / 2;
  const nearest = cubicPoint(segment, t);
  return { point: nearest, t, distance: distance(nearest, point) };
}

export function shapeBounds(shape: Shape): Bounds {
  const points: Point[] = [...shape.nodes];
  for (const segment of segmentsOf(shape)) {
    points.push(...curvePoints(segment, 12));
  }
  return boundsOf(points);
}

export function boundsOf(points: Point[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(list: Bounds[]): Bounds {
  if (!list.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return list.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY),
  }));
}

/** Distance from a point to a box; 0 when the point is inside. */
export function distanceToBounds(point: Point, b: Bounds) {
  const dx = Math.max(b.minX - point.x, 0, point.x - b.maxX);
  const dy = Math.max(b.minY - point.y, 0, point.y - b.maxY);
  return Math.hypot(dx, dy);
}

export function boundsOverlap(a: Bounds, b: Bounds, margin = 0) {
  return (
    a.minX - margin <= b.maxX &&
    a.maxX + margin >= b.minX &&
    a.minY - margin <= b.maxY &&
    a.maxY + margin >= b.minY
  );
}

export function overlapsOnY(a: Bounds, b: Bounds) {
  return Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.5;
}

export function overlapsOnX(a: Bounds, b: Bounds) {
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.5;
}

export function roundLabel(value: number) {
  return Math.round(value * 10) / 10;
}
