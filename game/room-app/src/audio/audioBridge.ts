import type { GameEvent } from '@quizzup/game-engine'

import type { ExtractPlayer } from '@/audio/player'

/**
 * Traduit les événements du moteur en ordres pour le lecteur d'extraits
 * (cf. « Intégration côté hôte » de `game/engine/README.md`).
 */
export function createAudioBridge(player: ExtractPlayer) {
  let currentExtractMs = 0

  function handle(event: GameEvent): void {
    const { payload } = event

    switch (event.type) {
      case 'blind_test_stage_started': {
        const mediaUrl = typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null
        currentExtractMs = Number(payload.extractMs) || 0

        if (mediaUrl) {
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
    handleEvents(events: GameEvent[]): void {
      for (const event of events) {
        handle(event)
      }
    },
  }
}
