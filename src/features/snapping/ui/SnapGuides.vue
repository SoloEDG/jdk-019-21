<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { doc } from "../../../shared/document";
import { guideState } from "../model/types";

const root = ref<SVGGElement | null>(null);
/**
 * Document units per CSS pixel. Read from the live CTM so guide strokes and
 * text keep a constant on-screen size under any artboard zoom or transform.
 */
const unit = ref(1);

function measure() {
  // The overlay group only exists while guides are visible, so fall back to the
  // artboard itself when measuring before the first guide is shown.
  const svg =
    root.value?.ownerSVGElement ??
    document.querySelector<SVGSVGElement>('svg[data-testid="canvas"]');
  const matrix = svg?.getScreenCTM();
  if (!matrix) return;
  const scale =
    (Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d)) / 2;
  if (Number.isFinite(scale) && scale > 0) unit.value = 1 / scale;
}

onMounted(() => {
  measure();
  // Layout and zoom can change between gestures; re-read at each gesture start.
  document.addEventListener("pointerdown", measure, true);
});
watch(() => doc.zoom, measure);
watch(
  () => guideState.guides.length,
  () => nextTick(measure),
);
window.addEventListener("resize", measure);
onBeforeUnmount(() => {
  window.removeEventListener("resize", measure);
  document.removeEventListener("pointerdown", measure, true);
});

const palette: Record<string, string> = {
  anchor: "#12a594",
  intersection: "#e0699f",
  curve: "#8857e8",
  tangent: "#e08a1e",
  spacing: "#2a8fdd",
};

function stroke(kind: string) {
  return palette[kind] ?? "#8055d5";
}

function labelX(points: { x: number; y: number }[]) {
  const last = points[points.length - 1];
  return last.x + 7 * unit.value;
}

function labelY(points: { x: number; y: number }[]) {
  const last = points[points.length - 1];
  return last.y - 7 * unit.value;
}
</script>
<template>
  <g
    v-if="guideState.guides.length"
    ref="root"
    class="snap-guides"
    data-testid="snap-guides"
    pointer-events="none"
  >
    <g
      v-for="(guide, index) in guideState.guides"
      :key="index"
      :data-guide-kind="guide.kind"
    >
      <line
        v-if="guide.points.length > 1"
        :x1="guide.points[0].x"
        :y1="guide.points[0].y"
        :x2="guide.points[1].x"
        :y2="guide.points[1].y"
        :stroke="stroke(guide.kind)"
        :stroke-width="unit"
        :stroke-dasharray="
          guide.dashed ? `${4 * unit} ${3 * unit}` : undefined
        "
        fill="none"
      />
      <circle
        v-if="guide.kind !== 'spacing'"
        :cx="guide.points[guide.points.length - 1].x"
        :cy="guide.points[guide.points.length - 1].y"
        :r="2.6 * unit"
        :fill="stroke(guide.kind)"
        stroke="white"
        :stroke-width="1.2 * unit"
      />
      <text
        v-if="index === 0"
        :x="labelX(guide.points)"
        :y="labelY(guide.points)"
        :font-size="10 * unit"
        :fill="stroke(guide.kind)"
        :style="{ paintOrder: 'stroke' }"
        stroke="#ffffff"
        :stroke-width="3 * unit"
        stroke-linejoin="round"
      >
        {{ guide.label }}
      </text>
    </g>
  </g>
</template>
