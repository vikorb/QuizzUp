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

        <!-- Session programmée de la salle : « Lancer » l'ouvre puis démarre la partie. -->
        <section v-if="shownNext" class="staff-lobby__next" data-test="next-session">
          <h2>{{ $t('room.staffLobby.next.title', { when: inRoomZone(startMs, true) }) }}</h2>
          <ul v-if="sortedParticipants.length > 0" class="staff-lobby__next-desks">
            <li v-for="participant in sortedParticipants" :key="participant.id">
              {{ $t('room.desk', { n: participant.podium }) }} · {{ formatDeskName(participant) }}
            </li>
          </ul>
          <p v-if="nextStatus" class="staff-lobby__subtitle" role="status" data-test="next-status">
            {{ nextStatus }}
          </p>
          <p v-if="error" class="staff-lobby__error" role="alert">
            {{ $t(`room.staffLobby.errors.${error}`) }}
          </p>
          <UiButton
            variant="primary"
            size="lg"
            :disabled="!nextOpenable || starting"
            data-test="launch-next"
            @click="onLaunchNext"
          >
            <MdIcon :path="mdiPlay" :size="24" />
            {{ starting ? $t('room.staffLobby.starting') : $t('room.staffLobby.next.launch') }}
          </UiButton>
        </section>
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
        <p class="staff-lobby__subtitle" data-test="game-format">{{ formatLabel }}</p>

        <section
          v-if="joinOffer"
          class="staff-lobby__join"
          :class="{ 'staff-lobby__join--url-only': !joinQrSrc }"
          data-test="join"
        >
          <img
            v-if="joinQrSrc"
            class="staff-lobby__qr"
            :src="joinQrSrc"
            :alt="$t('room.staffLobby.join.qrAlt')"
            data-test="join-qr"
          />
          <div class="staff-lobby__join-text">
            <h2>{{ $t('room.staffLobby.join.title') }}</h2>
            <p class="staff-lobby__join-url" data-test="join-url">{{ joinOffer.url }}</p>
          </div>
        </section>

        <!-- Zone vivante toujours présente tant que la partie attend : seul son texte change. -->
        <p
          v-if="!isRunning"
          class="staff-lobby__subtitle"
          role="status"
          data-test="pending-registrations"
        >
          {{
            pendingRegistrations > 0 ? $t('room.staffLobby.join.pending', pendingRegistrations) : ''
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
            size="lg"
            :disabled="starting"
            data-test="resume-game"
            @click="onResume"
          >
            <MdIcon :path="mdiPlay" :size="24" />
            {{ $t('room.staffLobby.resume') }}
          </UiButton>
          <UiButton
            :variant="isRunning && savedGame ? 'default' : 'primary'"
            size="lg"
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
import {
  estimateGameDurationMs,
  GAME_FORMAT_CUSTOM,
  GAME_STATE_RUNNING,
  ROOM_DEFAULT_TIMEZONE,
  SESSION_OPEN_EARLY_MINUTES,
} from '@quizzup/shared'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
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
import { type DeskNumber, isDeskNumber } from '@/hardware/buzzers'
import { useBuzzers } from '@/hardware/useBuzzers'
import { onRoomGameUpdated, useRoomLive } from '@/live/roomLive'
import { getRoomToken } from '@/utils/auth'
import {
  fetchCurrentContent,
  fetchCurrentState,
  fetchRoomInfo,
  openRoomGame,
  RoomApiError,
  type RoomGame,
  type RoomGameParticipant,
  startRoomGame,
} from '@/utils/roomApi'

/**
 * Le staff prépare et lance la partie au backoffice : le serveur prévient la salle (`game_updated`).
 * Flux coupé, la salle relit lentement la partie jusqu'à son retour.
 */
const FALLBACK_POLL_INTERVAL_MS = 15_000
const PING_DURATION_MS = 1200
/** Rythme lent de l'horloge de l'écran : « Lancer » s'active et le retard s'affiche à la minute près. */
const NOW_TICK_MS = 30_000
/** Une partie affichée ne disparaît qu'après plusieurs échecs de suite (micro-coupure). */
const OFFLINE_AFTER_FAILURES = 3

type Status = 'loading' | 'waiting' | 'offline' | 'ready'
type StartError =
  | 'noContent'
  | 'gameGone'
  | 'startFailed'
  | 'participantsChanged'
  | 'invalidGame'
  | 'noPlayers'
  | 'invalidSetup'
  | 'noPlayableMiniGame'
  | 'notOpenYet'
  | 'roomBusy'

/** Refus 409 de « Lancer » (`POST /room/games/:id/open`) et message affiché. */
const OPEN_ERRORS = new Map<string, StartError>([
  ['session_not_open_yet', 'notOpenYet'],
  ['room_busy', 'roomBusy'],
  ['game_not_scheduled', 'gameGone'],
])

const router = useRouter()
const { t, locale } = useI18n()
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
/** Prochaine session programmée de la salle, lue seulement quand aucune partie n'attend. */
const next = shallowRef<RoomGame | null>(null)
/** Fuseau de la salle (`/room/me`, sinon celui par défaut du backoffice), lu avec la première session ; `null` = pas encore lu. */
const roomTimeZone = ref<string | null>(null)
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
const pinged = reactive(new Set<DeskNumber>())
const timers = new Set<ReturnType<typeof setTimeout>>()
let poller: ReturnType<typeof setInterval> | null = null
let polling = false
/** Un événement est arrivé pendant une lecture : elle est refaite dès qu'elle finit. */
let reloadAfter = false
let failures = 0
/** L'écran a été quitté : un démarrage en cours s'arrête là, sans naviguer. */
let disposed = false

const isRunning = computed(() => game.value?.state === GAME_STATE_RUNNING)

const MS_PER_MINUTE = 60_000
/** Nom du format et durée estimée, avec les mini-jeux de la partie (affichage seulement). */
const formatLabel = computed(() => {
  const current = game.value
  if (!current) {
    return ''
  }
  const { typicalMs, highMs } = estimateGameDurationMs({
    roundsCount: current.roundsCount,
    questionsPerRound: current.questionsPerRound,
    miniGames: current.miniGames ?? undefined,
  })
  return t('room.staffLobby.format', {
    name: t(`room.lobby.formats.${current.format ?? GAME_FORMAT_CUSTOM}`),
    min: Math.round(typicalMs / MS_PER_MINUTE),
    max: Math.ceil(highMs / MS_PER_MINUTE),
  })
})

/**
 * Le serveur renvoie `join: null` dès que le lien est fermé ou expiré : on s'y fie. Sans QR, une
 * adresse relative (serveur sans adresse publique) est inutilisable : on ne l'affiche pas.
 */
const joinOffer = computed(() => {
  const link = isRunning.value ? null : (game.value?.join ?? null)
  return link && (link.qrSvg || /^https?:\/\//i.test(link.url)) ? link : null
})
/** Le QR est un SVG rendu par `<img>` (jamais `v-html`) : aucun script de la réponse ne s'exécute. */
const joinQrSrc = computed(() =>
  joinOffer.value?.qrSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(joinOffer.value.qrSvg)}`
    : null
)
const pendingRegistrations = computed(() => game.value?.pendingRegistrationsCount ?? 0)

const sortedParticipants = computed(() =>
  ((game.value ?? shownNext.value)?.participants ?? [])
    .flatMap((participant) =>
      isDeskNumber(participant.podium) ? [{ ...participant, podium: participant.podium }] : []
    )
    .sort((left, right) => left.podium - right.podium)
)

/**
 * La session programmée affichée : son fuseau est connu (sinon l'heure serait celle du PC) et son
 * créneau n'est pas fini. Le serveur cesse de la renvoyer à la fin du créneau ; l'horloge de l'écran
 * la retire sans attendre la lecture suivante.
 */
const shownNext = computed(() => {
  const session = next.value
  if (!session?.scheduledAt || roomTimeZone.value === null) {
    return null
  }
  return Date.parse(session.scheduledEndAt ?? '') <= now.value ? null : session
})
const startMs = computed(() => Date.parse(shownNext.value?.scheduledAt ?? ''))
const opensMs = computed(() => startMs.value - SESSION_OPEN_EARLY_MINUTES * MS_PER_MINUTE)
const nextOpenable = computed(() => now.value >= opensMs.value)
const nextStatus = computed(() => {
  if (!nextOpenable.value) {
    return t('room.staffLobby.next.opensAt', { time: inRoomZone(opensMs.value, true) })
  }
  const late = Math.floor((now.value - startMs.value) / MS_PER_MINUTE)
  return late >= 1 ? t('room.staffLobby.next.late', { n: late }) : ''
})

/** Heure (et jour) dans le fuseau de la salle, jamais celui du PC. */
function inRoomZone(ms: number, withDay: boolean): string {
  return new Intl.DateTimeFormat(locale.value, {
    ...(withDay ? { weekday: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: roomTimeZone.value ?? undefined,
  }).format(ms)
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

/** Fuseau de la salle, comme le backoffice qui programme ses sessions. Lecture ratée : session cachée, relue plus tard. */
async function readTimeZone(token: string): Promise<void> {
  roomTimeZone.value = await fetchRoomInfo(token).then(
    (room) => room.schedule?.timezone ?? ROOM_DEFAULT_TIMEZONE,
    () => null
  )
}

async function refresh(): Promise<void> {
  if (starting.value) {
    return
  }
  if (polling) {
    reloadAfter = true
    return
  }
  const token = getRoomToken()
  if (!token) {
    status.value = 'offline'
    return
  }
  polling = true
  try {
    const { game: current, next: coming } = await fetchCurrentState(token)
    const upcoming = current ? null : coming
    if (upcoming && roomTimeZone.value === null) {
      await readTimeZone(token)
    }
    failures = 0
    if (starting.value || disposed) {
      return
    }
    now.value = Date.now()
    // Une autre partie ou session a pris la place de celle affichée : son message d'erreur ne la suit pas.
    if ((current ?? upcoming)?.id !== (game.value ?? next.value)?.id) {
      error.value = null
    }
    game.value = current
    next.value = upcoming
    status.value = current ? 'ready' : 'waiting'
    savedGame.value = hasSaveFor(current)
  } catch {
    failures += 1
    if (!game.value || failures >= OFFLINE_AFTER_FAILURES) {
      status.value = 'offline'
    }
  } finally {
    polling = false
    if (reloadAfter && !disposed) {
      reloadAfter = false
      void refresh()
    }
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

const onStart = (): Promise<void> => launch(game.value)
const onLaunchNext = (): Promise<void> => launch(shownNext.value, true)

/** `opening` : la partie est une session programmée, que le backoffice ouvre avant le démarrage. */
async function launch(first: RoomGame | null, opening = false): Promise<void> {
  const token = getRoomToken()
  if (starting.value || !first || !token) {
    return
  }
  const checked = toRegistrations(first)
  if (typeof checked === 'string') {
    error.value = checked
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
    let current = first
    let registrations = checked
    if (opening) {
      await openRoomGame(token, first.id)
      // La partie démarre avec ce que le serveur a après l'ouverture, pas avec `next` lu avant.
      const opened = (await fetchCurrentState(token)).game
      if (!opened) {
        throw new RoomApiError(404, 'game_not_found')
      }
      const players = toRegistrations(opened)
      if (typeof players === 'string') {
        error.value = players
        return
      }
      current = opened
      registrations = players
    }
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
    // Les pupitres chargés : le backoffice refuse (409) si le staff a changé la liste entre-temps.
    await startRoomGame(
      token,
      current.id,
      current.participants.map((participant) => participant.podium)
    )
    if (disposed) {
      return
    }
    startNewGame(options)
    rememberBackofficeGameId(current.id, current.seed)
  } catch (caught) {
    error.value = toStartError(caught)
    if (error.value === 'participantsChanged' && !opening && !disposed) {
      // Le relevé affiché est périmé : on le recharge (`refresh` ne tourne pas pendant `starting`).
      starting.value = false
      await refresh()
    }
    return
  } finally {
    starting.value = false
    // « Lancer » a échoué : la session a changé (refusée, annulée, ouverte) et l'écran la relit.
    if (opening && error.value !== null && !disposed) {
      void refresh()
    }
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
  if (caught instanceof RoomApiError && caught.status === 404) {
    return 'gameGone'
  }
  if (caught instanceof RoomApiError && caught.status === 409) {
    return caught.code === 'game_participants_changed'
      ? 'participantsChanged'
      : (OPEN_ERRORS.get(caught.code) ?? 'startFailed')
  }
  return 'startFailed'
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

const { connected } = useRoomLive()
let stopListening: (() => void) | null = null

function stopPoller(): void {
  if (poller !== null) {
    clearInterval(poller)
    poller = null
  }
}

// Flux ouvert : plus de lecture périodique, mais une lecture pour rattraper ce qui a pu passer
// pendant la coupure. Flux fermé : lecture lente.
watch(connected, (isConnected) => {
  stopPoller()
  if (isConnected) {
    void refresh()
  } else {
    poller = setInterval(() => void refresh(), FALLBACK_POLL_INTERVAL_MS)
  }
})

onMounted(() => {
  void refresh()
  stopListening = onRoomGameUpdated(() => void refresh())
  clock = setInterval(() => (now.value = Date.now()), NOW_TICK_MS)
  if (!connected.value) {
    poller = setInterval(() => void refresh(), FALLBACK_POLL_INTERVAL_MS)
  }
})

onBeforeUnmount(() => {
  disposed = true
  stopPoller()
  if (clock !== null) {
    clearInterval(clock)
    clock = null
  }
  stopListening?.()
  stopListening = null
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

.staff-lobby__join {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--stage-gap);
}

.staff-lobby__qr {
  /* Fond clair autour des modules et taille lisible de 3 à 4 m. */
  box-sizing: border-box;
  width: clamp(240px, 38vh, 420px);
  aspect-ratio: 1;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--qr-paper);
  image-rendering: crisp-edges;
}

.staff-lobby__join-text {
  display: grid;
  gap: 10px;
  max-width: 560px;
  text-align: left;
}

.staff-lobby__join--url-only .staff-lobby__join-text {
  text-align: center;
}

.staff-lobby__join-text h2,
.staff-lobby__join-url {
  margin: 0;
}

.staff-lobby__join-text h2 {
  font-size: var(--stage-text);
  font-weight: 900;
  color: var(--text-0);
}

.staff-lobby__join-url {
  color: var(--text-0);
  font-size: var(--stage-text);
  font-weight: 700;
  overflow-wrap: anywhere;
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
  border-radius: var(--radius-card);
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

.player--5 {
  --desk-color: var(--desk-5);
}

.player--6 {
  --desk-color: var(--desk-6);
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

.staff-lobby__next {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin-top: 12px;
}

.staff-lobby__next h2 {
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}

.staff-lobby__next-desks {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-1);
}

.staff-lobby__notice {
  margin: 0;
  padding: 8px 16px;
  border-radius: var(--radius-ctl);
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
</style>
