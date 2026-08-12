<template>
  <span
    class="tooltip"
    tabindex="0"
    :aria-label="text"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focus="open = true"
    @blur="open = false"
    @keydown.escape="open = false"
  >
    <slot>
      <MdIcon :path="mdiInformationOutline" :size="size" class="tooltip__icon" />
    </slot>

    <Transition name="tooltip-fade">
      <span v-if="open" class="tooltip__bubble" role="tooltip">{{ text }}</span>
    </Transition>
  </span>
</template>

<script setup lang="ts">
import { mdiInformationOutline } from '@mdi/js'
import { ref } from 'vue'

import MdIcon from '@/components/ui/MdIcon.vue'

withDefaults(defineProps<{ text: string; size?: number }>(), { size: 16 })

const open = ref(false)
</script>

<style scoped>
.tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
  cursor: help;
  outline: none;
}

.tooltip:hover,
.tooltip:focus-visible {
  color: var(--accent-pink);
}

.tooltip__icon {
  display: block;
}

.tooltip__bubble {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  width: max-content;
  max-width: 240px;
  padding: 8px 11px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: var(--bg-elevated);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: normal;
  text-align: left;
  box-shadow: 0 14px 30px -12px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.tooltip__bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--bg-elevated);
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .tooltip-fade-enter-active,
  .tooltip-fade-leave-active {
    transition: none;
  }
}
</style>
