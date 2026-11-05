<template>
  <div class="picker" data-test="layout-picker">
    <div class="picker__rows">
      <fieldset v-for="button in BUZZER_BUTTONS" :key="button" class="picker__row">
        <legend class="picker__legend">{{ $t('hardware.layout.buzzer', { button }) }}</legend>
        <div class="swatches" role="group" :aria-label="$t('hardware.layout.color')">
          <button
            v-for="color in BUZZER_COLORS"
            :key="color"
            type="button"
            class="swatch"
            :class="{ 'swatch--on': modelValue[button].color === color }"
            :style="{ background: `var(--buzzer-${color})` }"
            :aria-label="$t(`hardware.colors.${color}`)"
            :aria-pressed="modelValue[button].color === color"
            :title="$t(`hardware.colors.${color}`)"
            :data-test="`color-${button}-${color}`"
            @click="emit('update:modelValue', setBuzzerColor(modelValue, button, color))"
          />
        </div>
        <div class="corners" role="group" :aria-label="$t('hardware.layout.place')">
          <button
            v-for="corner in BUZZER_CORNERS"
            :key="corner"
            type="button"
            class="corner"
            :class="{ 'corner--on': modelValue[button].corner === corner }"
            :aria-label="$t(`hardware.corners.${corner}`)"
            :aria-pressed="modelValue[button].corner === corner"
            :title="$t(`hardware.corners.${corner}`)"
            :data-test="`corner-${button}-${corner}`"
            @click="emit('update:modelValue', moveBuzzerToCorner(modelValue, button, corner))"
          />
        </div>
      </fieldset>
    </div>
    <div class="picker__preview">
      <BuzzerSquare :layout="modelValue" style="--square-size: 120px" />
      <small class="hw-hint">{{ $t('hardware.layout.preview') }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  BUZZER_BUTTONS,
  BUZZER_COLORS,
  BUZZER_CORNERS,
  type BuzzerLayout,
  moveBuzzerToCorner,
  setBuzzerColor,
} from '@quizzup/hardware'

import BuzzerSquare from '@/components/hardware/BuzzerSquare.vue'

defineProps<{ modelValue: BuzzerLayout }>()
const emit = defineEmits<(event: 'update:modelValue', layout: BuzzerLayout) => void>()
</script>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24px;
}

.picker__rows {
  display: grid;
  flex: 1 1 360px;
  gap: 10px;
}

.picker__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
  margin: 0;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
}

.picker__legend {
  padding: 0 6px;
  font-weight: 800;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  transition: var(--tr);
}

.swatch--on {
  border-color: var(--text-0);
  box-shadow: 0 0 0 2px var(--bg-0) inset;
  transform: scale(1.12);
}

.corners {
  display: grid;
  grid-template-columns: repeat(2, 20px);
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: var(--surface-0);
}

.corner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--border-ui);
  background: transparent;
  cursor: pointer;
}

.corner--on {
  background: var(--text-0);
}

.picker__preview {
  display: grid;
  justify-items: center;
  gap: 6px;
}
</style>
