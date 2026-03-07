<template>
  <component :is="as" class="scard" :style="styleVars">
    <header v-if="$slots.header" class="scard__header">
      <slot name="header" />
    </header>

    <div class="scard__body">
      <slot />
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    as?: 'section' | 'div' | 'article'
    maxWidth?: number | string
    padded?: boolean
  }>(),
  { as: 'section', maxWidth: 480, padded: true }
)

const styleVars = computed(() => {
  const mw = typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth

  return {
    maxWidth: mw,
  } as Record<string, string>
})
</script>

<style scoped>
.scard {
  width: min(var(--scard-max, 480px), 100%);
  background: var(--bg-card);
  border: 1px solid var(--border-ui);
  border-radius: 18px;
  backdrop-filter: blur(10px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 18px var(--glow-blue),
    0 0 26px var(--glow-pink);
  overflow: hidden;
}

.scard__header {
  padding: 18px 18px 0;
}

.scard__body {
  padding: 18px;
}
</style>
