import type { QuestionContext } from '@engine/miniGames/miniGame'
import type {
  AnswerRecord,
  EngineParticipant,
  EngineQuestion,
  EngineTheme,
  GameSetup,
} from '@engine/types'
import {
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'

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

/** Contexte d'une question seule (première de sa manche), scores à zéro par défaut. */
export function questionContext(
  question: EngineQuestion,
  overrides: Partial<QuestionContext> = {}
): QuestionContext {
  return {
    questionIndex: 0,
    questionsCount: 1,
    roundQuestions: [question],
    roundAnswers: [] as AnswerRecord[],
    scores: PARTICIPANTS.map((participant) => ({ participantId: participant.id, score: 0 })),
    ...overrides,
  }
}

/** Question texte (QCM) : la bonne réponse est en position `correctIndex` (0 = A). */
export function qcmQuestion(id: number, correctIndex = 0, answersCount = 4): EngineQuestion {
  return {
    id,
    text: `Question ${id}`,
    mediaType: QUESTION_MEDIA_TYPE_NONE,
    mediaUrl: null,
    mediaStartMs: 0,
    answers: Array.from({ length: answersCount }, (_item, index) => ({
      id: id * 10 + index,
      text: `Réponse ${index}`,
      isCorrect: index === correctIndex,
    })),
  }
}

/** Affirmation vrai/faux, réponses saisies dans l'ordre Faux, Vrai (le mini-jeu remet Vrai en A). */
export function trueFalseQuestion(id: number, isTrue: boolean): EngineQuestion {
  return {
    ...qcmQuestion(id),
    text: `Affirmation ${id}`,
    answers: [
      { id: id * 10, text: 'Faux', isCorrect: !isTrue },
      { id: id * 10 + 1, text: 'Vrai', isCorrect: isTrue },
    ],
  }
}

/** Estimation : fourchettes saisies dans le désordre, la bonne est « 100 à 199 ». */
export function estimateQuestion(id: number): EngineQuestion {
  return {
    ...qcmQuestion(id),
    text: `Combien ${id} ?`,
    answers: [
      { id: id * 10, text: '200 à 299', isCorrect: false },
      { id: id * 10 + 1, text: 'Moins de 100', isCorrect: false },
      { id: id * 10 + 2, text: '1 000 ou plus', isCorrect: false },
      { id: id * 10 + 3, text: '100 à 199', isCorrect: true },
    ],
  }
}

export function imageQuestion(id: number, correctIndex = 0): EngineQuestion {
  return {
    ...qcmQuestion(id, correctIndex),
    mediaType: QUESTION_MEDIA_TYPE_IMAGE,
    mediaUrl: `https://media.test/${id}.jpg`,
  }
}

/** Thème `id` dont les questions sont fabriquées par `build` (ids `id * 100 + n`). */
export function themeOf(
  id: number,
  build: (questionId: number, index: number) => EngineQuestion,
  count = 10
): EngineTheme {
  return {
    id,
    name: `Thème ${id}`,
    questions: Array.from({ length: count }, (_item, index) => build(id * 100 + index, index)),
  }
}
