<template>
  <BaseCard :title="$t('stats.rooms.title')" :neon="true" :no-hover="true">
    <BaseTable :columns="columns" :items="rooms" row-key="roomId">
      <template #cell-finished="{ value }">
        <span class="stats-number">{{ value }}</span>
      </template>

      <template #cell-aborted="{ value }">
        <span class="stats-number">{{ value }}</span>
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable, { type BaseTableColumn } from '@/components/ui/BaseTable.vue'
import type { StatsRoomRow } from '@/types/stats'

defineProps<{ rooms: StatsRoomRow[] }>()

const { t } = useI18n()

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'roomName', label: t('stats.rooms.columns.room') },
  { key: 'finished', label: t('stats.rooms.columns.finished'), align: 'right' },
  { key: 'aborted', label: t('stats.rooms.columns.aborted'), align: 'right' },
])
</script>

<style scoped>
.stats-number {
  font-variant-numeric: tabular-nums;
}
</style>
