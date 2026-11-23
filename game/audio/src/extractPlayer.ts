/**
 * Port de lecture des extraits audio (mini-jeu « blind test éclair »).
 *
 * Ce contrat est partagé avec la room-app : il ne contient aucune règle de jeu. Les durées
 * des paliers (1 s, 5 s, 20 s…) et le point de départ sont décidés par le moteur de jeu ;
 * ce paquet se contente de jouer ce qu'on lui demande, au bon moment, sans blanc.
 */

/** Résultat d'un préchargement : URLs décodées et URLs en échec (réseau ou décodage). */
export type PreloadResult = { loaded: string[]; failed: string[] }

/** Issue d'un palier : fin naturelle (`ended`) ou interruption (`stopped`). */
export type PlayOutcome = 'ended' | 'stopped'

export type PreloadOptions = {
  /** Injectable : la room-app passe un fetch qui ajoute `Authorization: Bearer <token>`. */
  fetch?: (url: string) => Promise<Response>
  /** Appelé à chaque URL traitée (succès ou échec). */
  onProgress?: (done: number, total: number) => void
  /** Nombre de téléchargements simultanés (défaut 3). */
  concurrency?: number
}

/**
 * Effets possibles sur un extrait. Constante gardée ici pour l'instant ; si le backoffice doit
 * lister les effets, elle migrera dans `@quizzup/shared`.
 * - `none` : lecture normale ;
 * - `short` : aucun traitement du son. Ce sont les paliers, raccourcis par le moteur, qui
 *   changent : le lecteur joue simplement ce qu'on lui demande ;
 * - `reverse` : la fenêtre du palier est lue à l'envers ;
 * - `slowed` : lecture à `SLOWED_PLAYBACK_RATE`, donc plus lente et plus grave.
 */
export const EXTRACT_EFFECTS = ['none', 'short', 'reverse', 'slowed'] as const
export type ExtractEffect = (typeof EXTRACT_EFFECTS)[number]

/** Vitesse de lecture de l'effet `slowed` (Web Audio lie vitesse et hauteur : environ −5 demi-tons). */
export const SLOWED_PLAYBACK_RATE = 0.75

export type PlayOptions = {
  /** Effet appliqué à la lecture seule : rien n'est écrit, rien n'est téléchargé en plus. */
  effect?: ExtractEffect
  /**
   * Temps réel déjà joué dans le palier (reprise après rechargement). Remplace le calcul
   * `startSec + écoulé`, faux avec un effet : le lecteur le convertit lui-même en position.
   */
  elapsedMs?: number
}

export interface ExtractPlayer {
  /** À appeler dans le clic « Lancer la salle » (politique autoplay) : crée/reprend l'AudioContext. */
  unlock(): Promise<void>
  /** Télécharge et décode les extraits ; ne rejette jamais, ne recharge pas une URL déjà décodée. */
  preload(urls: string[], options?: PreloadOptions): Promise<PreloadResult>
  /** Joue `durationMs` depuis `startSec` ; résout `ended` à la fin exacte, `stopped` si interrompu. */
  play(
    url: string,
    startSec: number,
    durationMs: number,
    options?: PlayOptions
  ): Promise<PlayOutcome>
  /** Met en pause le palier en cours et renvoie les ms déjà jouées (0 si rien ne joue). */
  pause(): number
  /** Reprend exactement là où on était, pour le temps restant du palier. */
  resume(): void
  /** Arrête le palier en cours et résout sa promesse en `stopped`. */
  stop(): void
  isLoaded(url: string): boolean
  /** Libère des buffers décodés (tous si pas d'argument). */
  release(urls?: string[]): void
}
