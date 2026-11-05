import type { Clock } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import type { Unsubscribe } from '../types'
import { clampByte } from '../types'

/**
 * Limites codées en dur, plus fortes que n'importe quelle configuration : une salle ne peut pas
 * régler une fumée continue ni des rafales sans pause.
 */
export const SMOKE_HARD_LIMITS = {
  minDurationMs: 200,
  maxDurationMs: 10_000,
  minCooldownMs: 5_000,
  maxCooldownMs: 600_000,
} as const

export type SmokeSafetyConfig = {
  /** Fumée autorisée dans cette salle. Désactivée par défaut. */
  enabled: boolean
  /** Durée maximale d'une émission. */
  maxDurationMs: number
  /** Pause obligatoire entre deux émissions. */
  cooldownMs: number
  /** Niveau maximal envoyé sur le canal fumée (1-255). */
  maxLevel: number
  /** Un humain doit armer la fumée (case « fumée autorisée pour cette partie ») avant usage. */
  requireConfirmation: boolean
  /**
   * Case cochée par l'installateur : « la machine coupe toute seule sur perte de signal DMX ».
   * Seule dérogation à l'exigence d'un profil à relais pour la fumée. Absente = faux ; écrite
   * seulement quand elle est vraie, pour ne pas modifier les configs existantes.
   */
  cutsOnSignalLoss?: boolean
}

export const DEFAULT_SMOKE_SAFETY: SmokeSafetyConfig = {
  enabled: false,
  maxDurationMs: 3_000,
  cooldownMs: 30_000,
  maxLevel: 255,
  requireConfirmation: true,
}

export type SmokeStatus = 'disabled' | 'unarmed' | 'ready' | 'firing' | 'cooldown' | 'emergency'

export type SmokeStopReason =
  'manual' | 'watchdog' | 'output_error' | 'page_hidden' | 'disarmed' | 'emergency' | 'shutdown'

export type SmokeRefusal =
  | 'disabled'
  | 'not_armed'
  | 'firing'
  | 'cooldown'
  | 'emergency'
  | 'invalid_duration'
  | 'page_hidden'

export type SmokeFireResult = { ok: true; durationMs: number } | { ok: false; reason: SmokeRefusal }

export type SmokeState = {
  status: SmokeStatus
  armed: boolean
  /** Fin prévue de l'émission en cours. */
  firingUntil: number | null
  /** Fin de la pause obligatoire. */
  cooldownUntil: number | null
  level: number
  lastStopReason: SmokeStopReason | null
  config: SmokeSafetyConfig
}

export type SmokeController = {
  arm: () => boolean
  disarm: () => void
  fire: (durationMs: number) => SmokeFireResult
  stop: (reason?: SmokeStopReason) => void
  emergencyStop: () => void
  /** Réarmement après arrêt d'urgence : la fumée repasse « non armée ». */
  resetEmergency: () => void
  /** Niveau à envoyer maintenant (0 hors émission). Calculé à partir de l'heure : un minuteur
   * en retard ne peut pas prolonger la fumée. */
  level: (now?: number) => number
  getState: (now?: number) => SmokeState
  onChange: (listener: (state: SmokeState) => void) => Unsubscribe
}

const pick = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function normalizeSmokeSafety(input: Partial<SmokeSafetyConfig> = {}): SmokeSafetyConfig {
  return {
    enabled: input.enabled === true,
    maxDurationMs: Math.min(
      SMOKE_HARD_LIMITS.maxDurationMs,
      Math.max(
        SMOKE_HARD_LIMITS.minDurationMs,
        pick(input.maxDurationMs, DEFAULT_SMOKE_SAFETY.maxDurationMs)
      )
    ),
    cooldownMs: Math.min(
      SMOKE_HARD_LIMITS.maxCooldownMs,
      Math.max(
        SMOKE_HARD_LIMITS.minCooldownMs,
        pick(input.cooldownMs, DEFAULT_SMOKE_SAFETY.cooldownMs)
      )
    ),
    maxLevel: Math.max(1, clampByte(pick(input.maxLevel, DEFAULT_SMOKE_SAFETY.maxLevel))),
    // Seule une valeur explicitement `false` retire la confirmation.
    requireConfirmation: input.requireConfirmation !== false,
    ...(input.cutsOnSignalLoss === true ? { cutsOnSignalLoss: true } : {}),
  }
}

