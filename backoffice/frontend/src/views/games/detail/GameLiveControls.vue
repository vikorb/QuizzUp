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
        :disabled="blockedReason !== null"
        :aria-disabled="busy"
        :aria-describedby="shownReason && blockedReason ? reasonId : undefined"
        @click="run({ command: status.paused ? 'resume' : 'pause' })"
      >
        <MdIcon :path="status.paused ? mdiPlay : mdiPause" :size="18" />
        <span>{{ $t(status.paused ? 'live.command.resume' : 'live.command.pause') }}</span>
      </UiButton>

      <UiButton
        class="game-live-controls__btn"
        type="button"
        data-test="game-live-skip"
        :disabled="skipBlockedReason !== null"
        :aria-disabled="busy"
        :aria-describedby="shownReason ? reasonId : undefined"
        @click="skip"
      >
        <MdIcon :path="mdiSkipNext" :size="18" />
        <span>{{ $t('live.command.skip') }}</span>
      </UiButton>
    </div>

    <!-- Le flux coupé est déjà dit par LiveConnectionNote : pas de second message. -->
    <p
      v-if="shownReason"
      :id="reasonId"
      class="game-live-controls__note"
      data-test="game-live-controls-reason"
    >
      {{ $t(shownReason) }}
    </p>

    <!-- Toujours présent : seul son contenu change, pour que les lecteurs d'écran l'annoncent. -->
    <div aria-live="polite" aria-atomic="true">
      <p
        v-if="message"
        class="game-live-controls__feedback"
        :data-tone="message.tone"
        data-test="game-live-command-feedback"
      >
        <span class="game-live-controls__dot" aria-hidden="true" />
        <span>{{ $t(message.key) }}</span>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { mdiPause, mdiPlay, mdiSkipNext } from '@mdi/js'
import {
  GAME_IDLE_PHASES,
  ROOM_COMMAND_RESULT,
  type RoomLive,
  type RoomStatusReport,
} from '@quizzup/shared'
import { computed, ref, useId, watch } from 'vue'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { PanelRoomCommand, RoomCommandOutcome } from '@/composables/useLiveCompany'

const props = defineProps<{
  room: RoomLive
  status: RoomStatusReport
  /** Le flux du direct n'est pas ouvert : l'état de la salle n'est pas sûr. */
  uncertain: boolean
  send: (roomId: number, command: PanelRoomCommand) => Promise<RoomCommandOutcome>
}>()

const reasonId = useId()

/** Une seule commande à la fois : tous les boutons attendent le résultat de la précédente. */
const busy = ref(false)
const feedback = ref<{ tone: 'ok' | 'error'; key: string } | null>(null)
const message = computed(() =>
  busy.value ? { tone: 'pending', key: 'live.command.pending' } : feedback.value
)

// Le dernier retour parle de la phase d'avant : il ne doit pas survivre à son changement.
watch(
  () => props.status.phase,
  () => {
    feedback.value = null
  }
)

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

// Flux coupé : LiveConnectionNote le dit déjà.
const shownReason = computed(() => (props.uncertain ? null : skipBlockedReason.value))

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

async function run(command: PanelRoomCommand) {
  // `aria-disabled` ne bloque pas le clic : la garde est ici.
  if (busy.value) {
    return
  }

  busy.value = true
  feedback.value = null

  try {
    feedback.value = toFeedback(await props.send(props.room.roomId, command))
  } finally {
    busy.value = false
  }
}

function skip(): Promise<void> {
  const target = skipTarget.value

  return target ? run({ command: 'skip', ...target }) : Promise.resolve()
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
  background: var(--text-3);
}

.game-live-controls__feedback[data-tone='ok'] .game-live-controls__dot {
  background: var(--ok);
}

.game-live-controls__feedback[data-tone='error'] .game-live-controls__dot {
  background: var(--danger);
}
</style>
