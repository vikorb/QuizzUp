<template>
  <span class="status-pill" :class="`status-pill--${tone}`">
    <span class="status-pill__dot" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
defineProps<{
  tone: 'ok' | 'warn' | 'danger' | 'muted'
  label: string
}>()
</script>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-pill__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.status-pill--ok {
  color: var(--ok);
  background: var(--ok-bg);
  border: 1px solid rgba(87, 224, 176, 0.3);
}
.status-pill--ok .status-pill__dot {
  box-shadow: 0 0 8px var(--ok);
}

.status-pill--warn {
  color: var(--warn);
  background: var(--warn-bg);
  border: 1px solid rgba(240, 189, 102, 0.3);
}
.status-pill--warn .status-pill__dot {
  box-shadow: 0 0 8px var(--warn);
}

.status-pill--danger {
  color: var(--danger);
  background: var(--danger-bg);
  border: 1px solid rgba(236, 134, 161, 0.3);
}
.status-pill--danger .status-pill__dot {
  box-shadow: 0 0 8px var(--danger);
}

.status-pill--muted {
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border-2);
}
</style>
