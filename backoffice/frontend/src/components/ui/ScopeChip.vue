<template>
  <span class="scope-chip" :class="`scope-chip--${tone}`">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
defineProps<{
  tone: 'blue' | 'violet'
  label: string
}>()
</script>

<style scoped>
.scope-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-2);
  white-space: nowrap;
}

.scope-chip--blue {
  color: var(--edit);
  background: var(--edit-bg);
}

.scope-chip--violet {
  color: var(--accent-pink);
  background: var(--glow-soft);
}
</style>
