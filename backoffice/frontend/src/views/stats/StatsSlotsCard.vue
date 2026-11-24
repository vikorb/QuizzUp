<template>
  <BaseCard :title="$t('stats.slots.title')" :neon="true" :no-hover="true">
    <p v-if="rows.length === 0" class="stats-slots__empty">{{ $t('stats.slots.empty') }}</p>
    <ol v-else class="stats-slots">
      <li v-for="slot in rows" :key="`${slot.weekday}-${slot.hour}`" class="stats-slot">
        <span class="stats-slot__label">{{ slot.label }}</span>
        <span class="stats-slot__bar" aria-hidden="true">
          <i :style="{ width: `${slot.width}%` }" />
        </span>
        <span class="stats-slot__count">{{ slot.sessions }}</span>
      </li>
    </ol>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { StatsSlot } from '@/types/stats'
import { formatStatsWeekday } from '@/utils/stats/format'

const props = defineProps<{ slots: StatsSlot[] }>()

const { t, locale } = useI18n()

// La barre ne fait que doubler le nombre écrit à droite : elle est masquée aux lecteurs d'écran.
const rows = computed(() => {
  const max = Math.max(1, ...props.slots.map((slot) => slot.sessions))

  return props.slots.map((slot) => ({
    ...slot,
    label: t('stats.slots.label', {
      day: formatStatsWeekday(slot.weekday, locale.value),
      from: slot.hour,
      to: (slot.hour + 1) % 24,
    }),
    width: Math.round((slot.sessions / max) * 100),
  }))
})
</script>

<style scoped>
.stats-slots {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stats-slots__empty {
  margin: 0;
  color: var(--text-2);
}

.stats-slot {
  display: grid;
  grid-template-columns: minmax(150px, 220px) 1fr 40px;
  align-items: center;
  gap: 12px;
  min-height: 48px;
}

.stats-slot__label {
  color: var(--text-1);
  text-transform: capitalize;
}

.stats-slot__bar {
  height: 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.stats-slot__bar i {
  display: block;
  height: 100%;
  border-radius: var(--radius-sm);
  background: var(--accent-blue);
}

.stats-slot__count {
  text-align: right;
  font-weight: 700;
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 560px) {
  .stats-slot {
    grid-template-columns: 1fr 40px;
  }

  .stats-slot__bar {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
