import type { EngineTheme, GameEvent, GameSetup, GameState } from '@quizzup/game-engine'
import {
  createGame,
  getFlashBlindTestStageDurationsMs,
  getPlayableMiniGames,
  MAX_SEED,
} from '@quizzup/game-engine'
import {
  GAME_COMMAND_REFUSAL,
  MINI_GAME_FLASH_BLIND_TEST,
  type MiniGame,
  ROOM_CONTENT_MAX_IDS,
} from '@quizzup/shared'
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
import { setMediaCredits } from '@/game/mediaCredits'
import { readMiniGamesSetting } from '@/game/miniGamesSetting'
import {
  finalizeRegistrations,
  type Registration,
  toEngineParticipants,
} from '@/game/registrations'
import {
  createLocalSessionStorage,
  type GameCommandResult,
  GameSession,
  refuse,
  type SessionSnapshot,
  type SessionStorage,
} from '@/game/session'
import type { BuzzerPress } from '@/hardware/buzzers'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { fetchCurrentContent, type RoomQuestion } from '@/utils/roomApi'

/**
 * État de jeu partagé par les écrans de la salle (une seule partie à la fois).
 * La boucle de tick fait avancer les délais du moteur ; les événements sont
 * relayés au lecteur audio et aux écouteurs d'effets (sons, lumières).
 */
const TICK_INTERVAL_MS = 50
/** Délai du contenu redemandé à la reprise : au-delà, la sauvegarde est reprise telle quelle. */
const RESUME_CONTENT_TIMEOUT_MS = 5000

const session = shallowRef<GameSession | null>(null)
const state = shallowRef<GameState | null>(null)
const now = ref(0)
const paused = ref(false)
const eventListeners = new Set<(events: GameEvent[]) => void>()

let storage: SessionStorage = createLocalSessionStorage()
let player: ExtractPlayer = createSilentExtractPlayer()
let audioBridge = createAudioBridge(player)
let soundBridge = createUiSoundBridge({ play: () => undefined })
let mediaFetch: ((url: string) => Promise<Response>) | undefined
let clock: () => number = () => performance.now()
let ticker: ReturnType<typeof setInterval> | null = null
let unsubscribe: (() => void) | null = null

let uiSounds: UiSoundOutput | null = null
/** À la reprise, relancer l'extrait ? Non s'il était déjà arrêté avant la pause (joueur qui répond). */
let resumeExtractOnResume = false

/** Joue un son d'interface (sans effet tant que l'audio n'est pas configuré). */
export function playUiSound(name: Parameters<UiSoundOutput['play']>[0]): void {
  uiSounds?.play(name)
}

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
    uiSounds = options.sounds
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
  paused.value = next.paused

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

/** Instant où un joueur a buzzé et où l'extrait attend sa réponse (blind test), sinon `null`. */
function getBlindTestPausedAt(current: GameState | null): number | null {
  const phase = current?.phase

  if (phase?.name !== 'question' || phase.miniGameState.kind !== MINI_GAME_FLASH_BLIND_TEST) {
    return null
  }

  return phase.miniGameState.status === 'answering' ? phase.miniGameState.pausedAt : null
}

