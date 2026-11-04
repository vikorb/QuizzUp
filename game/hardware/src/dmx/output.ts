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

/**
 * Nombre d'univers (numérotés depuis 0) que chaque sortie sait émettre. Les interfaces USB n'en ont
 * qu'un : un appareil placé sur un autre univers y est signalé comme problème, jamais envoyé.
 */
export const DMX_DRIVER_UNIVERSES: Record<DmxDriver, number> = {
  simulation: 16,
  usbpro: 1,
  opendmx: 1,
  'artnet-bridge': 16,
}

export type DmxOutputStatus = 'closed' | 'opening' | 'open' | 'closing' | 'error'

/** Sortie DMX : reçoit chaque univers complet (512 canaux) à chaque trame. */
export type DmxOutput = {
  readonly driver: DmxDriver
  open: () => Promise<void>
  /** `universe` : numéro de l'univers (0 par défaut) ; une sortie qui n'en a qu'un ignore les autres. */
  write: (data: Uint8Array, universe?: number) => Promise<void>
  close: () => Promise<void>
  /** Prévenu quand la sortie tombe (interface débranchée, erreur USB). */
  onDisconnect: (listener: (error: unknown) => void) => Unsubscribe
  /**
   * Nombre d'univers que la sortie sait émettre en ce moment, quand il dépend de ce qu'elle a
   * appris à l'ouverture (ancien pont Art-Net : 1). Absent : valeur du pilote (`DMX_DRIVER_UNIVERSES`).
   */
  universeCount?: () => number
}

/** Nombre d'univers qu'une sortie sait émettre. */
export const outputUniverses = (output: Pick<DmxOutput, 'driver' | 'universeCount'>) =>
  output.universeCount?.() ?? DMX_DRIVER_UNIVERSES[output.driver]
