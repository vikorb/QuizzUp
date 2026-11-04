import type { EngineTheme, GameEvent, GameSetup, GameState } from '@quizzup/game-engine'
import { createGame, FLASH_BLIND_TEST_STAGE_DURATIONS_MS, MAX_SEED } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST, type MiniGame } from '@quizzup/shared'
import { computed, ref, shallowRef } from 'vue'

import { createAudioBridge } from '@/audio/audioBridge'
import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { createUiSoundBridge, type UiSoundOutput } from '@/audio/uiSoundBridge'
import {
  isRememberedBackofficeSeed,
  isRememberedForCurrentAccount,
  readSavedBackofficeGame,
} from '@/game/backofficeGameMemory'
import { collectMediaUrls } from '@/game/content'
import { readMiniGamesSetting } from '@/game/miniGamesSetting'
import {
  finalizeRegistrations,
  type Registration,
  toEngineParticipants,
} from '@/game/registrations'
import {
  createLocalSessionStorage,
  GameSession,
  type SessionSnapshot,
  type SessionStorage,
} from '@/game/session'
import type { BuzzerPress } from '@/hardware/buzzers'
import { isDemoMode } from '@/utils/auth'

/**
 * État de jeu partagé par les écrans de la salle (une seule partie à la fois).
 * La boucle de tick fait avancer les délais du moteur ; les événements sont
 * relayés au lecteur audio et aux écouteurs d'effets (sons, lumières).
 */
const TICK_INTERVAL_MS = 50

const session = shallowRef<GameSession | null>(null)
const state = shallowRef<GameState | null>(null)
const now = ref(0)
const eventListeners = new Set<(events: GameEvent[]) => void>()

let storage: SessionStorage = createLocalSessionStorage()
let player: ExtractPlayer = createSilentExtractPlayer()
let audioBridge = createAudioBridge(player)
let soundBridge = createUiSoundBridge({ play: () => undefined })
let mediaFetch: ((url: string) => Promise<Response>) | undefined
let clock: () => number = () => performance.now()
let ticker: ReturnType<typeof setInterval> | null = null
let unsubscribe: (() => void) | null = null

export function configureRoomGame(options: {
  storage?: SessionStorage
  player?: ExtractPlayer
  /** Sons d'interface (buzz, bonne / mauvaise réponse…). */
  sounds?: UiSoundOutput
  /** Téléchargement des extraits (ajoute le jeton de la salle pour les médias du backoffice). */
  fetchMedia?: (url: string) => Promise<Response>
  now?: () => number
}): void {
  if (options.sounds) {
    soundBridge = createUiSoundBridge(options.sounds)
  }
  if (options.fetchMedia) {
    mediaFetch = options.fetchMedia
  }
  if (options.storage) {
    storage = options.storage
  }
  if (options.player) {
    player = options.player
    audioBridge = createAudioBridge(player)
  }
  if (options.now) {
    clock = options.now
  }
}

export function getExtractPlayer(): ExtractPlayer {
  return player
}