/**
 * Contrôleur de fumée sécurisé : durée max, pause obligatoire, niveau max, armement humain,
 * arrêt d'urgence verrouillé jusqu'au réarmement. Ne remplace pas l'arrêt d'urgence physique.
 */
export function createSmokeController(
  options: { config?: Partial<SmokeSafetyConfig>; clock?: Clock } = {}
): SmokeController {
  const config = normalizeSmokeSafety(options.config)
  const clock = options.clock ?? browserClock
  const emitter = createEmitter<SmokeState>()

  let armed = !config.requireConfirmation
  let emergency = false
  let firingUntil: number | null = null
  let cooldownUntil: number | null = null
  let lastStopReason: SmokeStopReason | null = null
  let lastStatus: SmokeStatus | null = null

  /** Fait avancer les transitions liées au temps (fin d'émission, fin de pause). */
  const settle = (now: number) => {
    if (firingUntil !== null && now >= firingUntil) {
      cooldownUntil = firingUntil + config.cooldownMs
      firingUntil = null
    }
    if (cooldownUntil !== null && now >= cooldownUntil) {
      cooldownUntil = null
    }
  }

  const statusAt = (now: number): SmokeStatus => {
    settle(now)
    if (emergency) {
      return 'emergency'
    }
    if (!config.enabled) {
      return 'disabled'
    }
    if (firingUntil !== null) {
      return 'firing'
    }
    if (cooldownUntil !== null) {
      return 'cooldown'
    }
    return armed ? 'ready' : 'unarmed'
  }

  const getState = (now = clock.now()): SmokeState => {
    const status = statusAt(now)
    return {
      status,
      armed,
      firingUntil,
      cooldownUntil,
      level: status === 'firing' ? config.maxLevel : 0,
      lastStopReason,
      config: { ...config },
    }
  }

  const notify = (now = clock.now()) => {
    const state = getState(now)
    lastStatus = state.status
    emitter.emit(state)
  }

  const cut = (now: number, reason: SmokeStopReason) => {
    settle(now)
    if (firingUntil !== null) {
      firingUntil = null
      cooldownUntil = now + config.cooldownMs
      lastStopReason = reason
      return true
    }
    return false
  }

  return {
    arm() {
      if (!config.enabled || emergency) {
        return false
      }
      if (!armed) {
        armed = true
        notify()
      }
      return true
    },
    disarm() {
      const now = clock.now()
      const wasFiring = cut(now, 'disarmed')
      if (armed || wasFiring) {
        armed = false
        notify(now)
      }
    },
    fire(durationMs) {
      const now = clock.now()
      const status = statusAt(now)
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return { ok: false, reason: 'invalid_duration' }
      }
      if (status !== 'ready') {
        const reasons: Record<Exclude<SmokeStatus, 'ready'>, SmokeRefusal> = {
          disabled: 'disabled',
          unarmed: 'not_armed',
          firing: 'firing',
          cooldown: 'cooldown',
          emergency: 'emergency',
        }
        return { ok: false, reason: reasons[status] }
      }
      const granted = Math.min(
        config.maxDurationMs,
        Math.max(SMOKE_HARD_LIMITS.minDurationMs, durationMs)
      )
      firingUntil = now + granted
      lastStopReason = null
      notify(now)
      return { ok: true, durationMs: granted }
    },
    stop(reason = 'manual') {
      const now = clock.now()
      if (cut(now, reason)) {
        notify(now)
      }
    },
    emergencyStop() {
      const now = clock.now()
      cut(now, 'emergency')
      lastStopReason = 'emergency'
      emergency = true
      armed = false
      notify(now)
    },
    resetEmergency() {
      if (!emergency) {
        return
      }
      emergency = false
      // Toujours désarmée après un arrêt d'urgence : un humain doit la réarmer.
      armed = false
      notify()
    },
    level(now = clock.now()) {
      const status = statusAt(now)
      const changed = status !== lastStatus && lastStatus !== null
      // Avant `notify` : un abonné qui pilote la fumée de façon synchrone ne doit pas voir son
      // statut écrasé par celui calculé ici.
      lastStatus = status
      if (changed) {
        notify(now)
      }
      return status === 'firing' ? config.maxLevel : 0
    },
    getState,
    onChange: emitter.on,
  }
}
