import { computed, reactive, ref } from "vue";
import type { Point } from "../../../shared/types";

export type GuideKind =
  | "anchor"
  | "intersection"
  | "curve"
  | "tangent"
  | "spacing";

export interface Guide {
  kind: GuideKind;
  /** Explains what was hit, e.g. "Anchor · Petal 2". */
  label: string;
  /** First point is the marker; a second point gives the guide a direction. */
  points: Point[];
  dashed?: boolean;
  /** Measured gap, shown next to spacing guides. */
  value?: number;
}

export interface SnapCandidate {
  kind: GuideKind;
  label: string;
  /** Raw-to-snapped distance in screen pixels. */
  distance: number;
  /**
   * Tie-breaker in screen pixels: a coincident anchor wins over a curve, and
   * an intersection wins over both.
   */
  priority: number;
  key: string;
  /** Exact document-space position to land on. */
  point: Point;
}

/** Hysteresis state for one channel (point lock, or one spacing axis). */
export interface Channel {
  key?: string;
  distance: number;
}

export interface SnapSession {
  point: Channel;
  spacingX: Channel;
  spacingY: Channel;
}

export function createChannel(): Channel {
  return { distance: Infinity };
}

export function createSession(): SnapSession {
  return { point: createChannel(), spacingX: createChannel(), spacingY: createChannel() };
}

export const snapSettings = reactive({
  /** Master switch; turning it off never rewrites document data. */
  enabled: true,
  /** Capture radius in CSS pixels — independent of zoom or object scale. */
  radius: 12,
  anchors: true,
  intersections: true,
  curves: true,
  tangents: true,
  spacing: true,
});

/** Holding Alt/Option suspends snapping only while the key is down. */
export const altDown = ref(false);

export const snapEnabled = computed(
  () => snapSettings.enabled && !altDown.value,
);

export const guideState = reactive<{ guides: Guide[]; label: string }>({
  guides: [],
  label: "",
});

export function showGuides(guides: Guide[], target?: SnapCandidate) {
  guideState.guides = guides;
  guideState.label = target?.label ?? "";
}

export function clearGuides() {
  if (!guideState.guides.length && !guideState.label) return;
  guideState.guides = [];
  guideState.label = "";
}
