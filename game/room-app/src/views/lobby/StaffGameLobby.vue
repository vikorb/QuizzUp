<template>
  <main class="staff-lobby stage-bg">
    <RoomTopBar>
      <span>{{ $t('room.staffLobby.title') }}</span>
    </RoomTopBar>

    <section class="staff-lobby__body">
      <p
        v-if="pendingResults > 0"
        class="staff-lobby__notice"
        role="status"
        data-test="pending-results"
      >
        {{ $t('room.staffLobby.pendingResults', pendingResults) }}
      </p>

      <p v-if="status === 'loading'" class="staff-lobby__wait" role="status">
        {{ $t('room.staffLobby.loading') }}
      </p>

      <div v-else-if="status === 'waiting'" class="staff-lobby__wait" data-test="waiting-game">
        <MdIcon :path="mdiTimerSandEmpty" :size="48" />
        <h1>{{ $t('room.staffLobby.waitingTitle') }}</h1>
        <p>{{ $t('room.staffLobby.waitingText') }}</p>
      </div>

      <div
        v-else-if="status === 'offline'"
        class="staff-lobby__wait staff-lobby__wait--error"
        role="alert"
      >
        <h1>{{ $t('room.staffLobby.offlineTitle') }}</h1>
        <p>{{ $t('room.staffLobby.offlineText') }}</p>
        <UiButton @click="refresh">{{ $t('room.staffLobby.retry') }}</UiButton>
      </div>

      <template v-else-if="game">
        <h1 class="staff-lobby__title">
          {{
            $t(isRunning ? 'room.staffLobby.running' : 'room.staffLobby.ready', {
              rounds: game.roundsCount,
              questions: game.questionsPerRound,
            })
          }}
        </h1>
        <p class="staff-lobby__subtitle">
          {{
            isRunning
              ? $t(savedGame ? 'room.staffLobby.runningText' : 'room.staffLobby.runningNoSaveText')
              : $t('room.staffLobby.readyText')
          }}
        </p>

        <div class="staff-lobby__desks">
          <article
            v-for="participant in sortedParticipants"
            :key="participant.id"
            class="player"
            :class="[
              `player--${participant.podium}`,
              { 'player--ping': pinged.has(participant.podium) },
            ]"
            :data-test="`player-${participant.podium}`"
          >
            <DeskBadge :desk="participant.podium" :size="44" />
            <div class="player__text">
              <small>{{ $t('room.desk', { n: participant.podium }) }}</small>
              <strong>{{ formatDeskName(participant) }}</strong>
            </div>
            <span v-if="pinged.has(participant.podium)" class="player__ping">
              {{ $t('room.lobby.buzzerOk') }}
            </span>
          </article>
        </div>

        <p v-if="error" class="staff-lobby__error" role="alert">
          {{ $t(`room.staffLobby.errors.${error}`) }}
        </p>

        <div class="staff-lobby__actions">
          <UiButton
            v-if="isRunning && savedGame"
            variant="primary"
            class="staff-lobby__start"
            :disabled="starting"
            data-test="resume-game"
            @click="onResume"
          >
            <MdIcon :path="mdiPlay" :size="24" />
            {{ $t('room.staffLobby.resume') }}
          </UiButton>
          <UiButton
            :variant="isRunning && savedGame ? 'default' : 'primary'"
            class="staff-lobby__start"
            :disabled="starting"
            data-test="start-game"
            @click="onStart"
          >
            <MdIcon :path="isRunning ? mdiRestart : mdiPlay" :size="24" />
            {{
              starting
                ? $t('room.staffLobby.starting')
                : isRunning
                  ? $t('room.staffLobby.restart')
                  : $t('room.lobby.start')
            }}
          </UiButton>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { mdiPlay, mdiRestart, mdiTimerSandEmpty } from '@mdi/js'
import { GameSetupError } from '@quizzup/game-engine'
import { GAME_STATE_RUNNING } from '@quizzup/shared'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import DeskBadge from '@/components/game/DeskBadge.vue'
import RoomTopBar from '@/components/game/RoomTopBar.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { readBackofficeGameId, rememberBackofficeGameId } from '@/game/backofficeGame'
import { sanitizeMiniGames } from '@/game/miniGamesSetting'
import { usePendingFinishes } from '@/game/pendingFinishes'
import { createEmptyRegistration, type Registration } from '@/game/registrations'
import {
  hasSavedGame,
  NoPlayableMiniGameError,
  preloadExtracts,
  resumeSavedGame,
  startNewGame,
  validateNewGame,
} from '@/game/useRoomGame'
import { type DeskNumber, DESKS } from '@/hardware/buzzers'
import { useBuzzers } from '@/hardware/useBuzzers'
import { getRoomToken } from '@/utils/auth'
import {
  fetchCurrentContent,
  fetchCurrentGame,
  RoomApiError,
  type RoomGame,
  type RoomGameParticipant,
  startRoomGame,
} from '@/utils/roomApi'

