<template>
  <span class="square" :class="{ 'square--focus': active, 'square--test': lit }" aria-hidden="true">
    <span
      v-for="corner in BUZZER_CORNERS"
      :key="corner"
      class="square__cell"
      :class="{
        'square__cell--on': active === byCorner[corner],
        'square__cell--lit': lit?.includes(byCorner[corner]),
      }"
      :data-test="`${idPrefix}${byCorner[corner]}`"
      :style="{ '--cell-color': `var(--buzzer-${layout[byCorner[corner]].color})` }"
    >
      {{ byCorner[corner] }}
      <small v-if="keys">{{ keys[BUZZER_BUTTONS.indexOf(byCorner[corner])] }}</small>
    </span>
  </span>
</template>

<script setup lang="ts">
import {
  buttonsByCorner,
  BUZZER_BUTTONS,
  BUZZER_CORNERS,
  type BuzzerButton,
  type BuzzerLayout,
} from '@quizzup/hardware'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    layout: BuzzerLayout
    /** Buzzer mis en avant (les autres s'estompent) ; sans lui, les quatre sont allumés. */
    active?: BuzzerButton
    /** Mode test : seuls les buzzers de la liste sont allumés, les autres restent éteints. */
    lit?: readonly BuzzerButton[]
    /** Touche associée à chaque buzzer (dans l'ordre A, B, C, D), en petit sous la lettre. */
    keys?: readonly (string | undefined)[]
    /** Début du `data-test` de chaque pastille, suivi de la lettre du buzzer. */
    idPrefix?: string
  }>(),
  { idPrefix: 'square-' }
)

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

.square__cell small {
  font-size: calc(var(--square-size, 56px) * 0.1);
  font-weight: 700;
  opacity: 0.8;
}

.square--test .square__cell {
  opacity: 0.35;
  transition:
    opacity 120ms ease,
    box-shadow 120ms ease;
}

.square--test .square__cell--lit {
  opacity: 1;
  box-shadow: 0 0 22px var(--cell-color);
}

.square--focus .square__cell {
  opacity: 0.25;
}

.square--focus .square__cell--on {
  opacity: 1;
  box-shadow: 0 0 0 3px var(--text-0);
}
</style>
