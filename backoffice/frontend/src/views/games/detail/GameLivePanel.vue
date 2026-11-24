<template>
  <BaseCard
    v-if="status"
    :title="$t('live.panel.title')"
    :neon="true"
    :no-hover="true"
    class="game-live-card"
    data-test="game-live-panel"
  >
    <!-- Seule zone annoncée aux lecteurs d'écran : présence et pause, pas les scores. -->
    <div class="game-live__head">
      <p
        class="game-live__presence"
        :data-presence="kind"
        aria-live="polite"
        aria-atomic="true"
        data-test="game-live-presence"
      >
        <span class="game-live__dot" aria-hidden="true" />
        <span class="game-live__presence-label">{{ $t(getRoomPresenceLabelKey(kind)) }}</span>
        <StatusPill
          v-if="showPaused"
          tone="warn"
          :label="$t('live.panel.paused')"
          data-test="game-live-paused"
        />
      </p>

      <p v-if="seenText" class="game-live__note" data-test="game-live-seen">{{ seenText }}</p>
    </div>

    <p v-if="stale" class="game-live__note" data-test="game-live-stale">
      {{ $t('live.panel.stale') }}
    </p>

    <dl class="game-live__steps">
      <div class="game-live__step">
        <dt>{{ $t('live.panel.phase') }}</dt>
        <dd data-test="game-live-phase">{{ phaseLabel }}</dd>
      </div>

      <div class="game-live__step">
        <dt>{{ $t('live.panel.round') }}</dt>
        <dd data-test="game-live-round">{{ roundLabel }}</dd>
      </div>

      <div class="game-live__step">
        <dt>{{ $t('live.panel.question') }}</dt>
        <dd data-test="game-live-question">{{ questionLabel }}</dd>
      </div>

      <div class="game-live__step">
        <dt>{{ $t('live.panel.miniGame') }}</dt>
        <dd data-test="game-live-mini-game">{{ miniGameLabel }}</dd>
      </div>
    </dl>

    <p class="game-live__subtitle">{{ $t('live.panel.scoresTitle') }}</p>

    <p v-if="scoreLines.length === 0" class="game-live__note" data-test="game-live-no-scores">
      {{ $t('live.panel.noScores') }}
    </p>

    <ul v-else class="game-live__scores">
      <li
        v-for="line in scoreLines"
        :key="line.podium"
        class="game-live__score-line"
        :data-test="`game-live-score-${line.podium}`"
      >
        <span class="game-live__podium">
          <span class="sr-only">{{ $t('live.panel.desk', { podium: line.podium }) }}</span>
          <span aria-hidden="true">{{ line.podium }}</span>
        </span>
        <span class="game-live__names">{{ line.names }}</span>
        <span class="game-live__score">{{ line.score }}</span>
      </li>
    </ul>

    <LiveConnectionNote v-if="uncertain" :state="connection" :error-key="errorKey" />
  </BaseCard>

  <!-- Flux refusé ou coupé avant le premier instantané : sans cela, l'écran resterait muet. -->
  <div v-else-if="connectionFailed" class="game-live-card" data-test="game-live-failure">
    <LiveConnectionNote :state="connection" :error-key="errorKey" />
  </div>
</template>

<script setup lang="ts">
import {
  GAME_PHASE_ABORTED,
  GAME_PHASE_FINISHED,
  GAME_PHASES,
  type GamePhaseName,
} from '@quizzup/shared'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import LiveConnectionNote from '@/components/ui/LiveConnectionNote.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { useLiveCompany } from '@/composables/useLiveCompany'
import type { Game } from '@/types/game'
import { getGameMiniGameLabelKey } from '@/utils/game/format'
import { isGamePendingOrRunning } from '@/utils/game/state'
import { formatSeenAgo, getRoomPresenceKind, getRoomPresenceLabelKey } from '@/utils/room/presence'

const props = defineProps<{
  game: Game
}>()

const emit = defineEmits<{
  /** La salle annonce la fin ou l'arrêt de la partie : l'écran doit la relire. */
  ended: []
}>()

const { t, locale } = useI18n()

// Une partie terminée ou arrêtée n'a plus rien à suivre : pas de flux ouvert pour elle.
const {
  rooms,
  state: connection,
  errorKey,
  uncertain,
  now,
} = useLiveCompany(() => (isGamePendingOrRunning(props.game) ? props.game.companyId : null))

