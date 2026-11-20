export { default as SnapGuides } from "./ui/SnapGuides.vue";
export { default as SnapToggle } from "./ui/SnapToggle.vue";
export {
  snapSettings,
  altDown,
  snapEnabled,
  guideState,
  createSession,
  clearGuides,
  showGuides,
} from "./model/types";
export type {
  SnapSession,
  Guide,
  SnapCandidate,
  Channel,
} from "./model/types";
export { buildTargets, isSnappable } from "./model/targets";
export type { Targets, TargetShape } from "./model/targets";
export {
  snapPoint,
  snapHandle,
  snapMove,
  screenMap,
  moveProbes,
  selectionBounds,
} from "./model/engine";
export type { Probe, Capture, ScreenMap } from "./model/engine";
export { snapshotShapes, translateFromSnapshot } from "./lib/apply";
export type { ShapeSnapshot } from "./lib/apply";
