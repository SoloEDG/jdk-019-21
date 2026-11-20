<script setup lang="ts">
import { select } from "../../nodes";
import { doc } from "../../../shared/document";
import { group, reorder, remove } from "../model/actions";
import { toggleHidden, toggleLocked } from "../model/visibility";
</script>
<template>
  <section class="layers">
    <h3>
      Layers <span>{{ doc.shapes.length }}</span>
    </h3>
    <div class="layer-actions">
      <button @click="group" data-testid="group">Group</button
      ><button @click="reorder(1)">↑</button
      ><button @click="reorder(-1)">↓</button><button @click="remove">⌫</button>
    </div>
    <div
      class="layer"
      v-for="s in [...doc.shapes].reverse()"
      :class="{
        chosen: doc.selected.includes(s.id),
        hidden: s.hidden,
        locked: s.locked,
      }"
      :data-layer="s.id"
      @click="select(s.id, $event.shiftKey)"
    >
      <i :style="{ background: s.fill }"></i>{{ s.group ? "▧" : "◇" }}
      {{ s.name }}
      <button
        class="glyph"
        :data-testid="'hide-' + s.id"
        :aria-label="s.hidden ? 'Show' : 'Hide'"
        :aria-pressed="!!s.hidden"
        @click.stop="toggleHidden(s.id)"
      >
        {{ s.hidden ? "◌" : "◉" }}
      </button>
      <button
        class="glyph"
        :data-testid="'lock-' + s.id"
        :aria-label="s.locked ? 'Unlock' : 'Lock'"
        :aria-pressed="!!s.locked"
        @click.stop="toggleLocked(s.id)"
      >
        {{ s.locked ? "▣" : "▢" }}
      </button>
    </div>
  </section>
</template>
