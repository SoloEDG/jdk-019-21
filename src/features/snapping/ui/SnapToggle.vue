<script setup lang="ts">
import { snapSettings } from "../model/types";
</script>
<template>
  <div class="snap">
    <label class="snap-toggle">
      <input
        type="checkbox"
        data-testid="snap-toggle"
        :checked="snapSettings.enabled"
        @change="snapSettings.enabled = ($event.target as HTMLInputElement).checked"
      />
      Snap
    </label>
    <details class="snap-kinds">
      <summary>⌄</summary>
      <label
        ><input
          type="checkbox"
          data-testid="snap-anchors"
          :checked="snapSettings.anchors"
          @change="snapSettings.anchors = ($event.target as HTMLInputElement).checked"
        />
        Anchors</label
      >
      <label
        ><input
          type="checkbox"
          data-testid="snap-intersections"
          :checked="snapSettings.intersections"
          @change="snapSettings.intersections = ($event.target as HTMLInputElement).checked"
        />
        Intersections</label
      >
      <label
        ><input
          type="checkbox"
          data-testid="snap-curves"
          :checked="snapSettings.curves"
          @change="snapSettings.curves = ($event.target as HTMLInputElement).checked"
        />
        Curves</label
      >
      <label
        ><input
          type="checkbox"
          data-testid="snap-tangents"
          :checked="snapSettings.tangents"
          @change="snapSettings.tangents = ($event.target as HTMLInputElement).checked"
        />
        Tangents</label
      >
      <label
        ><input
          type="checkbox"
          data-testid="snap-spacing"
          :checked="snapSettings.spacing"
          @change="snapSettings.spacing = ($event.target as HTMLInputElement).checked"
        />
        Spacing</label
      >
    </details>
  </div>
</template>
