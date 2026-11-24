<template>
  <BaseCard
    :title="$t('agenda.list.title')"
    :neon="false"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :loading-label="$t('agenda.loading')"
    error-namespace="games.errors"
  >
    <template #actions>
      <UiButton v-if="error" type="button" data-test="agenda-retry" @click="$emit('retry')">
        {{ $t('agenda.retry') }}
      </UiButton>
    </template>

    <p
      v-if="!loading && !error && entries.length === 0"
      class="agenda-empty"
      data-test="agenda-empty"
    >
      {{ $t(noRoom ? 'agenda.noRoom' : 'agenda.empty') }}

      <RouterLink
        v-if="canManageSettings && !noRoom"
        class="agenda-empty__link"
        :to="settingsRoute"
        data-test="agenda-settings-link"
      >
        {{ $t('agenda.settingsLink') }}
      </RouterLink>
    </p>

    <ul v-else-if="!loading && !error" class="agenda-list" data-test="agenda-list">
      <AgendaRow
        v-for="entry in entries"
        :key="entry.key"
        :entry="entry"
        :time-zone="timeZone"
        :now-ms="nowMs"
        :busy="entry.kind === 'game' && entry.game.id === busyGameId"
        @schedule="$emit('schedule', $event)"
        @view="$emit('view', $event)"
        @edit="$emit('edit', $event)"
        @open="$emit('open', $event)"
        @cancel="$emit('cancel', $event)"
      />
    </ul>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Game } from '@/types/game'
import type { AgendaEntry } from '@/utils/game/agenda'

import AgendaRow from './AgendaRow.vue'

const props = defineProps<{
  entries: AgendaEntry[]
  timeZone: string
  nowMs: number
  loading: boolean
  error: string | null
  /** La compagnie n'a aucune salle active : rien à afficher, quelle que soit la date. */
  noRoom: boolean
  /** Admin et superadmin : l'état vide leur indique où régler les créneaux. */
  canManageSettings: boolean
  companyId: number
  busyGameId: number | null
}>()

defineEmits<{
  (event: 'retry'): void
  (event: 'schedule', startsAt: string): void
  (event: 'view', game: Game): void
  (event: 'edit', game: Game): void
  (event: 'open', game: Game): void
  (event: 'cancel', game: Game): void
}>()

const settingsRoute = computed(() => ({ name: 'client-details', params: { id: props.companyId } }))
</script>

<style scoped>
.agenda-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.agenda-empty {
  margin: 0;
  padding: 14px 8px;
  color: var(--text-2);
}

.agenda-empty__link {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  margin-left: 8px;
  color: var(--text-0);
  font-weight: 700;
}
</style>