const room = computed(() => rooms.value[props.game.roomId] ?? null)

// Le panneau n'existe que si la salle joue bien cette partie.
const status = computed(() =>
  room.value?.status?.gameId === props.game.id ? room.value.status : null
)

// Le watch ne réagit qu'à un changement de phase : une seule relecture par passage.
watch(
  () => status.value?.phase,
  (phase) => {
    if (phase === GAME_PHASE_FINISHED || phase === GAME_PHASE_ABORTED) {
      emit('ended')
    }
  }
)

// Pas de rapport à montrer, mais un flux en échec sur une partie à suivre : on le dit.
const connectionFailed = computed(
  () =>
    isGamePendingOrRunning(props.game) &&
    (connection.value === 'error' ||
      (connection.value === 'reconnecting' && errorKey.value !== null))
)

const kind = computed(() => getRoomPresenceKind(room.value, uncertain.value))

// Salle hors ligne ou flux coupé : les valeurs affichées sont les dernières reçues.
const stale = computed(() => kind.value === 'offline' || kind.value === 'unknown')

// Une pause d'une salle qu'on ne voit plus n'est pas une information fiable.
const showPaused = computed(() => !stale.value && status.value?.paused === true)

const seenText = computed(() => {
  if (kind.value !== 'offline' || !room.value) {
    return null
  }

  const ago = room.value.lastSeenAt
    ? formatSeenAgo(room.value.lastSeenAt, now.value, locale.value)
    : null

  return ago ? t('live.presence.seenAgo', { ago }) : t('live.presence.neverSeen')
})

const NONE = '—'

const phaseLabel = computed(() => {
  const phase: GamePhaseName | null | undefined = status.value?.phase

  return phase && GAME_PHASES.includes(phase) ? t(`live.phase.${phase}`) : NONE
})

const roundLabel = computed(() =>
  status.value?.round
    ? t('live.panel.roundValue', { round: status.value.round, total: props.game.roundsCount })
    : NONE
)

// `questionIndex` part de 0 dans le rapport de la salle.
const questionLabel = computed(() => {
  const index = status.value?.questionIndex

  return typeof index === 'number' ? t('live.panel.questionValue', { question: index + 1 }) : NONE
})

const miniGameLabel = computed(() =>
  status.value?.miniGame ? t(getGameMiniGameLabelKey(status.value.miniGame)) : NONE
)

// Les noms viennent de la partie affichée : la salle ne publie que des numéros de pupitre.
const scoreLines = computed(() =>
  (status.value?.scores ?? []).map(({ podium, score }) => {
    const participant = props.game.participants?.find((candidate) => candidate.podium === podium)
    const names = participant
      ? [participant.displayName, participant.secondPlayer?.displayName]
          .filter((name): name is string => Boolean(name))
          .join(' · ')
      : ''

    return { podium, score, names: names || NONE }
  })
)
</script>

<style scoped>
.game-live-card {
  margin-top: 18px;
}

.game-live__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
}

.game-live__presence {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--text-0);
}

.game-live__presence-label {
  font-weight: 800;
}

/* La couleur de statut reste sur le point : le texte porte le sens. */
.game-live__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-3);
}

.game-live__presence[data-presence='online'] .game-live__dot {
  background: var(--ok);
}

.game-live__presence[data-presence='in_game'] .game-live__dot {
  background: var(--edit);
}

.game-live__presence[data-presence='unknown'] .game-live__dot {
  background: var(--warn);
}

.game-live__note {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.game-live__steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 14px 0 0;
}

.game-live__step {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.game-live__step dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.game-live__step dd {
  margin: 0;
  color: var(--text-0);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.game-live__subtitle {
  margin: 20px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.game-live__scores {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.game-live__score-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 8px 14px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-0);
}

.game-live__podium {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-2);
  border-radius: 50%;
  color: var(--text-1);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.game-live__names {
  color: var(--text-0);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.game-live__score {
  color: var(--accent-cyan);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* Texte lu par les lecteurs d'écran seulement (même motif que le plan de salle). */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .game-live__steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .game-live__steps {
    grid-template-columns: 1fr;
  }
}
</style>
