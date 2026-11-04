import type { GameEvent } from '@quizzup/game-engine'

import type { ExtractPlayer } from '@/audio/player'
import { DEMO_MEDIA_PREFIX } from '@/game/content'

/**
 * Traduit les événements du moteur en ordres pour le lecteur d'extraits
 * (cf. « Intégration côté hôte » de `game/engine/README.md`).
 */
export function createAudioBridge(player: ExtractPlayer) {
  let currentExtractMs = 0

  /**
   * Seuls les extraits préchargés sont joués : un téléchargement à la volée
   * démarrerait en retard et déborderait du palier décidé par le moteur.
   */
  function isPlayable(url: string | null): url is string {
    return Boolean(url) && !url!.startsWith(DEMO_MEDIA_PREFIX) && player.isLoaded(url!)
  }

  function handle(event: GameEvent): void {
    const { payload } = event

    switch (event.type) {
      case 'blind_test_stage_started': {
        const mediaUrl = typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null
        currentExtractMs = Number(payload.extractMs) || 0

        if (isPlayable(mediaUrl)) {
          const startSec = (Number(payload.mediaStartMs) || 0) / 1000
          // Un extrait illisible ne doit pas arrêter la partie : le palier continue en silence.
          player.play(mediaUrl, startSec, currentExtractMs).catch(() => undefined)
        }
        break
      }

      case 'blind_test_paused': {
        player.pause()
        break
      }

      case 'blind_test_stage_resumed': {
        // L'extrait reprend seulement s'il n'était pas déjà fini avant le buzz.
        if ((Number(payload.elapsedMs) || 0) < currentExtractMs) {
          player.resume()
        }
        break
      }

      case 'answer_correct':
      case 'question_ended':
      case 'game_aborted':
      case 'game_ended': {
        player.stop()
        break
      }

      default: {
        break
      }
    }
  }

  return {
    /**
     * Après une reprise (rechargement), relance l'extrait du palier en cours là où
     * il en était ; s'il était en pause (un joueur répondait), il reste en pause.
     */
    restore(options: {
      mediaUrl: string | null
      mediaStartMs: number
      extractMs: number
      elapsedMs: number
      paused: boolean
    }): void {
      currentExtractMs = options.extractMs
      const remainingMs = options.extractMs - options.elapsedMs

      if (!isPlayable(options.mediaUrl) || remainingMs <= 0) {
        return
      }

      const startSec = (options.mediaStartMs + options.elapsedMs) / 1000
      player.play(options.mediaUrl, startSec, remainingMs).catch(() => undefined)
      if (options.paused) {
        player.pause()
      }
    },

    handleEvents(events: GameEvent[]): void {
      for (const event of events) {
        handle(event)
      }
    },
  }
}