function stopTicking(): void {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

function attach(next: GameSession): void {
  unsubscribe?.()
  stopTicking()
  session.value = next
  state.value = next.state
  now.value = next.now()

  unsubscribe = next.onChange((nextState, events) => {
    state.value = nextState
    now.value = next.now()

    if (events.length > 0) {
      audioBridge.handleEvents(events)
      soundBridge.handleEvents(events)
      for (const listener of eventListeners) {
        listener(events)
      }
    }

    if (next.isOver) {
      stopTicking()
    }
  })

  if (!next.isOver) {
    ticker = setInterval(() => next.tick(), TICK_INTERVAL_MS)
  }
}

/** Relance l'extrait du palier en cours d'une partie reprise. */
function restoreAudio(resumed: GameSession): void {
  const { phase } = resumed.state

  if (phase.name !== 'question' || phase.miniGameState.kind !== MINI_GAME_FLASH_BLIND_TEST) {
    return
  }

  const mini = phase.miniGameState
  const pausedAt = mini.status === 'answering' ? mini.pausedAt : null
  const paused = pausedAt !== null
  const reference = pausedAt ?? resumed.now()

  audioBridge.restore({
    mediaUrl: mini.question.mediaUrl,
    mediaStartMs: mini.question.mediaStartMs,
    extractMs: FLASH_BLIND_TEST_STAGE_DURATIONS_MS[mini.stageIndex] ?? 0,
    elapsedMs: Math.max(0, reference - mini.stageStartedAt),
    paused,
  })
}

/**
 * Télécharge et décode les extraits des thèmes avant la partie (lecture sans
 * blanc, hors ligne). Ne rejette jamais : renvoie les URL en échec.
 */
export async function preloadExtracts(
  themes: EngineTheme[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const urls = collectMediaUrls(themes)
  if (urls.length === 0) {
    return []
  }
  try {
    const { failed } = await player.preload(urls, { fetch: mediaFetch, onProgress })
    return failed
  } catch {
    return urls
  }
}

export function createSeed(): number {
  const values = new Uint32Array(1)
  globalThis.crypto.getRandomValues(values)
  return Math.min(values[0] ?? 0, MAX_SEED)
}

export type NewGameOptions = {
  registrations: Registration[]
  themes: EngineTheme[]
  roundsCount?: number
  questionsPerRound?: number
  /** Mini-jeux tirés au sort (réglage de la salle, sinon tous). */
  miniGames?: MiniGame[]
  seed?: number
}

function buildSetup(options: NewGameOptions, registrations: Registration[]): GameSetup {
  return {
    seed: options.seed ?? createSeed(),
    participants: toEngineParticipants(registrations),
    themes: options.themes,
    roundsCount: options.roundsCount,
    questionsPerRound: options.questionsPerRound,
    // Tous les mini-jeux par défaut, ou le réglage de la salle.
    miniGames: options.miniGames ?? readMiniGamesSetting(),
  }
}

/**
 * Vérifie avec le moteur qu'une partie peut être créée (graine, format, joueurs,
 * contenu), sans rien sauvegarder ni lancer : lève l'erreur du moteur sinon.
 */
export function validateNewGame(options: NewGameOptions & { seed: number }): void {
  createGame(buildSetup(options, finalizeRegistrations(options.registrations)))
}

export function startNewGame(options: NewGameOptions): GameSession {
  const registrations = finalizeRegistrations(options.registrations)
  const next = GameSession.create(buildSetup(options, registrations), registrations, {
    storage,
    now: clock,
    demo: isDemoMode(),
  })

  attach(next)
  next.start()
  return next
}

/**
 * Une sauvegarde est-elle reprenable dans le contexte courant ? En démo : seulement une partie
 * démo. Avec un compte de salle : la partie retenue du backoffice (même graine) pour ce
 * compte ; une sauvegarde d'avant le champ `demo` suit la règle de la graine.
 */
function matchesCurrentContext(snapshot: SessionSnapshot): boolean {
  if (isDemoMode()) {
    return snapshot.demo === true
  }
  return (
    snapshot.demo !== true &&
    isRememberedBackofficeSeed(snapshot.setup.seed) &&
    isRememberedForCurrentAccount(readSavedBackofficeGame())
  )
}

/**
 * Une sauvegarde peut-elle encore servir plus tard ? Une partie de salle dont la graine est
 * retenue par le backoffice est gardée quel que soit le mode ou le compte connecté (jeton
 * expiré puis mode démo, ou autre compte : elle revient à la reconnexion du bon compte).
 */
function mayStillBeResumed(snapshot: SessionSnapshot): boolean {
  return snapshot.demo !== true && isRememberedBackofficeSeed(snapshot.setup.seed)
}

/** Une sauvegarde existe ET peut être reprise dans le contexte courant (démo ou compte). */
export function hasSavedGame(): boolean {
  const snapshot = storage.load()
  return snapshot !== null && matchesCurrentContext(snapshot)
}

/**
 * Efface la sauvegarde devenue inutile : partie démo hors du mode démo, ou partie sans
 * mémoire du backoffice (terminée et envoyée, abandonnée, ancienne). Garde toute partie de
 * salle dont la graine est retenue, même si elle n'est pas proposée dans le contexte courant.
 * Sans effet pendant qu'une partie tourne : sa sauvegarde est la progression.
 */
export function discardStaleSavedGame(): void {
  if (session.value) {
    return
  }
  const snapshot = storage.load()
  if (!snapshot) {
    return
  }
  const demoInDemo = isDemoMode() && snapshot.demo === true
  if (!demoInDemo && !mayStillBeResumed(snapshot)) {
    storage.clear()
  }
}

/**
 * Reprend la partie sauvegardée dans le navigateur (après un rechargement) : les
 * extraits sont rechargés avant que l'horloge ne reparte.
 */
export async function resumeSavedGame(): Promise<boolean> {
  if (!hasSavedGame()) {
    discardStaleSavedGame()
    return false
  }

  const resumed = GameSession.resume({ storage, now: clock })

  if (!resumed) {
    return false
  }

  await preloadExtracts(resumed.state.setup.themes)
  attach(resumed)
  restoreAudio(resumed)
  return true
}

/** Oublie la partie sauvegardée sans la reprendre. */
export function discardSavedGame(): void {
  storage.clear()
}

export function pressBuzzer(press: BuzzerPress): void {
  session.value?.press(press.desk, press.buttonIndex, press.at)
}

export function abortGame(reason = 'operator_abort'): void {
  session.value?.abort(reason)
}

/** Ferme la partie et oublie sa sauvegarde. */
export function closeGame(): void {
  stopTicking()
  unsubscribe?.()
  unsubscribe = null
  player.stop()
  session.value?.discard()
  session.value = null
  state.value = null
}

export function onGameEvents(listener: (events: GameEvent[]) => void): () => void {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

export function useRoomGame() {
  return {
    session: computed(() => session.value),
    state: computed(() => state.value),
    now: computed(() => now.value),
  }
}
