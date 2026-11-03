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

export interface ExtractPlayer {
  /** À appeler dans le clic « Lancer la salle » (politique autoplay) : crée/reprend l'AudioContext. */
  unlock(): Promise<void>
  /** Télécharge et décode les extraits ; ne rejette jamais, ne recharge pas une URL déjà décodée. */
  preload(urls: string[], options?: PreloadOptions): Promise<PreloadResult>
  /** Joue `durationMs` depuis `startSec` ; résout `ended` à la fin exacte, `stopped` si interrompu. */
  play(url: string, startSec: number, durationMs: number): Promise<PlayOutcome>
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
