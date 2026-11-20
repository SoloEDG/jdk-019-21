<script setup lang="ts">
import { computed, watch } from "vue";
import { doc } from "../shared/document";
import {
  Tools,
  path,
  create,
  add,
  seed,
  undo,
  redo,
  revision,
  beginGesture,
  commitGesture,
  cancelGesture,
} from "../features/drawing";
import {
  NodeOverlay,
  coordinates,
  select,
  selectedShapes,
} from "../features/nodes";
import { Properties } from "../features/appearance";
import { Layers } from "../features/layers";
import { ExportBar, restore, save, storageStatus } from "../features/export";
import {
  SnapGuides,
  SnapToggle,
  altDown,
  buildTargets,
  clearGuides,
  createSession,
  moveProbes,
  screenMap,
  selectionBounds,
  showGuides,
  snapEnabled,
  snapHandle,
  snapMove,
  snapPoint,
  snapshotShapes,
  translateFromSnapshot,
  type Probe,
  type ShapeSnapshot,
  type SnapSession,
  type Targets,
} from "../features/snapping";
import type { Point, Shape } from "../shared/types";

if (!restore()) seed();
doc.selected = doc.shapes.length
  ? [doc.shapes[doc.shapes.length - 1].id]
  : [];
watch(() => doc.shapes, save, { deep: true });
const paths = computed(() => doc.shapes.map(path));

let drawing: Shape | undefined;
watch(
  () => doc.tool,
  () => finishDrawing(),
);
watch(revision, () => {
  drawing = undefined;
});

interface Gesture {
  svg: SVGSVGElement;
  origin: Point;
  shapes: Shape[];
  snapshot: ShapeSnapshot;
  before: ReturnType<typeof selectionBounds>;
  targets: Targets;
  session: SnapSession;
  /** Probe points captured at gesture start; never recomputed mid-drag. */
  probes: Probe[];
  handle?: { shape: Shape; nodeIndex: number; end: "in" | "out"; anchor: Point };
}

/** Removes the listeners of the gesture in flight, if any. */
let detach: (() => void) | undefined;

function track(detachGesture: () => void) {
  detach = detachGesture;
}

function endGesture() {
  detach?.();
  detach = undefined;
  commitGesture();
  clearGuides();
}

function abortGesture() {
  detach?.();
  detach = undefined;
  cancelGesture();
  drawing = undefined;
  clearGuides();
}

function targetsFor(shapes: Shape[]) {
  return buildTargets(doc.shapes, new Set(shapes.map((s) => s.id)));
}

/** Builds the immutable per-gesture context for a rigid move. */
function beginMove(svg: SVGSVGElement, origin: Point, shapes: Shape[]): Gesture {
  const snapshot = snapshotShapes(shapes);
  const fromSnapshot = shapes.map((shape) => ({
    ...shape,
    nodes: snapshot.get(shape.id) ?? shape.nodes,
  }));
  return {
    svg,
    origin,
    shapes,
    snapshot,
    before: selectionBounds(shapes),
    targets: targetsFor(shapes),
    session: createSession(),
    probes: moveProbes(fromSnapshot),
  };
}

/**
 * Applies one pointer position to a rigid selection move. Snapping works in
 * screen pixels through the live screen map, while the written coordinates come
 * from the gesture snapshot so document precision is untouched.
 */
function moveTo(gesture: Gesture, point: Point) {
  const raw = { x: point.x - gesture.origin.x, y: point.y - gesture.origin.y };
  let delta = raw;
  if (snapEnabled.value) {
    const result = snapMove(raw, gesture.targets, {
      map: screenMap(gesture.svg),
      session: gesture.session,
      before: gesture.before,
      probes: gesture.probes,
    });
    delta = result.delta;
    showGuides(result.guides, result.target);
  } else {
    clearGuides();
  }
  for (const shape of gesture.shapes) {
    translateFromSnapshot(shape, gesture.snapshot, delta);
  }
}

function moveHandleTo(gesture: Gesture, point: Point) {
  const handle = gesture.handle!;
  const node = handle.shape.nodes[handle.nodeIndex];
  const end = handle.end === "in" ? node.in : node.out;
  if (!snapEnabled.value) {
    end.x = point.x;
    end.y = point.y;
    clearGuides();
    return;
  }
  const snap = snapHandle(point, gesture.targets, {
    map: screenMap(gesture.svg),
    session: gesture.session,
    anchor: handle.anchor,
  });
  end.x = snap.point.x;
  end.y = snap.point.y;
  showGuides(snap.guides, snap.target);
}

/* ---------------- pen drawing ---------------- */

function finishDrawing() {
  if (drawing) {
    detach?.();
    detach = undefined;
    commitGesture();
  }
  drawing = undefined;
  clearGuides();
}

function penDown(svg: SVGSVGElement, point: Point) {
  // Existing shapes are valid snap targets for the pen, as are nodes already
  // placed on the path being drawn; only that path itself is excluded.
  const targets = buildTargets(
    doc.shapes,
    drawing ? new Set([drawing.id]) : undefined,
  );
  const session = createSession();
  const landed = snapEnabled.value
    ? snapPoint(point, targets, { map: screenMap(svg), session })
    : { point, guides: [] };
  if (!drawing) {
    beginGesture();
    drawing = create(landed.point);
  }
  add(drawing, landed.point);
  showGuides(landed.guides);
  const node = drawing.nodes.at(-1)!;
  const move = (ev: PointerEvent) => {
    const raw = coordinates(ev, svg);
    // The pen handle stays symmetric around the anchor. Tangent snapping only
    // adjusts its direction, so `in` stays the mirror image of `out`.
    const aimed =
      snapEnabled.value
        ? snapHandle(raw, targets, {
            map: screenMap(svg),
            session,
            anchor: { x: node.x, y: node.y },
          })
        : { point: raw, guides: [], target: undefined };
    node.out.x = aimed.point.x;
    node.out.y = aimed.point.y;
    node.in.x = 2 * node.x - aimed.point.x;
    node.in.y = 2 * node.y - aimed.point.y;
    showGuides(aimed.guides, aimed.target);
  };
  const done = () => {
    window.removeEventListener("pointermove", move);
    clearGuides();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", done, { once: true });
  // The pen stroke and its handle drag are a single gesture already captured
  // by the first penDown; finishing or aborting clears the listeners.
  detach = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
  };
}

