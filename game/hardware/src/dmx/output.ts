import type { Unsubscribe } from '../types'

export const DMX_DRIVERS = ['simulation', 'usbpro', 'opendmx', 'artnet-bridge'] as const
/**
 * - `simulation` : aucun matériel, les trames sont seulement visualisées à l'écran.
 * - `usbpro` : interfaces compatibles « DMX USB Pro » (Enttec et nombreux clones). Recommandé.
 * - `opendmx` : interfaces FTDI « Open DMX » sans microcontrôleur. Expérimental : le timing du
 *   break dépend du navigateur et du système.
 * - `artnet-bridge` : nœud Art-Net (réseau) via le pont local facultatif `quizzup-artnet-bridge`
 *   (WebSocket vers 127.0.0.1) ; un navigateur ne peut pas envoyer d'UDP lui-même.
 */
export type DmxDriver = (typeof DMX_DRIVERS)[number]

export type DmxOutputStatus = 'closed' | 'opening' | 'open' | 'closing' | 'error'

/** Sortie DMX : reçoit l'univers complet à chaque trame. */
export type DmxOutput = {
  readonly driver: DmxDriver
  open: () => Promise<void>
  write: (universe: Uint8Array) => Promise<void>
  close: () => Promise<void>
  /** Prévenu quand la sortie tombe (interface débranchée, erreur USB). */
  onDisconnect: (listener: (error: unknown) => void) => Unsubscribe
}
