import {
  type ButtonIndex,
  createGame,
  type GameCommand,
  type GameEvent,
  type GameSetup,
  type GameState,
  reduceGame,
  replayGame,
} from '@quizzup/game-engine'

import type { Registration } from '@/game/registrations'

/**
 * Partie en cours sur l'écran de salle : enveloppe le moteur pur, horodate les
 * commandes et sauvegarde en continu (graine + commandes) pour reprendre après
 * un rechargement de la page.
 */
export type SessionSnapshot = {
  version: 1
  setup: GameSetup
  /** Commandes significatives (start, press, abort) ; les ticks ne sont pas rejoués. */
  commands: GameCommand[]
  /** Dernier instant connu de la partie, pour reprendre l'horloge où elle s'était arrêtée. */
  lastAt: number
  /** Inscriptions du lobby (email + consentement RGPD), à renvoyer avec les résultats. */
  registrations: Registration[]
  /**
   * Partie jouée en mode démo. Absent des sauvegardes d'avant ce champ : elles ne sont
   * reprises que si leur graine est celle de la partie retenue du backoffice.
   */
  demo?: boolean
}

export type SessionStorage = {
  load: () => SessionSnapshot | null
  save: (snapshot: SessionSnapshot) => void
  clear: () => void
}

export type SessionListener = (state: GameState, events: GameEvent[]) => void

const STORAGE_KEY = 'quizzup_room_game'
/** Fréquence de sauvegarde de l'horloge pendant les ticks. */
const TICK_SAVE_INTERVAL_MS = 1000

export function createLocalSessionStorage(key = STORAGE_KEY): SessionStorage {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) {
          return null
        }
        const parsed = JSON.parse(raw) as Partial<SessionSnapshot>
        if (parsed.version !== 1 || !parsed.setup || !Array.isArray(parsed.commands)) {
          return null
        }
        return parsed as SessionSnapshot
      } catch {
        return null
      }
    },
    save(snapshot) {
      try {
        localStorage.setItem(key, JSON.stringify(snapshot))
      } catch {
        // Stockage plein ou indisponible : la partie continue sans reprise possible.
      }
    },
    clear() {
      try {
        localStorage.removeItem(key)
      } catch {
        // Rien à nettoyer.
      }
    },
  }
}

export function createMemorySessionStorage(): SessionStorage & { current: SessionSnapshot | null } {
  const store = {
    current: null as SessionSnapshot | null,
    load: () => (store.current ? structuredClone(store.current) : null),
    save: (snapshot: SessionSnapshot) => {
      store.current = structuredClone(snapshot)
    },
    clear: () => {
      store.current = null
    },
  }
  return store
}

type SessionOptions = {
  storage: SessionStorage
  /** Horloge monotone de base (par défaut `performance.now()`). */
  now?: () => number
  /** Partie de démonstration : la sauvegarde le consigne pour ne pas être reprise ailleurs. */
  demo?: boolean
}

export class GameSession {
  private currentState: GameState
  private readonly commands: GameCommand[]
  private readonly listeners = new Set<SessionListener>()
  private readonly storage: SessionStorage
  private readonly baseNow: () => number
  private readonly demo: boolean
  private readonly offset: number
  private lastAt: number
  private lastSavedAt: number

  private constructor(
    private readonly setup: GameSetup,
    private readonly registrations: Registration[],
    options: SessionOptions,
    restored?: { state: GameState; commands: GameCommand[]; lastAt: number }
  ) {
    this.storage = options.storage
    this.baseNow = options.now ?? (() => performance.now())
    this.demo = options.demo ?? false
    this.currentState = restored?.state ?? createGame(setup)
    this.commands = restored?.commands ?? []
    // Après un rechargement, `performance.now()` repart de zéro : on décale
    // l'horloge pour que la partie reprenne à l'instant où elle s'était arrêtée.
    this.offset = restored ? restored.lastAt - this.baseNow() : 0
    this.lastAt = restored?.lastAt ?? this.now()
    this.lastSavedAt = this.lastAt
  }

  static create(setup: GameSetup, registrations: Registration[], options: SessionOptions) {
    const session = new GameSession(setup, registrations, options)
    session.persist()
    return session
  }

  /** Reprend la partie sauvegardée, ou `null` s'il n'y en a pas (ou si elle est illisible). */
  static resume(options: SessionOptions): GameSession | null {
    const snapshot = options.storage.load()

    if (!snapshot) {
      return null
    }

    try {
      const replayed = replayGame(snapshot.setup, [
        ...snapshot.commands,
        { type: 'tick', at: snapshot.lastAt },
      ])
      return new GameSession(
        snapshot.setup,
        snapshot.registrations ?? [],
        { ...options, demo: snapshot.demo === true },
        {
          state: replayed.state,
          commands: snapshot.commands,
          lastAt: snapshot.lastAt,
        }
      )
    } catch {
      options.storage.clear()
      return null
    }
  }

  get state(): GameState {
    return this.currentState
  }

  get participants() {
    return this.currentState.setup.participants
  }

  get savedRegistrations(): Registration[] {
    return this.registrations
  }

  get isOver(): boolean {
    const { name } = this.currentState.phase
    return name === 'finished' || name === 'aborted'
  }

  now(): number {
    return this.baseNow() + this.offset
  }

  onChange(listener: SessionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): GameEvent[] {
    return this.dispatch({ type: 'start', at: this.now() })
  }

  tick(): GameEvent[] {
    return this.dispatch({ type: 'tick', at: this.now() })
  }

  /** `at` = horodatage de l'appui (pris au keydown), ramené sur l'horloge de la partie. */
  press(podium: number, button: ButtonIndex, at?: number): GameEvent[] {
    const pressAt = at === undefined ? this.now() : at + this.offset
    return this.dispatch({ type: 'press', at: pressAt, podium, button })
  }

  abort(reason: string): GameEvent[] {
    return this.dispatch({ type: 'abort', at: this.now(), reason })
  }

  /** Oublie la sauvegarde (fin de partie confirmée). */
  discard(): void {
    this.storage.clear()
    this.listeners.clear()
  }

  private dispatch(command: GameCommand): GameEvent[] {
    if (this.isOver) {
      return []
    }

    // Le moteur ramène une commande en retard au dernier instant connu : on journalise
    // l'instant effectivement appliqué, sinon le rejeu (sans les ticks) pourrait diverger.
    const previousAt = this.currentState.lastAt
    const applied: GameCommand = { ...command, at: Math.max(command.at, previousAt ?? command.at) }
    const step = reduceGame(this.currentState, command)
    this.currentState = step.state
    this.lastAt = Math.max(this.lastAt, applied.at)

    if (this.isOver) {
      // Partie terminée : rien à reprendre, et les emails ne restent pas sur le PC de la salle.
      this.storage.clear()
    } else if (command.type !== 'tick') {
      this.commands.push(applied)
      this.persist()
    } else if (step.events.length > 0 || this.lastAt - this.lastSavedAt >= TICK_SAVE_INTERVAL_MS) {
      this.persist()
    }

    for (const listener of this.listeners) {
      listener(step.state, step.events)
    }

    return step.events
  }

  private persist(): void {
    this.lastSavedAt = this.lastAt
    this.storage.save({
      version: 1,
      setup: this.setup,
      commands: this.commands,
      lastAt: this.lastAt,
      registrations: this.registrations,
      demo: this.demo,
    })
  }
}
