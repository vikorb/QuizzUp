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
  color: #a9baff;
  background: rgba(74, 99, 216, 0.16);
  border-color: rgba(74, 99, 216, 0.32);
}

.scope-chip--violet {
  color: #c3aeff;
  background: rgba(116, 88, 230, 0.16);
  border-color: rgba(116, 88, 230, 0.34);
}
</style>