/** Relance l'extrait du palier en cours d'une partie reprise. */
function restoreAudio(resumed: GameSession): void {
  const { phase } = resumed.state

  if (phase.name !== 'question' || phase.miniGameState.kind !== MINI_GAME_FLASH_BLIND_TEST) {
    return
  }

  const mini = phase.miniGameState
  const pausedAt = getBlindTestPausedAt(resumed.state)
  const answering = pausedAt !== null
  const reference = pausedAt ?? resumed.now()

  audioBridge.restore({
    mediaUrl: mini.question.mediaUrl,
    mediaStartMs: mini.question.mediaStartMs,
    audioEffect: mini.question.audioEffect,
    extractMs: getFlashBlindTestStageDurationsMs(mini.question)[mini.stageIndex] ?? 0,
    elapsedMs: Math.max(0, reference - mini.stageStartedAt),
    paused: answering || resumed.paused,
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
  /** Questions déjà vues par ces joueurs (`game.avoidQuestionIds`), posées en dernier. */
  avoidQuestionIds?: number[]
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
    // Sauvegardée avec le setup : le rejeu de la reprise tire les mêmes questions.
    ...(options.avoidQuestionIds && { avoidQuestionIds: options.avoidQuestionIds }),
  }
}

/** Aucun des mini-jeux choisis n'est jouable avec ces joueurs et ce contenu. */
export class NoPlayableMiniGameError extends Error {
  constructor() {
    super('no_playable_mini_game')
    this.name = 'NoPlayableMiniGameError'
  }
}

/**
 * Vérifie avec le moteur qu'une partie peut être créée (graine, format, joueurs,
 * contenu), sans rien sauvegarder ni lancer : lève l'erreur du moteur sinon, ou
 * `NoPlayableMiniGameError` si le moteur terminerait aussitôt la partie faute de
 * mini-jeu jouable.
 */
export function validateNewGame(options: NewGameOptions & { seed: number }): void {
  const setup = buildSetup(options, finalizeRegistrations(options.registrations))

  createGame(setup)
  if (getPlayableMiniGames(setup).length === 0) {
    throw new NoPlayableMiniGameError()
  }
}

export function startNewGame(options: NewGameOptions): GameSession {
  const registrations = finalizeRegistrations(options.registrations)
  const next = GameSession.create(buildSetup(options, registrations), registrations, {
    storage,
    now: clock,
    demo: isDemoMode(),
  })

  setMediaCredits(options.themes)
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
 * Redemande au backoffice les questions de la partie qui ont un extrait de fournisseur et met à
 * jour la sauvegarde : les liens signés qu'elle garde ont expiré. Seuls le lien et le crédit d'une
 * question de ce genre, que le serveur sert encore avec un crédit, changent (le tirage du moteur
 * ne bouge pas). Sans question de ce genre, le serveur n'est pas appelé. Hors ligne ou sans
 * réponse à temps, la sauvegarde reste telle quelle : l'extrait en échec sera muet, la partie
 * continue.
 */
async function refreshSavedMedia(): Promise<void> {
  const snapshot = storage.load()
  const token = getRoomToken()
  if (!snapshot || snapshot.demo === true || !token) {
    return
  }
  const ids = new Set<number>()
  for (const theme of snapshot.setup.themes) {
    for (const question of theme.questions as RoomQuestion[]) {
      if (question.mediaCredit) {
        ids.add(question.id)
      }
    }
  }
  if (ids.size === 0) {
    return
  }
  try {
    const fresh = new Map<number, RoomQuestion>()
    const asked = [...ids]
    for (let from = 0; from < asked.length; from += ROOM_CONTENT_MAX_IDS) {
      const themes = await fetchCurrentContent(token, {
        ids: asked.slice(from, from + ROOM_CONTENT_MAX_IDS),
        timeoutMs: RESUME_CONTENT_TIMEOUT_MS,
      })
      for (const theme of themes) {
        for (const question of theme.questions) {
          fresh.set(question.id, question)
        }
      }
    }
    storage.save({
      ...snapshot,
      setup: {
        ...snapshot.setup,
        themes: snapshot.setup.themes.map((theme) => ({
          ...theme,
          questions: theme.questions.map((question) => {
            const next = fresh.get(question.id)
            if (!ids.has(question.id) || !next?.mediaUrl || !next.mediaCredit) {
              return question
            }
            const updated: RoomQuestion = {
              ...question,
              mediaUrl: next.mediaUrl,
              mediaCredit: next.mediaCredit,
            }
            return updated
          }),
        })),
      },
    })
  } catch {
    // Contenu indisponible : la sauvegarde sert telle quelle.
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

  await refreshSavedMedia()
  const resumed = GameSession.resume({ storage, now: clock })

  if (!resumed) {
    return false
  }

  setMediaCredits(resumed.state.setup.themes)
  await preloadExtracts(resumed.state.setup.themes)
  attach(resumed)
  restoreAudio(resumed)
  // Rechargée en pause : l'extrait attend la reprise (sauf si un joueur répondait déjà).
  resumeExtractOnResume = getBlindTestPausedAt(resumed.state) === null
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

/** Pause : l'horloge de la partie est gelée, les buzzers sont ignorés, l'extrait est suspendu. */
export function pauseGame(): GameCommandResult {
  const result = session.value?.pause() ?? refuse(GAME_COMMAND_REFUSAL.GAME_OVER)

  if (result.ok) {
    paused.value = true
    resumeExtractOnResume = getBlindTestPausedAt(state.value) === null
    player.pause()
  }

  return result
}

export function resumeGame(): GameCommandResult {
  const result = session.value?.resume() ?? refuse(GAME_COMMAND_REFUSAL.GAME_OVER)

  if (result.ok) {
    paused.value = false
    now.value = session.value?.now() ?? now.value

    if (resumeExtractOnResume) {
      player.resume()
    }
  }

  return result
}

/**
 * Passe la question `questionId` : 0 point, aucune pénalité. Refusé en pause, hors question, ou
 * si la question en cours n'est plus celle que l'opérateur visait.
 */
export function skipQuestion(questionId: number): GameCommandResult {
  return session.value?.skip(questionId) ?? refuse(GAME_COMMAND_REFUSAL.GAME_OVER)
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
  paused.value = false
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
    paused: computed(() => paused.value),
  }
}
