<template>
  <BaseCard
    :title="$t('games.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="tableItems.length === 0"
    :loading-label="$t('games.table.loading')"
    :empty-label="$t('games.table.empty')"
    error-namespace="games.errors"
    class="games-table-card"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="emit('retry')">
        {{ $t('games.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-roomName="{ item }">
        <button class="game-room" type="button" @click="emit('open', toGame(item).id)">
          {{ getGameRoomName(toGame(item)) }}
        </button>
      </template>

      <template #cell-state="{ value }">
        <StatusPill :tone="getGameStateTone(value)" :label="$t(getGameStateLabelKey(value))" />
      </template>

      <template #cell-participantsCount="{ value }">
        <span class="participants-count">{{ formatGameParticipantsCount(value) }}</span>
      </template>

      <template #cell-createdAt="{ value }">
        <span class="game-date">{{ formatGameDate(toDateValue(value), locale) }}</span>
      </template>

      <template #cell-actions="{ item }">
        <GameTableActions
          :company-id="companyId"
          :item="toGame(item)"
          @open="emit('open', $event)"
          @aborted="emit('aborted', $event)"
          @error="emit('error', $event)"
        />
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
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Game, GameTableRow } from '@/types/game'
import { formatGameDate, formatGameParticipantsCount, getGameRoomName } from '@/utils/game/format'
import { getGameStateLabelKey, getGameStateTone } from '@/utils/game/state'

import GameTableActions from './table/GameTableActions.vue'

const props = defineProps<{
  companyId: number
  games: Game[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'open', gameId: number): void
  (event: 'aborted', game: Game): void
  (event: 'error', errorCode: string): void
}>()

const { t, locale } = useI18n()

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'roomName', label: t('games.table.columns.room') },
  { key: 'state', label: t('games.table.columns.state') },
  {
    key: 'participantsCount',
    label: t('games.table.columns.participants'),
    align: 'center',
  },
  { key: 'createdAt', label: t('games.table.columns.date') },
  { key: 'actions', label: t('games.table.columns.actions'), align: 'right' },
])

const tableItems = computed<GameTableRow[]>(() => props.games.map((game) => ({ ...game })))

function toGame(item: Record<string, unknown>): GameTableRow {
  return item as GameTableRow
}

function toDateValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
</script>

<style scoped>
.games-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.game-room {
  padding: 0;
  border: 0;
  color: var(--text-0);
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.game-room:hover {
  text-decoration: underline;
}

.participants-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  font-weight: 800;
  color: var(--text-1);
}

.game-date {
  color: var(--text-1);
  white-space: nowrap;
}
</style>
