import type { BoardCause, BoardOutputState } from '@hardware/smoke/boardProtocol'

/**
 * Port TypeScript, ligne à ligne, de `firmware/fumee/fumee_logic.c` (la décision de la carte).
 * Les instants sont des entiers 32 bits non signés qui débordent, comme `millis()` : toute
 * différence passe par `diff`. Ne pas « améliorer » ce fichier : le test `fumeeVectors.test.ts`
 * le compare au programme sur les vecteurs partagés `firmware/fumee/vecteurs.txt`.
 */

/** Valeurs de `fumee_logic.h` ; un test les compare à `SMOKE_HARD_LIMITS` et au bail du lien. */
export const FUMEE_MAX_MS = 10000
export const FUMEE_COOL_MS = 5000
export const FUMEE_LEASE_MS = 500

export type Fumee = {
  out: 0 | 1
  state: BoardOutputState
  cause: BoardCause
  held: boolean
  leaseAt: number
  fireStart: number
  coolStart: number
}

const u32 = (value: number) => value >>> 0
/** `(uint32_t)(later - earlier)`. */
const diff = (later: number, earlier: number) => u32(later - earlier)

/**
 * Carte remise à zéro à l'instant `now` (`fumee_init`) : sortie coupée, en pause pour 5 s. Le
 * `fumee_t *f` du C est ici l'état `fumee`, tenu dans la fermeture.
 */
export function createFumee(startedAt: number) {
  const fumee: Fumee = {
    out: 0,
    state: 'COOL',
    cause: 'CMD',
    held: false,
    leaseAt: 0,
    fireStart: 0,
    coolStart: u32(startedAt),
  }

  /** Coupe la sortie ; seul un jet en cours déclenche la pause et note la cause. */
  const cut = (now: number, cause: BoardCause) => {
    if (fumee.state === 'FIRE') {
      fumee.state = 'COOL'
      fumee.coolStart = now
      fumee.cause = cause
    }
    fumee.out = 0
  }

  const tick = (rawNow: number) => {
    const now = u32(rawNow)
    if (fumee.state === 'FIRE') {
      if (diff(now, fumee.fireStart) >= FUMEE_MAX_MS) {
        cut(now, 'MAX')
      } else if (diff(now, fumee.leaseAt) >= FUMEE_LEASE_MS) {
        cut(now, 'LEASE')
      }
    } else if (fumee.state === 'COOL' && diff(now, fumee.coolStart) >= FUMEE_COOL_MS) {
      fumee.state = 'READY'
    }
    // Le flot de F refusés s'est tu assez longtemps : un nouveau F est de nouveau une demande.
    if (fumee.held && diff(now, fumee.leaseAt) >= FUMEE_LEASE_MS) {
      fumee.held = false
    }
  }

  const line = (rawNow: number, text: string) => {
    const now = u32(rawNow)
    // D'abord le temps : un bail ou un plafond échu coupe avant que la ligne soit lue.
    tick(now)

    if (text === 'F') {
      if (fumee.state === 'FIRE') {
        fumee.leaseAt = now
      } else if (fumee.state === 'READY' && !fumee.held) {
        fumee.state = 'FIRE'
        fumee.out = 1
        fumee.fireStart = now
        fumee.leaseAt = now
      } else {
        // Refusé (pause, ou flot déjà refusé). Il ne se transforme jamais en jet plus tard.
        fumee.held = true
        fumee.leaseAt = now
      }
    } else if (text === 'H') {
      // Présence : rien à faire, surtout pas toucher au bail.
    } else if (text === '0') {
      cut(now, 'CMD')
      fumee.held = false
    } else {
      cut(now, 'BAD')
    }
  }

  return { fumee, tick, line }
}