/* ---------------- pointer entry ---------------- */

function down(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const point = coordinates(e, svg);
  const id = (e.target as Element).getAttribute("data-shape");
  if (doc.tool === "pen") {
    penDown(svg, point);
    return;
  }
  if (id) {
    // Locked or hidden objects are not selectable, so a click on one must not
    // fall through and drag whatever was selected before.
    if (!select(id, e.shiftKey)) return;
    if (doc.tool === "nodes") return;
    const shapes = selectedShapes();
    if (!shapes.length) return;
    beginGesture();
    const gesture = beginMove(svg, point, shapes);
    const move = (ev: PointerEvent) => moveTo(gesture, coordinates(ev, svg));
    const done = () => endGesture();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
    track(() => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    });
  } else doc.selected = [];
}

/**
 * Node-overlay drags are routed here so anchors and handles share the same
 * snapping session and history semantics as object moves.
 */
function startNodeDrag(
  e: PointerEvent,
  shape: Shape,
  nodeIndex: number,
  kind: "anchor" | "in" | "out",
) {
  e.stopPropagation();
  const node = shape.nodes[nodeIndex];
  if (!node) return;
  // The anchor keeps its own coordinates; a handle pivots around it.
  const svg = (e.target as SVGElement).ownerSVGElement!;
  const shapes = [shape];
  beginGesture();
  const gesture: Gesture = {
    ...beginMove(svg, coordinates(e, svg), shapes),
    handle:
      kind === "anchor"
        ? undefined
        : { shape, nodeIndex, end: kind, anchor: { x: node.x, y: node.y } },
  };
  const move = (ev: PointerEvent) => {
    const point = coordinates(ev, svg);
    if (kind === "anchor") {
      const start = gesture.snapshot.get(shape.id)![nodeIndex];
      // Snapping decides the anchor; the node's handles follow rigidly so
      // the surrounding curve shape is preserved.
      const landed = snapEnabled.value
        ? snapPoint(point, gesture.targets, {
            map: screenMap(svg),
            session: gesture.session,
          })
        : { point, guides: [], target: undefined };
      node.x = landed.point.x;
      node.y = landed.point.y;
      node.in.x = start.in.x + (node.x - start.x);
      node.in.y = start.in.y + (node.y - start.y);
      node.out.x = start.out.x + (node.x - start.x);
      node.out.y = start.out.y + (node.y - start.y);
      showGuides(landed.guides, landed.target);
    } else moveHandleTo(gesture, point);
  };
  const done = () => endGesture();
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", done, { once: true });
  track(() => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
  });
}

function finish() {
  finishDrawing();
  doc.tool = "select";
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Alt") altDown.value = true;
  if (e.key === "Enter") finish();
  // Escape aborts whatever is in flight without leaving an undo step.
  if (e.key === "Escape") abortGesture();
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Alt") altDown.value = false;
});
window.addEventListener("blur", () => {
  altDown.value = false;
});
</script>
<template>
  <header>
    <b class="brand">◈ forma <small>VECTOR STUDIO</small></b>
    <div>Bloom exploration <span> / Personal workspace</span></div>
    <ExportBar :paths="paths" />
  </header>
  <div class="workspace">
    <div class="left">
      <h5>PROJECT <span>＋</span></h5>
      <p class="project">▣ Bloom / Artboard 01</p>
      <Tools /><Layers />
      <p class="signature">✧ Designed to explore.</p>
    </div>
    <main>
      <div class="toolbar">
        <span>Artboard 01　<small>800 × 600</small></span>
        <div>
          <SnapToggle />
          <button @click="undo">↶</button><button @click="redo">↷</button
          ><button @click="doc.zoom = Math.max(0.4, doc.zoom - 0.1)">−</button
          >{{ Math.round(doc.zoom * 100) }}%<button
            @click="doc.zoom = Math.min(1.5, doc.zoom + 0.1)"
          >
            ＋
          </button>
        </div>
      </div>
      <div class="stage">
        <svg
          data-testid="canvas"
          :style="{
            width: 800 * doc.zoom + 'px',
            height: 600 * doc.zoom + 'px',
          }"
          viewBox="0 0 800 600"
          @pointerdown="down"
          @dblclick="finish"
        >
          <rect width="800" height="600" fill="#fffdfb" />
          <path
            v-for="s in doc.shapes.filter((s) => !s.hidden)"
            :key="s.id"
            :data-shape="s.id"
            :d="path(s)"
            :fill="s.fill"
            :stroke="s.stroke"
            :stroke-width="s.width"
            :opacity="s.opacity"
          />
          <SnapGuides />
          <NodeOverlay @nodedrag="startNodeDrag" />
        </svg>
      </div>
      <footer>
        <span>● {{ storageStatus }}</span
        ><span>{{
          doc.tool === "pen"
            ? "Click / drag to draw · Enter to finish"
            : "Shift + click to select multiple · Drag to move · Hold Alt to bypass snapping"
        }}</span
        ><span>{{ doc.selected.length }} selected</span>
      </footer>
    </main>
    <Properties />
  </div>
</template>
