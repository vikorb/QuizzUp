import type { UiSoundName } from '@quizzup/audio'
import type { GameEvent } from '@quizzup/game-engine'

export type UiSoundOutput = { play: (name: UiSoundName) => void }

/** Son d'interface associé à un événement du moteur (`null` : rien à jouer). */
export function uiSoundForEvent(event: GameEvent): UiSoundName | null {
  const { payload } = event

  switch (event.type) {
    case 'buzzer_pressed': {
      return 'buzz'
    }
    case 'answer_correct': {
      return 'correct'
    }
    case 'answer_wrong': {
      return 'wrong'
    }
    case 'blind_test_stage_started': {
      // Le premier palier démarre en silence ; les suivants annoncent la montée.
      return (Number(payload.stage) || 1) > 1 ? 'tierUp' : null
    }
    case 'question_ended': {
      const winners = Array.isArray(payload.winnerIds) ? payload.winnerIds : []
      return winners.length === 0 ? 'lostForAll' : null
    }
    case 'round_ended': {
      return 'reveal'
    }
    default: {
      return null
    }
  }
}

/** Joue les sons d'interface (buzz, bonne / mauvaise réponse…) au fil des événements. */
export function createUiSoundBridge(output: UiSoundOutput) {
  return {
    handleEvents(events: GameEvent[]): void {
      for (const event of events) {
        const name = uiSoundForEvent(event)
        if (name) {
          try {
            output.play(name)
          } catch {
            // Un son d'interface raté ne doit jamais bloquer la partie.
          }
        }
      }
    },
  }
}
