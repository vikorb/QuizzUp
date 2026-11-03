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
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  border: 1px solid var(--border-ui);
  border-radius: 18px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 20px 44px -28px rgba(0, 0, 0, 0.85),
    0 0 28px -10px var(--glow-pink);
  overflow: hidden;
}

.scard__header {
  padding: 18px 18px 0;
}

.scard__body {
  padding: 18px;
}
</style>