/** Le staff lance la partie au backoffice : la salle vérifie régulièrement. */
const POLL_INTERVAL_MS = 3000
const PING_DURATION_MS = 1200
/** Une partie affichée ne disparaît qu'après plusieurs échecs de suite (micro-coupure). */
const OFFLINE_AFTER_FAILURES = 3

type Status = 'loading' | 'waiting' | 'offline' | 'ready'
type StartError =
  | 'noContent'
  | 'gameGone'
  | 'startFailed'
  | 'invalidGame'
  | 'noPlayers'
  | 'invalidSetup'
  | 'noPlayableMiniGame'

const router = useRouter()
const { t } = useI18n()
const { confirm } = useConfirm()

/** Résultats de parties terminées pas encore enregistrés au backoffice (réseau coupé). */
const { count: pendingResults } = usePendingFinishes()

const status = ref<Status>('loading')
const game = shallowRef<RoomGame | null>(null)
const starting = ref(false)
const error = ref<StartError | null>(null)
/** Une sauvegarde locale existe, et c'est bien celle de la partie `current`. */
function hasSaveFor(current: RoomGame | null): boolean {
  return current !== null && hasSavedGame() && readBackofficeGameId() === String(current.id)
}

const savedGame = ref(false)
const pinged = reactive(new Set<DeskNumber>())
const timers = new Set<ReturnType<typeof setTimeout>>()
let poller: ReturnType<typeof setInterval> | null = null
let polling = false
let failures = 0
/** L'écran a été quitté : un démarrage en cours s'arrête là, sans naviguer. */
let disposed = false

const isRunning = computed(() => game.value?.state === GAME_STATE_RUNNING)

const sortedParticipants = computed(() =>
  (game.value?.participants ?? [])
    .flatMap((participant) =>
      isDeskNumber(participant.podium) ? [{ ...participant, podium: participant.podium }] : []
    )
    .sort((left, right) => left.podium - right.podium)
)

function isDeskNumber(value: number): value is DeskNumber {
  return (DESKS as readonly number[]).includes(value)
}

/** Nom affiché d'un pupitre : un ou deux joueurs (le score est celui du pupitre). */
function formatDeskName(participant: RoomGameParticipant): string {
  return participant.secondDisplayName
    ? t('room.staffLobby.duo', {
        first: participant.displayName,
        second: participant.secondDisplayName,
      })
    : participant.displayName
}

/** Les joueurs inscrits au backoffice, au format du lobby (aucun email côté salle). */
function toRegistrations(current: RoomGame): Registration[] | StartError {
  if (current.participants.length === 0) {
    return 'noPlayers'
  }
  const registrations: Registration[] = []
  for (const participant of current.participants) {
    if (!isDeskNumber(participant.podium)) {
      return 'invalidGame'
    }
    registrations.push({
      ...createEmptyRegistration(participant.podium),
      displayName: formatDeskName(participant),
    })
  }
  return registrations
}

async function refresh(): Promise<void> {
  if (starting.value || polling) {
    return
  }
  const token = getRoomToken()
  if (!token) {
    status.value = 'offline'
    return
  }
  polling = true
  try {
    const current = await fetchCurrentGame(token)
    failures = 0
    if (starting.value || disposed) {
      return
    }
    game.value = current
    status.value = current ? 'ready' : 'waiting'
    savedGame.value = hasSaveFor(current)
  } catch {
    failures += 1
    if (!game.value || failures >= OFFLINE_AFTER_FAILURES) {
      status.value = 'offline'
    }
  } finally {
    polling = false
  }
}

useBuzzers((press) => {
  pinged.add(press.desk)
  const timer = setTimeout(() => {
    timers.delete(timer)
    pinged.delete(press.desk)
  }, PING_DURATION_MS)
  timers.add(timer)
})

