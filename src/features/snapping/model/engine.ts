import type { Point, Shape } from "../../../shared/types";
import {
  boundsOf,
  cubicTangent,
  overlapsOnX,
  overlapsOnY,
  roundLabel,
  unionBounds,
  type Bounds,
  type CurveSegment,
} from "../lib/geometry";
import {
  nearestOnCurvesWithin,
  type TargetShape,
  type Targets,
} from "./targets";
import { hold, select } from "./resolve";
import {
  snapSettings,
  type Guide,
  type SnapCandidate,
  type SnapSession,
} from "./types";

/** A candidate together with the overlay geometry that explains what it hit. */
export interface Capture extends SnapCandidate {
  point: Point;
  guides: Guide[];
}

/* ------------------------------------------------------------------ */
/* Screen-space mapping                                                */
/* ------------------------------------------------------------------ */

/** Linear part of the document→screen matrix (rotation and scale included). */
export interface ScreenMap {
  a: number;
  b: number;
  c: number;
  d: number;
  /** Average axis scale, used to convert a pixel budget into user units. */
  scale: number;
}

export const identityMap: ScreenMap = { a: 1, b: 0, c: 0, d: 1, scale: 1 };

/**
 * The live CTM keeps snap distances in CSS pixels even when the artboard is
 * zoomed, rotated or placed inside a transformed group. The resolved point is
 * still a document coordinate, so precision is unaffected.
 */
export function screenMap(svg: SVGSVGElement | null): ScreenMap {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return identityMap;
  const scale =
    (Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d)) / 2;
  return {
    a: matrix.a,
    b: matrix.b,
    c: matrix.c,
    d: matrix.d,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

/** Exact screen-pixel distance between two document positions. */
export function screenLength(from: Point, to: Point, map: ScreenMap) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(map.a * dx + map.c * dy, map.b * dx + map.d * dy);
}

/** Converts a screen-pixel budget into document units at this mapping. */
export function screenToDocument(pixels: number, map: ScreenMap) {
  return pixels / map.scale;
}

/** A target may be toggled hidden/locked mid-gesture; re-check every frame. */
function live(shape: Shape) {
  return !shape.hidden && !shape.locked;
}

/* ------------------------------------------------------------------ */
/* Guide builders                                                      */
/* ------------------------------------------------------------------ */

function marker(kind: Guide["kind"], label: string, point: Point): Guide {
  return { kind, label, points: [{ x: point.x, y: point.y }] };
}

