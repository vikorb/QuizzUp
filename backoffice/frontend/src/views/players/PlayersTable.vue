<template>
  <BaseCard
    :title="$t('players.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="players.length === 0"
    :loading-label="$t('players.table.loading')"
    :empty-label="$t(hasSearch ? 'players.table.emptySearch' : 'players.table.empty')"
    error-namespace="players.errors"
    class="players-table-card"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="emit('retry')">
        {{ $t('players.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="rowId">
      <template #cell-displayName="{ value }">
        <span class="player-name">{{ value }}</span>
      </template>

      <template #cell-email="{ value }">
        <span class="player-email">{{ value }}</span>
      </template>

      <template #cell-sessions="{ value }">
        <span class="player-number">{{ value }}</span>
      </template>

      <template #cell-lastPlayedAt="{ value }">
        <span class="player-date">{{ formatGameDate(toDateValue(value), locale, false) }}</span>
      </template>

      <template #cell-bestScore="{ value }">
        <span class="player-number">{{ formatGameTopScore(toNumberValue(value)) }}</span>
      </template>

      <template #cell-marketingConsent="{ value }">
        <StatusPill
          :tone="value === true ? 'ok' : 'muted'"
          :label="$t(value === true ? 'players.offers.accepted' : 'players.offers.declined')"
        />
      </template>

      <template #cell-actions="{ item }">
        <div class="player-actions">
          <UiButton
            variant="icon"
            type="button"
            data-test="player-unsubscribe"
            :disabled="busy || !toPlayer(item).marketingConsent"
            :title="$t('players.actions.unsubscribe', { name: toPlayer(item).displayName })"
            :aria-label="$t('players.actions.unsubscribe', { name: toPlayer(item).displayName })"
            @click="emit('unsubscribe', toPlayer(item))"
          >
            <MdIcon :path="mdiEmailOffOutline" :size="18" />
          </UiButton>

          <UiButton
            class="player-actions__erase"
            variant="icon"
            type="button"
            data-test="player-erase"
            :disabled="busy"
            :title="$t('players.actions.erase', { name: toPlayer(item).displayName })"
            :aria-label="$t('players.actions.erase', { name: toPlayer(item).displayName })"
            @click="emit('erase', toPlayer(item))"
          >
            <MdIcon :path="mdiDeleteOutline" :size="18" />
          </UiButton>
        </div>
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiEmailOffOutline } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Player } from '@/types/player'
import { formatGameDate, formatGameTopScore } from '@/utils/game/format'

const props = defineProps<{
  players: Player[]
  loading: boolean
  error: string | null
  /** Une recherche est en cours : le vide veut dire « aucun résultat ». */
  hasSearch: boolean
  /** Admin et superadmin : adresses lisibles et actions réservées. Le rôle `user` n'en a aucune. */
  canManage: boolean
  /** Une action est en cours : les boutons sont bloqués. */
  busy: boolean
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'unsubscribe', player: Player): void
  (event: 'erase', player: Player): void
}>()

const { t, locale } = useI18n()

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'displayName', label: t('players.table.columns.name') },
  ...(props.canManage ? [{ key: 'email', label: t('players.table.columns.email') }] : []),
  { key: 'sessions', label: t('players.table.columns.sessions'), align: 'right' as const },
  { key: 'lastPlayedAt', label: t('players.table.columns.lastPlayedAt') },
  { key: 'bestScore', label: t('players.table.columns.bestScore'), align: 'right' as const },
  { key: 'marketingConsent', label: t('players.table.columns.offers') },
  ...(props.canManage
    ? [{ key: 'actions', label: t('players.table.columns.actions'), align: 'right' as const }]
    : []),
])

// Le rôle `user` reçoit `email: null` : sans adresse, la clé de ligne est la position dans la page.
const tableItems = computed(() =>
  props.players.map((player, index) => ({ ...player, rowId: player.email ?? `row-${index}` }))
)

function toPlayer(item: Record<string, unknown>): Player {
  return item as Player
}

function toNumberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function toDateValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
</script>

<style scoped>
.players-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.player-name {
  font-weight: 700;
  color: var(--text-0);
}

.player-email {
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.player-number {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

.player-date {
  color: var(--text-1);
  white-space: nowrap;
}

.player-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

/* L'effacement est irréversible : seule icône colorée de la ligne. */
.player-actions__erase {
  color: var(--danger);
}
</style>
