<template>
  <div class="stat-bar">
    <div
      v-for="stat in stats"
      :key="stat.label"
      class="stat"
      :class="stat.tone ? `stat--${stat.tone}` : ''"
    >
      <span class="stat__value">{{ stat.value }}</span>
      <span class="stat__label">{{ stat.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
export type Stat = {
  label: string
  value: number | string
  tone?: 'ok' | 'warn' | 'accent'
}

defineProps<{
  stats: Stat[]
}>()
</script>

<style scoped>
.stat-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 14px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  min-width: 82px;
}

.stat__value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.stat__label {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.03em;
}

.stat--ok .stat__value {
  color: var(--ok);
}
.stat--warn .stat__value {
  color: var(--warn);
}
.stat--accent .stat__value {
  color: var(--accent-pink);
}
</style>
