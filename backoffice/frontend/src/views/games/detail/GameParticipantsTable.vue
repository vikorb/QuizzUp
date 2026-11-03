<template>
  <BaseCard
    :title="$t('games.detail.participantsTitle')"
    :neon="true"
    :no-hover="true"
    :empty="tableItems.length === 0"
    :empty-label="$t('games.detail.noParticipant')"
    class="game-participants-card"
  >
    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-podium="{ value }">
        <span class="podium">{{ value }}</span>
      </template>

      <template #cell-displayName="{ value }">
        <span class="name">{{ value }}</span>
      </template>

      <template #cell-score="{ value }">
        <span class="score">{{ value }}</span>
      </template>

      <template #cell-email="{ value }">
        <span class="email" :class="{ 'email--empty': !value }">{{ value || '—' }}</span>
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import type { GameParticipant } from '@/types/game'

type GameParticipantRow = GameParticipant & Record<string, unknown>

const props = defineProps<{
  participants: GameParticipant[]
}>()

const { t } = useI18n()

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'podium', label: t('games.detail.columns.podium'), align: 'center' },
  { key: 'displayName', label: t('games.detail.columns.displayName') },
  { key: 'score', label: t('games.detail.columns.score'), align: 'center' },
  { key: 'email', label: t('games.detail.columns.email') },
])

const tableItems = computed<GameParticipantRow[]>(() =>
  [...props.participants]
    .sort((left, right) => left.podium - right.podium)
    .map((participant) => ({ ...participant }))
)
</script>

<style scoped>
.game-participants-card {
  margin-top: 18px;
}

.podium {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-hover);
  border-radius: 50%;
  background: var(--glow-soft);
  color: var(--text-0);
  font-weight: 800;
  box-shadow: 0 0 10px var(--glow-pink);
}

.name {
  font-weight: 800;
  color: var(--text-0);
}

.score {
  font-weight: 800;
  color: var(--accent-cyan);
}

.email {
  color: var(--text-1);
}

.email--empty {
  color: var(--text-3);
}
</style>
