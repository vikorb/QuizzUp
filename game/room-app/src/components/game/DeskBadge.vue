<template>
  <span class="desk-badge" :class="`desk-badge--${desk}`" :style="{ '--size': `${size}px` }">
    {{ desk }}
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ desk: number; size?: number }>(), { size: 34 })
</script>

<style scoped>
.desk-badge {
  --desk-color: var(--desk-1);
  display: inline-grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  flex: 0 0 auto;
  border-radius: 50%;
  font-weight: 900;
  font-size: calc(var(--size) * 0.5);
  color: var(--bg-0);
  background: var(--desk-color);
  box-shadow: 0 0 18px -2px var(--desk-color);
}

.desk-badge--2 {
  --desk-color: var(--desk-2);
}

.desk-badge--3 {
  --desk-color: var(--desk-3);
}

.desk-badge--4 {
  --desk-color: var(--desk-4);
}
</style>
