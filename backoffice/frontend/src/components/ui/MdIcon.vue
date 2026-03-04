<template>
  <svg
    class="md-icon"
    :style="{ width: sizePx, height: sizePx }"
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
  >
    <path :d="path" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    path: string
    size?: number
  }>(),
  { size: 18 }
)

const sizePx = computed(() => `${props.size}px`)
</script>

<style scoped>
.md-icon {
  display: block;
  flex: 0 0 auto;
}
</style>
