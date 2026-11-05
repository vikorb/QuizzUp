<template>
  <span class="square" :class="{ 'square--focus': active }" aria-hidden="true">
    <span
      v-for="corner in BUZZER_CORNERS"
      :key="corner"
      class="square__cell"
      :class="{ 'square__cell--on': active === byCorner[corner] }"
      :data-test="`square-${byCorner[corner]}`"
      :style="{ '--cell-color': `var(--buzzer-${layout[byCorner[corner]].color})` }"
    >
      {{ byCorner[corner] }}
    </span>
  </span>
</template>

<script setup lang="ts">
import {
  buttonsByCorner,
  BUZZER_CORNERS,
  type BuzzerButton,
  type BuzzerLayout,
} from '@quizzup/hardware'
import { computed } from 'vue'

const props = defineProps<{
  layout: BuzzerLayout
  /** Buzzer mis en avant (les autres s'estompent) ; sans lui, les quatre sont allumés. */
  active?: BuzzerButton
}>()

const byCorner = computed(() => buttonsByCorner(props.layout))
</script>

<style scoped>
.square {
  display: inline-grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12%;
  width: var(--square-size, 56px);
  aspect-ratio: 1;
  flex: 0 0 auto;
}

.square__cell {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--cell-color);
  color: var(--bg-0);
  font-size: calc(var(--square-size, 56px) * 0.22);
  font-weight: 900;
  line-height: 1;
}

.square--focus .square__cell {
  opacity: 0.25;
}

.square--focus .square__cell--on {
  opacity: 1;
  box-shadow: 0 0 0 3px var(--text-0);
}
</style>
