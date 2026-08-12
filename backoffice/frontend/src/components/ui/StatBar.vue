<template>
  <div class="stat-bar">
    <div
      v-for="stat in stats"
      :key="stat.label"
      class="stat"
      :class="stat.tone ? `stat--${stat.tone}` : ''"
    >
      <div class="stat__top">
        <span class="stat__value">{{ stat.value }}</span>
        <span class="stat__label">{{ stat.label }}</span>
      </div>
      <div class="stat__meterwrap">
        <span class="stat__meter">
          <i :style="{ width: filled ? `${clampRatio(stat.ratio)}%` : '0%' }" />
        </span>
        <span v-if="hintFor(stat)" class="stat__hint">{{ hintFor(stat) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

export type Stat = {
  label: string
  value: number | string
  tone?: 'ok' | 'warn' | 'accent'
  /** Proportion 0..100 remplie par la jauge (défaut : pleine). */
  ratio?: number
  /** Petit texte sous la jauge ; par défaut « x % » si un ratio est fourni. */
  hint?: string
}

defineProps<{ stats: Stat[] }>()

const filled = ref(false)

function clampRatio(ratio?: number): number {
  if (ratio === undefined || Number.isNaN(ratio)) return 100
  return Math.max(0, Math.min(100, ratio))
}

function hintFor(stat: Stat): string {
  if (stat.hint !== undefined) return stat.hint
  if (stat.ratio !== undefined && !Number.isNaN(stat.ratio)) {
    return `${Math.round(clampRatio(stat.ratio))} %`
  }
  return ''
}

onMounted(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    filled.value = true
    return
  }
  requestAnimationFrame(() => {
    filled.value = true
  })
})
</script>

<style scoped>
.stat-bar {
  display: flex;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 20px 40px -28px rgba(0, 0, 0, 0.85);
  overflow: hidden;
}

.stat {
  flex: 1 1 0;
  min-width: 0;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.stat + .stat {
  border-left: 1px solid var(--border-ui);
}

.stat__top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.stat__value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-0);
  letter-spacing: 0.005em;
}

.stat__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.13em;
  color: var(--text-2);
}

.stat__meterwrap {
  display: flex;
  align-items: center;
  gap: 9px;
}

.stat__meter {
  flex: 1;
  height: 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.stat__meter i {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent-blue), var(--accent-pink));
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat__hint {
  font-size: 11px;
  color: var(--text-3);
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stat--ok .stat__value {
  color: var(--ok);
}
.stat--ok .stat__meter i {
  background: linear-gradient(90deg, rgba(87, 224, 176, 0.55), var(--ok));
}
.stat--warn .stat__value {
  color: var(--warn);
}
.stat--warn .stat__meter i {
  background: linear-gradient(90deg, rgba(240, 189, 102, 0.55), var(--warn));
}
.stat--accent .stat__value {
  color: var(--accent-pink);
}

@media (prefers-reduced-motion: reduce) {
  .stat__meter i {
    transition: none;
  }
}

@media (max-width: 560px) {
  .stat-bar {
    flex-direction: column;
  }
  .stat + .stat {
    border-left: 0;
    border-top: 1px solid var(--border-ui);
  }
}
</style>
