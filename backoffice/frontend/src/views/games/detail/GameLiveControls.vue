<template>
  <section
    class="game-live-controls"
    :aria-label="$t('live.command.title')"
    data-test="game-live-controls"
  >
    <div class="game-live-controls__actions">
      <UiButton
        class="game-live-controls__btn"
        type="button"
        data-test="game-live-toggle-pause"
        :disabled="busy || blockedReason !== null"
        @click="run({ command: status.paused ? 'resume' : 'pause' })"
      >
        <MdIcon :path="status.paused ? mdiPlay : mdiPause" :size="18" />
        <span>{{ $t(status.paused ? 'live.command.resume' : 'live.command.pause') }}</span>
      </UiButton>

      <UiButton
        class="game-live-controls__btn"
        type="button"
        data-test="game-live-skip"
        :disabled="busy || skipBlockedReason !== null"
        @click="skip"
      >
        <MdIcon :path="mdiSkipNext" :size="18" />
        <span>{{ $t('live.command.skip') }}</span>
      </UiButton>

      <UiButton
        class="game-live-controls__btn"
        variant="danger"
        type="button"
        data-test="game-live-abort"
        :disabled="busy || blockedReason !== null"
        @click="abort"
      >
        <MdIcon :path="mdiStopCircleOutline" :size="18" />
        <span>{{ $t('live.command.abort') }}</span>
      </UiButton>
    </div>

    <p
      v-if="skipBlockedReason"
      class="game-live-controls__note"
      data-test="game-live-controls-reason"
    >
      {{ $t(skipBlockedReason) }}
    </p>

    <p
      v-if="feedback"
      class="game-live-controls__feedback"
      :data-tone="feedback.tone"
      :role="feedback.tone === 'ok' ? 'status' : 'alert'"
      data-test="game-live-command-feedback"
    >
      <span class="game-live-controls__dot" aria-hidden="true" />
      <span>{{ $t(feedback.key) }}</span>
    </p>
  </section>
</template>

<script setup lang="ts">
import { mdiPause, mdiPlay, mdiSkipNext, mdiStopCircleOutline } from '@mdi/js'
import {
  GAME_IDLE_PHASES,
  ROOM_COMMAND_RESULT,
  type RoomCommand,
  type RoomLive,
  type RoomStatusReport,
} from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type ConfirmOptions, useConfirm } from '@/composables/useConfirm'
import type { RoomCommandOutcome } from '@/composables/useLiveCompany'

const props = defineProps<{
  room: RoomLive
  status: RoomStatusReport
  /** Le flux du direct n'est pas ouvert : l'état de la salle n'est pas sûr. */
  uncertain: boolean
  send: (roomId: number, command: RoomCommand) => Promise<RoomCommandOutcome>
}>()

const { t } = useI18n()
const { confirm } = useConfirm()

/** Une seule commande à la fois : tous les boutons attendent le résultat de la précédente. */
const busy = ref(false)
const feedback = ref<{ tone: 'ok' | 'error'; key: string } | null>(null)

/** Clé i18n de ce qui rend toute commande impossible, `null` si la salle est pilotable. */
const blockedReason = computed(() => {
  const phase = props.status.phase

  if (props.uncertain) {
    return 'live.command.disabled.stream'
  }

  if (!props.room.controllable) {
    return 'live.command.disabled.offline'
  }

  if (props.status.screen !== 'play') {
    return 'live.command.disabled.screen'
  }

  return phase === null || GAME_IDLE_PHASES.includes(phase) ? 'live.command.disabled.noGame' : null
})

// `round` et `questionIndex` ne sont publiés que pendant une question (ou sa réponse).
const skipTarget = computed(() => {
  const { phase, round, questionIndex } = props.status

  return phase === 'question' && round !== null && questionIndex !== null
    ? { round, questionIndex }
    : null
})

const skipBlockedReason = computed(() => {
  if (blockedReason.value) {
    return blockedReason.value
  }

  if (props.status.paused) {
    return 'live.command.disabled.skipPaused'
  }

  return skipTarget.value ? null : 'live.command.disabled.skipPhase'
})

function toFeedback(outcome: RoomCommandOutcome): { tone: 'ok' | 'error'; key: string } {
  if (outcome.result === 'error') {
    return { tone: 'error', key: `live.command.error.${outcome.code}` }
  }

  if (outcome.result === ROOM_COMMAND_RESULT.APPLIED) {
    return { tone: 'ok', key: 'live.command.result.applied' }
  }

  if (outcome.result === ROOM_COMMAND_RESULT.REFUSED && outcome.reason) {
    return { tone: 'error', key: `live.command.refusal.${outcome.reason}` }
  }

  return { tone: 'error', key: `live.command.result.${outcome.result}` }
}

async function run(command: RoomCommand, confirmation?: ConfirmOptions) {
  if (busy.value) {
    return
  }

  busy.value = true
  feedback.value = null

  try {
    if (confirmation && !(await confirm(confirmation))) {
      return
    }

    feedback.value = toFeedback(await props.send(props.room.roomId, command))
  } finally {
    busy.value = false
  }
}

function skip(): Promise<void> {
  const target = skipTarget.value

  return target ? run({ command: 'skip', ...target }) : Promise.resolve()
}

function abort(): Promise<void> {
  const { gameId } = props.status

  return gameId === null
    ? Promise.resolve()
    : run(
        { command: 'abort', gameId },
        {
          title: t('live.command.abortTitle'),
          message: t('live.command.abortConfirm'),
          confirmLabel: t('live.command.abort'),
          cancelLabel: t('confirm.cancel'),
          variant: 'danger',
        }
      )
}
</script>

<style scoped>
.game-live-controls {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.game-live-controls__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* Cible tactile : 48 px au moins. */
.game-live-controls__btn {
  min-height: 48px;
  min-width: 48px;
}

.game-live-controls__note {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.game-live-controls__feedback {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--text-0);
  font-weight: 600;
}

/* La couleur de statut reste sur le point : le texte porte le sens. */
.game-live-controls__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}

.game-live-controls__feedback[data-tone='error'] .game-live-controls__dot {
  background: var(--danger);
}
</style>
