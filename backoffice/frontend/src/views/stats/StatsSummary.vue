<template>
  <section class="stats-summary" :aria-label="$t('stats.summary.title')">
    <StatBar :stats="bars" />

    <dl class="stats-figures">
      <div class="stats-figures__item">
        <dt>{{ $t('stats.figures.medianDuration') }}</dt>
        <dd>{{ formatGameDuration(stats.sessions.medianDurationSeconds) }}</dd>
      </div>

      <div class="stats-figures__item">
        <dt>{{ $t('stats.figures.players') }}</dt>
        <dd>{{ stats.players.total }}</dd>
      </div>

      <div class="stats-figures__item">
        <dt>{{ $t('stats.figures.averagePerSession') }}</dt>
        <dd>{{ formatStatsDecimal(stats.players.averagePerSession, locale) }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatBar from '@/components/ui/StatBar.vue'
import type { CompanyStats } from '@/types/stats'
import { formatGameDuration } from '@/utils/game/format'
import { buildStatsBars } from '@/utils/stats/bars'
import { formatStatsDecimal } from '@/utils/stats/format'

const props = defineProps<{ stats: CompanyStats }>()

const { t, locale } = useI18n()

const bars = computed(() => buildStatsBars(props.stats, t))
</script>

<style scoped>
.stats-summary {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stats-figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 18px 28px;
  margin: 0;
}

.stats-figures__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stats-figures dt {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-2);
}

.stats-figures dd {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}
</style>
