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
        <div class="game-room-cell">
          <button class="game-room" type="button" @click="emit('open', toGame(item).id)">
            {{ getGameRoomName(toGame(item)) }}
          </button>

          <RoomPresenceBadge
            v-if="isGamePendingOrRunning(toGame(item))"
            :room="liveRooms[toGame(item).roomId] ?? null"
            :uncertain="liveUncertain"
            :now="now"
          />
        </div>
      </template>

      <template #cell-state="{ value }">
        <StatusPill :tone="getGameStateTone(value)" :label="$t(getGameStateLabelKey(value))" />
      </template>

      <template #cell-date="{ value }">
        <span class="game-date">{{ formatGameDate(toDateValue(value), locale) }}</span>
      </template>

      <template #cell-participantsCount="{ value }">
        <span class="game-number">{{ formatGameParticipantsCount(value) }}</span>
      </template>

      <template #cell-durationSeconds="{ value }">
        <span class="game-number">{{ formatGameDuration(toNumberValue(value)) }}</span>
      </template>

      <template #cell-topScore="{ value }">
        <span class="game-number">{{ formatGameTopScore(toNumberValue(value)) }}</span>
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
import type { RoomLive } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import RoomPresenceBadge from '@/components/ui/RoomPresenceBadge.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Game, GameTableRow } from '@/types/game'
import {
  formatGameDate,
  formatGameDuration,
  formatGameParticipantsCount,
  formatGameTopScore,
  getGameDate,
  getGameRoomName,
} from '@/utils/game/format'
import { getGameStateLabelKey, getGameStateTone, isGamePendingOrRunning } from '@/utils/game/state'

import GameTableActions from './table/GameTableActions.vue'

const props = defineProps<{
  companyId: number
  games: Game[]
  loading: boolean
  error: string | null
  /** Présence des salles reçue du flux en direct, par identifiant de salle. */
  liveRooms: Record<number, RoomLive>
  liveUncertain: boolean
  now: number
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'open', gameId: number): void
  (event: 'aborted', game: Game): void
  (event: 'error', errorCode: string): void
}>()

const { t, locale } = useI18n()

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'date', label: t('games.table.columns.date') },
  { key: 'roomName', label: t('games.table.columns.room') },
  { key: 'participantsCount', label: t('games.table.columns.participants'), align: 'right' },
  { key: 'durationSeconds', label: t('games.table.columns.duration'), align: 'right' },
  { key: 'topScore', label: t('games.table.columns.topScore'), align: 'right' },
  { key: 'state', label: t('games.table.columns.state') },
  { key: 'actions', label: t('games.table.columns.actions'), align: 'right' },
])

const tableItems = computed<GameTableRow[]>(() =>
  props.games.map((game) => ({ ...game, date: getGameDate(game) }))
)

function toGame(item: Record<string, unknown>): GameTableRow {
  return item as GameTableRow
}

function toNumberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null
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

.game-room-cell {
  display: grid;
  gap: 4px;
  justify-items: start;
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

.game-number {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

.game-date {
  color: var(--text-1);
  white-space: nowrap;
}
</style>
