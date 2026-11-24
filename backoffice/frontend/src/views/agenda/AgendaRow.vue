<template>
  <li
    class="agenda-row"
    :class="{ 'agenda-row--free': entry.kind === 'slot' }"
    data-test="agenda-row"
    :data-kind="entry.kind"
    :data-key="entry.key"
  >
    <span class="agenda-row__time" data-test="agenda-time">{{ timeLabel }}</span>

    <template v-if="entry.kind === 'slot'">
      <span class="agenda-row__free">{{ $t('agenda.row.free') }}</span>

      <div class="agenda-row__actions">
        <UiButton
          class="agenda-row__button"
          type="button"
          data-test="agenda-schedule"
          @click="$emit('schedule', entry.slot.startsAt)"
        >
          {{ $t('agenda.actions.schedule') }}
        </UiButton>
      </div>
    </template>

    <template v-else>
      <div class="agenda-row__main">
        <StatusPill
          :tone="getAgendaStateTone(stateKind)"
          :label="$t(getAgendaStateLabelKey(stateKind))"
          data-test="agenda-state"
          :data-state="stateKind"
        />

        <span class="agenda-row__players" data-test="agenda-players">{{ playersLabel }}</span>

        <span v-if="entry.game.externalRef" class="agenda-row__meta" data-test="agenda-ref">
          {{ $t('agenda.row.reference', { ref: entry.game.externalRef }) }}
        </span>

        <span v-if="entry.game.source === 'api'" class="agenda-row__meta" data-test="agenda-source">
          {{ $t('agenda.row.sourceApi') }}
        </span>
      </div>

      <div class="agenda-row__actions">
        <UiButton
          class="agenda-row__button"
          type="button"
          data-test="agenda-view"
          :aria-label="$t('agenda.actions.viewAt', { time: startLabel })"
          @click="$emit('view', entry.game)"
        >
          {{ $t('agenda.actions.view') }}
        </UiButton>

        <UiButton
          v-if="canEdit"
          class="agenda-row__button"
          type="button"
          data-test="agenda-edit"
          :aria-label="$t('agenda.actions.editAt', { time: startLabel })"
          :disabled="busy"
          @click="$emit('edit', entry.game)"
        >
          {{ $t('agenda.actions.edit') }}
        </UiButton>

        <UiButton
          v-if="canOpen"
          class="agenda-row__button"
          type="button"
          data-test="agenda-open"
          :aria-label="$t('agenda.actions.openAt', { time: startLabel })"
          :disabled="busy"
          @click="$emit('open', entry.game)"
        >
          {{ $t('agenda.actions.open') }}
        </UiButton>

        <UiButton
          v-if="canCancel"
          class="agenda-row__button"
          variant="danger"
          type="button"
          data-test="agenda-cancel"
          :aria-label="$t('agenda.actions.cancelAt', { time: startLabel })"
          :disabled="busy"
          @click="$emit('cancel', entry.game)"
        >
          {{ $t('agenda.actions.cancel') }}
        </UiButton>
      </div>
    </template>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Game } from '@/types/game'
import {
  type AgendaEntry,
  canCancelScheduledGame,
  canEditScheduledGame,
  canOpenScheduledGame,
  formatAgendaTime,
  getAgendaStateKind,
  getAgendaStateLabelKey,
  getAgendaStateTone,
} from '@/utils/game/agenda'

const props = defineProps<{
  entry: AgendaEntry
  /** Fuseau de la salle : toutes les heures s'affichent dans celui-ci, jamais dans celui du poste. */
  timeZone: string
  nowMs: number
  /** Une action est en cours sur cette session. */
  busy: boolean
}>()

defineEmits<{
  (event: 'schedule', startsAt: string): void
  (event: 'view', game: Game): void
  (event: 'edit', game: Game): void
  (event: 'open', game: Game): void
  (event: 'cancel', game: Game): void
}>()

const { t, locale } = useI18n()

const startLabel = computed(() =>
  formatAgendaTime(props.entry.startMs, props.timeZone, locale.value)
)

const timeLabel = computed(() => {
  const { entry, timeZone } = props
  const endsAt = entry.kind === 'slot' ? entry.slot.endsAt : entry.game.scheduledEndAt

  return endsAt
    ? `${startLabel.value} – ${formatAgendaTime(endsAt, timeZone, locale.value)}`
    : startLabel.value
})

const game = computed(() => (props.entry.kind === 'game' ? props.entry.game : null))

const stateKind = computed(() =>
  game.value ? getAgendaStateKind(game.value, props.nowMs) : 'pending'
)

const canOpen = computed(() => (game.value ? canOpenScheduledGame(game.value, props.nowMs) : false))
const canEdit = computed(() => (game.value ? canEditScheduledGame(game.value) : false))
const canCancel = computed(() => (game.value ? canCancelScheduledGame(game.value) : false))

const playersLabel = computed(() => {
  const count = game.value?.playersCount ?? game.value?.participantsCount ?? 0

  return count > 0 ? t('agenda.row.players', { count }, count) : t('agenda.row.noPlayers')
})
</script>

<style scoped>
.agenda-row {
  display: grid;
  grid-template-columns: 9.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 16px;
  min-height: 64px;
  padding: 8px 4px;
  border-top: 1px solid var(--border-ui);
}

.agenda-row:first-child {
  border-top: 0;
}

.agenda-row__time {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-0);
  white-space: nowrap;
}

.agenda-row__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  min-width: 0;
  color: var(--text-1);
}

.agenda-row__meta {
  color: var(--text-2);
  font-size: 13px;
}

.agenda-row--free .agenda-row__free {
  color: var(--text-2);
}

.agenda-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.agenda-row__button.agenda-row__button {
  min-height: 48px;
}

@media (max-width: 767px) {
  .agenda-row {
    grid-template-columns: 1fr;
  }

  .agenda-row__actions {
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agenda-row__button {
    transition: none;
  }
}
</style>
