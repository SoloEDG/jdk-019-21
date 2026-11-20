<script setup lang="ts">
import { doc } from "../../../shared/document";
import type { Shape } from "../../../shared/types";

export type NodeHandleKind = "anchor" | "in" | "out";
const emit = defineEmits<{
  (
    e: "nodedrag",
    event: PointerEvent,
    shape: Shape,
    nodeIndex: number,
    kind: NodeHandleKind,
  ): void;
}>();

function down(event: PointerEvent, shape: Shape, nodeIndex: number, kind: NodeHandleKind) {
  event.stopPropagation();
  emit("nodedrag", event, shape, nodeIndex, kind);
}
</script>
<template>
  <g
    v-for="s in doc.shapes.filter(
      (s) => doc.selected.includes(s.id) && !s.hidden && !s.locked,
    )"
    ><g v-for="(n, i) in s.nodes"
      ><path
        :d="`M${n.in.x},${n.in.y} L${n.x},${n.y} L${n.out.x},${n.out.y}`"
        stroke="#9974ec"
        fill="none" /><circle
        v-for="k in ['in', 'out'] as const"
        :cx="n[k].x"
        :cy="n[k].y"
        r="4"
        fill="white"
        stroke="#8052df"
        :data-testid="'handle-' + k"
        @pointerdown="down($event, s, i, k)" /><rect
        :x="n.x - 4"
        :y="n.y - 4"
        width="8"
        height="8"
        fill="white"
        stroke="#8052df"
        data-testid="anchor"
        @pointerdown="down($event, s, i, 'anchor')" /></g
  ></g>
</template>
