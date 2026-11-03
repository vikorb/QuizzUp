import type { EngineTheme, GameEvent, GameState } from '@quizzup/game-engine'
import { MAX_SEED } from '@quizzup/game-engine'
import { computed, ref, shallowRef } from 'vue'

import { createAudioBridge } from '@/audio/audioBridge'
import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import {
  finalizeRegistrations,
  type Registration,
  toEngineParticipants,
} from '@/game/registrations'
import { createLocalSessionStorage, GameSession, type SessionStorage } from '@/game/session'
import { type BuzzerPress, toEngineButton } from '@/hardware/buzzers'

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
let clock: () => number = () => performance.now()
let ticker: ReturnType<typeof setInterval> | null = null
let unsubscribe: (() => void) | null = null

export function configureRoomGame(options: {
  storage?: SessionStorage
  player?: ExtractPlayer
  now?: () => number
}): void {
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
      for (const listener of eventListeners) {
        listener(events)
      }
    }

    if (next.isOver) {
      stopTicking()
    }
  })

  ticker = setInterval(() => next.tick(), TICK_INTERVAL_MS)
}

export function createSeed(): number {
  const values = new Uint32Array(1)
  globalThis.crypto.getRandomValues(values)
  return Math.min(values[0] ?? 0, MAX_SEED)
}

export function startNewGame(options: {
  registrations: Registration[]
  themes: EngineTheme[]
  roundsCount?: number
  questionsPerRound?: number
  seed?: number
}): GameSession {
  const registrations = finalizeRegistrations(options.registrations)
  const next = GameSession.create(
    {
      seed: options.seed ?? createSeed(),
      participants: toEngineParticipants(registrations),
      themes: options.themes,
      roundsCount: options.roundsCount,
      questionsPerRound: options.questionsPerRound,
    },
    registrations,
    { storage, now: clock }
  )

  attach(next)
  next.start()
  return next
}

export function hasSavedGame(): boolean {
  return storage.load() !== null
}

/** Reprend la partie sauvegardée dans le navigateur (après un rechargement). */
export function resumeSavedGame(): boolean {
  const resumed = GameSession.resume({ storage, now: clock })

  if (!resumed) {
    return false
  }

  attach(resumed)
  return true
}

export function pressBuzzer(press: BuzzerPress): void {
  session.value?.press(press.desk, toEngineButton(press.button), press.at)
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
