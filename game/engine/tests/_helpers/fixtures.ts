import type { EngineParticipant, EngineQuestion, EngineTheme, GameSetup } from '@engine/types'
import { QUESTION_MEDIA_TYPE_AUDIO, QUESTION_MEDIA_TYPE_NONE } from '@quizzup/shared'

/** Question audio : la bonne réponse est en position `correctIndex` (0 = A). */
export function audioQuestion(id: number, correctIndex = 0): EngineQuestion {
  return {
    id,
    text: `Extrait ${id}`,
    mediaType: QUESTION_MEDIA_TYPE_AUDIO,
    mediaUrl: `https://media.test/${id}.mp3`,
    mediaStartMs: 0,
    answers: [0, 1, 2, 3].map((index) => ({
      id: id * 10 + index,
      text: `Réponse ${index}`,
      isCorrect: index === correctIndex,
    })),
  }
}

export function textQuestion(id: number): EngineQuestion {
  return { ...audioQuestion(id), mediaType: QUESTION_MEDIA_TYPE_NONE, mediaUrl: null }
}

/** Thème `id` avec `count` questions audio (ids `id * 100 + n`). */
export function audioTheme(id: number, count = 10): EngineTheme {
  return {
    id,
    name: `Thème ${id}`,
    questions: Array.from({ length: count }, (_item, index) => audioQuestion(id * 100 + index)),
  }
}

export const PARTICIPANTS: EngineParticipant[] = [
  { id: 1, podium: 1, displayName: 'Léa' },
  { id: 2, podium: 2, displayName: 'Hugo' },
  { id: 3, podium: 3, displayName: 'Inès' },
  { id: 4, podium: 4, displayName: 'Tom' },
]

export function baseSetup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    seed: 42,
    participants: PARTICIPANTS,
    themes: [1, 2, 3, 4, 5, 6].map((id) => audioTheme(id)),
    roundsCount: 2,
    questionsPerRound: 3,
    ...overrides,
  }
}