function line(
  kind: Guide["kind"],
  label: string,
  from: Point,
  to: Point,
  extra: Partial<Guide> = {},
): Guide {
  return {
    kind,
    label,
    points: [
      { x: from.x, y: from.y },
      { x: to.x, y: to.y },
    ],
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Point candidates                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every nearby point target for a raw document position. Distances are
 * measured in screen pixels, so the capture radius does not change with zoom,
 * rotation or group scaling.
 */
export function pointCaptures(
  raw: Point,
  targets: Targets,
  map: ScreenMap,
): Capture[] {
  // The capture window is wider than the capture radius so a held target can
  // stay honoured while the pointer drifts (see `select`). Eligibility is
  // still decided by `radius` in `select`.
  const radius = snapSettings.radius * 1.5;
  const captures: Capture[] = [];
  if (snapSettings.anchors) {
    for (const anchor of targets.anchors) {
      if (!live(anchor.shape)) continue;
      const distance = screenLength(raw, anchor.point, map);
      if (distance > radius) continue;
      const label = `Anchor ${anchor.nodeIndex + 1} · ${anchor.shape.name}`;
      captures.push({
        kind: "anchor",
        label,
        point: { x: anchor.point.x, y: anchor.point.y },
        distance,
        priority: 2.5,
        key: `anchor:${anchor.shape.id}:${anchor.nodeIndex}`,
        guides: [marker("anchor", label, anchor.point)],
      });
    }
  }
  if (snapSettings.intersections) {
    targets.intersections.forEach((hit, index) => {
      if (!live(hit.a) || !live(hit.b)) return;
      const distance = screenLength(raw, hit.point, map);
      if (distance > radius) return;
      const label = `Intersection · ${hit.a.name} × ${hit.b.name}`;
      captures.push({
        kind: "intersection",
        label,
        point: { x: hit.point.x, y: hit.point.y },
        distance,
        priority: 3,
        key: `intersection:${hit.a.id}:${hit.b.id}:${index}`,
        guides: [marker("intersection", label, hit.point)],
      });
    });
  }
  if (snapSettings.curves) {
    // Only shapes whose bounds are within the capture window are considered,
    // so long paths elsewhere on the artboard cost nothing.
    const hit = nearestOnCurvesWithin(
      targets,
      raw,
      screenToDocument(snapSettings.radius * 1.5, map),
    );
    if (hit && live(hit.shape)) {
      const distance = screenLength(raw, hit.point, map);
      if (distance <= radius) {
        const label = `Curve · ${hit.shape.name}`;
        captures.push({
          kind: "curve",
          label,
          point: { x: hit.point.x, y: hit.point.y },
          distance,
          priority: 0.5,
          key: `curve:${hit.shape.id}:${hit.segment.index}`,
          guides: curveGuides(hit.segment, hit.t, hit.point, label, map),
        });
      }
    }
  }
  return captures;
}

function curveGuides(
  segment: CurveSegment,
  t: number,
  point: Point,
  label: string,
  map: ScreenMap,
) {
  const tangent = cubicTangent(segment, t);
  const reach = screenToDocument(36, map);
  return [
    line(
      "curve",
      label,
      { x: point.x - tangent.x * reach, y: point.y - tangent.y * reach },
      { x: point.x + tangent.x * reach, y: point.y + tangent.y * reach },
    ),
    marker("curve", label, point),
  ];
}

/* ------------------------------------------------------------------ */
/* Point snapping                                                      */
/* ------------------------------------------------------------------ */

export interface PointSnapOptions {
  map: ScreenMap;
  session: SnapSession;
}

/** Snap a single point (a dragged anchor, a pen node, …). */
export function snapPoint(
  raw: Point,
  targets: Targets,
  options: PointSnapOptions,
): { point: Point; target?: Capture; guides: Guide[] } {
  const captures = pointCaptures(raw, targets, options.map);
  const target = select(captures, options.session.point);
  hold(options.session.point, target);
  return {
    point: target ? { x: target.point.x, y: target.point.y } : raw,
    target,
    guides: target ? target.guides : [],
  };
}

export interface HandleSnapOptions extends PointSnapOptions {
  /** The anchor the handle rotates around. */
  anchor: Point;
  /** False where a handle is initialised rather than aimed (pen tool). */
  enabled?: boolean;
}

/**
 * Snap a bezier handle onto the tangent direction of a nearby curve. The curve
 * is chosen by proximity to the pointer; only its direction is adopted, so the
 * handle keeps the length the user dragged and the result stays in document
 * coordinates. The trigger is a small perpendicular deviation in screen pixels
 * (equivalently a small angle), which is what makes the snap feel stable.
 */
export function snapHandle(
  raw: Point,
  targets: Targets,
  options: HandleSnapOptions,
): { point: Point; target?: Capture; guides: Guide[] } {
  if (options.enabled === false || !snapSettings.tangents) {
    hold(options.session.point);
    return { point: raw, guides: [] };
  }
  // The pointer must be near the reference curve; a little further than point
  // snapping so the direction can be picked just before landing on it.
  const hit = nearestOnCurvesWithin(
    targets,
    raw,
    screenToDocument(snapSettings.radius * 3, options.map),
  );
  if (!hit || !live(hit.shape)) {
    hold(options.session.point);
    return { point: raw, guides: [] };
  }
  if (screenLength(raw, hit.point, options.map) > snapSettings.radius * 3) {
    hold(options.session.point);
    return { point: raw, guides: [] };
  }
  const tangent = cubicTangent(hit.segment, hit.t);
  const vx = raw.x - options.anchor.x;
  const vy = raw.y - options.anchor.y;
  const handleLength = Math.hypot(vx, vy);
  if (handleLength < 1e-6) {
    hold(options.session.point);
    return { point: raw, guides: [] };
  }
  // Perpendicular offset from the pointer to the tangent line through the
  // anchor. Rotating the handle onto that line moves the endpoint by exactly
  // this amount, so the pixel budget means what the user sees.
  const deviation =
    Math.abs(vx * tangent.y - vy * tangent.x) * options.map.scale;
  if (deviation > snapSettings.radius) {
    hold(options.session.point);
    return { point: raw, guides: [] };
  }
  const along = vx * tangent.x + vy * tangent.y;
  const sign = along < 0 ? -1 : 1;
  const point = {
    x: options.anchor.x + tangent.x * handleLength * sign,
    y: options.anchor.y + tangent.y * handleLength * sign,
  };
  const label = `Tangent · ${hit.segment.shape.name}`;
  const reachLine = handleLength * 1.5;
  const guides = [
    line(
      "tangent",
      label,
      {
        x: options.anchor.x - tangent.x * reachLine,
        y: options.anchor.y - tangent.y * reachLine,
      },
      {
        x: options.anchor.x + tangent.x * reachLine,
        y: options.anchor.y + tangent.y * reachLine,
      },
      { dashed: true },
    ),
    marker("tangent", label, hit.point),
  ];
  const capture: Capture = {
    kind: "tangent",
    label,
    point,
    distance: deviation,
    priority: 1,
    key: `tangent:${hit.segment.shape.id}:${hit.segment.index}`,
    guides,
  };
  const target = select([capture], options.session.point);
  hold(options.session.point, target);
  return target
    ? { point: { x: target.point.x, y: target.point.y }, target, guides }
    : { point: raw, guides: [] };
}

/* ------------------------------------------------------------------ */
/* Rigid moves and equal spacing                                       */
/* ------------------------------------------------------------------ */

export interface Probe {
  /** Original (pre-drag) document position. */
  point: Point;
  key: string;
}

export function selectionBounds(shapes: Shape[]): Bounds {
  return unionBounds(
    shapes.map((shape) =>
      boundsOf(shape.nodes.flatMap((n) => [n, n.in, n.out])),
    ),
  );
}

/** Every anchor plus the four selection corners can pull a rigid move. */
export function moveProbes(shapes: Shape[]): Probe[] {
  const probes: Probe[] = [];
  for (const shape of shapes) {
    shape.nodes.forEach((node, index) =>
      probes.push({
        point: { x: node.x, y: node.y },
        key: `n:${shape.id}:${index}`,
      }),
    );
  }
  const bounds = selectionBounds(shapes);
  const corners: [string, Point][] = [
    ["tl", { x: bounds.minX, y: bounds.minY }],
    ["tr", { x: bounds.maxX, y: bounds.minY }],
    ["bl", { x: bounds.minX, y: bounds.maxY }],
    ["br", { x: bounds.maxX, y: bounds.maxY }],
  ];
  for (const [key, point] of corners) probes.push({ point, key: `box:${key}` });
  return probes;
}

export interface SpacingCandidate extends SnapCandidate {
  axis: "x" | "y";
  /** Which box edge lands on the reference gap. */
  edge: "lo" | "hi";
  /** Exact document coordinate that edge must reach. */
  position: number;
  point: Point;
  guides: Guide[];
}

/**
 * Equal-spacing candidates: for an adjacent pair of other objects on the same
 * row/column with gap g, the dragged box may sit one gap g before the pair or
 * after it. Both reference gaps are returned as dashed measurements whose
 * labels state the measured value.
 */
export function spacingCandidates(
  box: Bounds,
  others: TargetShape[],
  map: ScreenMap,
  radius: number,
): SpacingCandidate[] {
  const out: SpacingCandidate[] = [];
  for (const axis of ["x", "y"] as const) {
    const overlaps = axis === "x" ? overlapsOnY : overlapsOnX;
    const lo = axis === "x" ? "minX" : "minY";
    const hi = axis === "x" ? "maxX" : "maxY";
    const crossLo = axis === "x" ? "minY" : "minX";
    const crossHi = axis === "x" ? "maxY" : "maxX";
    const visible = others.filter((o) => overlaps(box, o.bounds));
    visible.sort((a, b) => a.bounds[lo] - b.bounds[lo]);
    for (let i = 0; i + 1 < visible.length; i++) {
      const a = visible[i];
      const b = visible[i + 1];
      const gap = b.bounds[lo] - a.bounds[hi];
      if (gap <= 0.5) continue;
      const start = Math.max(box[crossLo], a.bounds[crossLo], b.bounds[crossLo]);
      const end = Math.min(box[crossHi], a.bounds[crossHi], b.bounds[crossHi]);
      const row =
        end > start ? (start + end) / 2 : (box[crossLo] + box[crossHi]) / 2;
      const at = (value: number): Point =>
        axis === "x" ? { x: value, y: row } : { x: row, y: value };
      const label = `Equal spacing · ${roundLabel(gap)}`;
      const reference = line(
        "spacing",
        label,
        at(a.bounds[hi]),
        at(b.bounds[lo]),
        { dashed: true, value: gap },
      );
      // Box one gap before the pair: box.hi meets a.lo - gap.
      const before = a.bounds[lo] - gap - box[hi];
      if (Math.abs(before) * map.scale <= radius) {
        out.push({
          axis,
          edge: "hi",
          position: a.bounds[lo] - gap,
          kind: "spacing",
          label,
          point: at(a.bounds[lo] - gap),
          distance: Math.abs(before) * map.scale,
          priority: 0.25,
          key: `spacing:${axis}:before:${a.shape.id}:${b.shape.id}`,
          guides: [
            reference,
            line("spacing", label, at(box[hi] + before), at(a.bounds[lo]), {
              dashed: true,
              value: gap,
            }),
          ],
        });
      }
      // Box one gap after the pair: box.lo meets b.hi + gap.
      const after = b.bounds[hi] + gap - box[lo];
      if (Math.abs(after) * map.scale <= radius) {
        out.push({
          axis,
          edge: "lo",
          position: b.bounds[hi] + gap,
          kind: "spacing",
          label,
          point: at(b.bounds[hi] + gap),
          distance: Math.abs(after) * map.scale,
          priority: 0.25,
          key: `spacing:${axis}:after:${a.shape.id}:${b.shape.id}`,
          guides: [
            reference,
            line("spacing", label, at(b.bounds[hi]), at(box[lo] + after), {
              dashed: true,
              value: gap,
            }),
          ],
        });
      }
    }
  }
  return out;
}

export interface MoveSnapOptions {
  map: ScreenMap;
  session: SnapSession;
  /** Bounding box of the selection before the drag started. */
  before: Bounds;
  /** Probe points taken from the selection before the drag started. */
  probes: Probe[];
}

export interface MoveSnapResult {
  delta: Point;
  target?: SnapCandidate;
  guides: Guide[];
}

/**
 * Snap a rigid selection move. The winning probe contributes only its
 * correction relative to the raw position, so the final delta is a float in
 * document coordinates and switching targets never accumulates rounding.
 */
export function snapMove(
  raw: Point,
  targets: Targets,
  options: MoveSnapOptions,
): MoveSnapResult {
  const all: Capture[] = [];
  for (const probe of options.probes) {
    const position = { x: probe.point.x + raw.x, y: probe.point.y + raw.y };
    for (const capture of pointCaptures(position, targets, options.map)) {
      all.push({ ...capture, key: `${probe.key}>${capture.key}` });
    }
  }
  const target = select(all, options.session.point);
  hold(options.session.point, target);
  const delta = { x: raw.x, y: raw.y };
  const guides: Guide[] = [];
  if (target) {
    const separator = target.key.indexOf(">");
    const start = options.probes.find(
      (p) => p.key === target.key.slice(0, separator),
    );
    if (start) {
      // Anchor the selection so the probe lands exactly on the target. Because
      // the delta is recomputed from the gesture-start probe every frame,
      // switching targets cannot accumulate error.
      delta.x = target.point.x - start.point.x;
      delta.y = target.point.y - start.point.y;
    }
    guides.push(...target.guides);
  }
  if (snapSettings.spacing) {
    // Spacing must ignore objects hidden or locked while the drag is running.
    const others = targets.shapes.filter((shape) => live(shape.shape));
    const box: Bounds = {
      minX: options.before.minX + delta.x,
      minY: options.before.minY + delta.y,
      maxX: options.before.maxX + delta.x,
      maxY: options.before.maxY + delta.y,
    };
    const candidates = spacingCandidates(
      box,
      others,
      options.map,
      snapSettings.radius,
    );
    for (const axis of ["x", "y"] as const) {
      const channel =
        axis === "x" ? options.session.spacingX : options.session.spacingY;
      // A point snap is stronger than spacing; only a free axis is adjusted.
      if (target && delta[axis] !== raw[axis]) {
        hold(channel);
        continue;
      }
      const best = select(
        candidates.filter((c) => c.axis === axis),
        channel,
        snapSettings.radius,
      );
      if (best) {
        // Solve for the delta that puts the chosen edge exactly on the
        // reference gap; do not add the per-frame correction, which would
        // reintroduce accumulated float error.
        const before = axis === "x" ? options.before.minX : options.before.minY;
        const after = axis === "x" ? options.before.maxX : options.before.maxY;
        delta[axis] = best.position - (best.edge === "lo" ? before : after);
        guides.push(...best.guides);
      }
      hold(channel, best);
    }
  }
  return { delta, target, guides };
}