async function onStart(): Promise<void> {
  const current = game.value
  const token = getRoomToken()
  if (starting.value || !current || !token) {
    return
  }
  const registrations = toRegistrations(current)
  if (typeof registrations === 'string') {
    error.value = registrations
    return
  }
  // Partie déjà commencée : la recommencer efface la progression de la salle.
  if (
    isRunning.value &&
    !(await confirm({ message: t('room.staffLobby.restartConfirm'), variant: 'danger' }))
  ) {
    return
  }

  starting.value = true
  error.value = null
  try {
    const themes = await fetchCurrentContent(token)
    if (disposed) {
      return
    }
    if (themes.length === 0) {
      error.value = 'noContent'
      return
    }
    const options = {
      registrations,
      themes,
      seed: current.seed,
      roundsCount: current.roundsCount,
      questionsPerRound: current.questionsPerRound,
      // Le choix du backoffice prime ; sans lui, le réglage local de la salle, sinon tous.
      miniGames: sanitizeMiniGames(current.miniGames),
    }
    // Le moteur valide la partie avant que le backoffice ne la passe « en cours ».
    validateNewGame(options)
    // Un extrait illisible n'empêche pas de jouer : son palier restera muet.
    await preloadExtracts(themes)
    if (disposed) {
      return
    }
    await startRoomGame(token, current.id)
    if (disposed) {
      return
    }
    startNewGame(options)
    rememberBackofficeGameId(current.id, current.seed)
  } catch (caught) {
    error.value = toStartError(caught)
    return
  } finally {
    starting.value = false
  }

  await router.push({ name: 'play' })
}

function toStartError(caught: unknown): StartError {
  if (caught instanceof NoPlayableMiniGameError) {
    return 'noPlayableMiniGame'
  }
  if (caught instanceof GameSetupError) {
    return 'invalidSetup'
  }
  return caught instanceof RoomApiError && caught.status === 404 ? 'gameGone' : 'startFailed'
}

async function onResume(): Promise<void> {
  if (starting.value) {
    return
  }
  starting.value = true
  error.value = null
  try {
    if (!(await resumeSavedGame())) {
      savedGame.value = false
      return
    }
  } finally {
    starting.value = false
  }
  if (!disposed) {
    await router.push({ name: 'play' })
  }
}

onMounted(() => {
  void refresh()
  poller = setInterval(() => void refresh(), POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  disposed = true
  if (poller !== null) {
    clearInterval(poller)
    poller = null
  }
  for (const timer of timers) {
    clearTimeout(timer)
  }
  timers.clear()
})
</script>

<style scoped>
.staff-lobby {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow-y: auto;
}

.staff-lobby__body {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 20px;
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 16px clamp(16px, 2.4vw, 36px) 32px;
  text-align: center;
}

.staff-lobby__wait {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: var(--text-1);
}

.staff-lobby__wait h1,
.staff-lobby__wait p,
.staff-lobby__title,
.staff-lobby__subtitle {
  margin: 0;
}

.staff-lobby__wait h1,
.staff-lobby__title {
  font-size: var(--stage-text);
  font-weight: 900;
  color: var(--text-0);
}

.staff-lobby__wait--error h1 {
  color: var(--danger);
}

.staff-lobby__subtitle {
  color: var(--text-1);
  font-size: var(--stage-small);
}

.staff-lobby__desks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  width: 100%;
}

.player {
  --desk-color: var(--desk-1);

  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--border-ui);
  background: var(--bg-card);
  text-align: left;
  transition:
    box-shadow 150ms ease,
    border-color 150ms ease;
}

.player--2 {
  --desk-color: var(--desk-2);
}

.player--3 {
  --desk-color: var(--desk-3);
}

.player--4 {
  --desk-color: var(--desk-4);
}

.player--ping {
  border-color: var(--desk-color);
  box-shadow: 0 0 26px var(--desk-color);
}

.player__text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.player__text small {
  color: var(--text-2);
}

.player__text strong {
  overflow: hidden;
  font-size: clamp(18px, 1.8vw, 28px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player__ping {
  color: var(--desk-color);
  font-weight: 800;
}

.staff-lobby__notice {
  margin: 0;
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid var(--warn);
  background: var(--warn-bg);
  color: var(--warn);
  font-size: var(--stage-small);
}

.staff-lobby__error {
  margin: 0;
  color: var(--danger);
}

.staff-lobby__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.staff-lobby__start {
  padding: 18px 38px;
  border-radius: 18px;
  font-size: clamp(18px, 1.8vw, 26px);
}
</style>
