<template>
  <span
    ref="rootRef"
    class="tooltip"
    :class="{ 'tooltip--open': open }"
    tabindex="0"
    role="button"
    :aria-label="text"
    @click="open = !open"
    @keydown.enter.prevent="open = !open"
    @keydown.space.prevent="open = !open"
    @keydown.escape="open = false"
  >
    <slot>
      <MdIcon :path="mdiInformationOutline" :size="size" class="tooltip__icon" />
    </slot>

    <span class="tooltip__bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
import { mdiInformationOutline } from '@mdi/js'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import MdIcon from '@/components/ui/MdIcon.vue'

withDefaults(defineProps<{ text: string; size?: number }>(), { size: 16 })

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

// Tablette : l'infobulle s'ouvre au clic ; on la referme au clic à l'extérieur.
function onOutsidePointer(event: Event): void {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('pointerdown', onOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))
</script>

<style scoped>
.tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
  cursor: pointer;
  outline: none;
}

.tooltip:hover,
.tooltip:focus-visible,
.tooltip--open {
  color: var(--accent-pink);
}

.tooltip__icon {
  display: block;
}

.tooltip__bubble {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
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
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.14s ease,
    transform 0.14s ease,
    visibility 0.14s;
}

/* Survol (desktop) OU ouvert au clic (tablette). */
.tooltip:hover .tooltip__bubble,
.tooltip:focus-visible .tooltip__bubble,
.tooltip--open .tooltip__bubble {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
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

@media (prefers-reduced-motion: reduce) {
  .tooltip__bubble {
    transition: none;
  }
}
</style>
