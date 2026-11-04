import { MINI_GAME_DEFINITIONS } from '@quizzup/game-engine'
import {
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAMES,
  QUESTION_MEDIA_TYPE_IMAGE,
} from '@quizzup/shared'

import { buildEmojiImageUrl, getDemoThemes } from '@/game/demoContent'

const MIN_THEMES = 4
const MIN_QUESTIONS = 4

describe('demoContent', () => {
  const themes = getDemoThemes()
  const questions = themes.flatMap((theme) => theme.questions)

  it('garde les 6 thèmes historiques et leurs 10 extraits audio', () => {
    expect(themes.map((theme) => theme.id)).toEqual([9001, 9002, 9003, 9004, 9005, 9006])
    for (const theme of themes) {
      const audio = theme.questions.filter((question) => question.mediaUrl?.startsWith('demo://'))
      expect(audio.map((question) => question.id)).toEqual(
        Array.from({ length: 10 }, (_item, index) => theme.id * 100 + index)
      )
    }
  })

  it.each([...MINI_GAMES])('rend le mini-jeu %s jouable sur au moins 4 thèmes', (miniGame) => {
    const definition = MINI_GAME_DEFINITIONS[miniGame]
    const playable = themes.filter(
      (theme) =>
        theme.questions.filter((question) => definition.isQuestionEligible(question)).length >=
        MIN_QUESTIONS
    )
    expect(playable.length).toBeGreaterThanOrEqual(MIN_THEMES)
  })

  it('fournit au moins 4 questions image par thème pour la révélation progressive', () => {
    const definition = MINI_GAME_DEFINITIONS[MINI_GAME_PROGRESSIVE_REVEAL]
    const withImages = themes.filter(
      (theme) =>
        theme.questions.filter(
          (question) =>
            question.mediaType === QUESTION_MEDIA_TYPE_IMAGE &&
            definition.isQuestionEligible(question)
        ).length >= MIN_QUESTIONS
    )
    expect(withImages.length).toBeGreaterThanOrEqual(MIN_THEMES)
  })

  it('utilise des ids de questions et de réponses uniques', () => {
    const questionIds = questions.map((question) => question.id)
    const answerIds = questions.flatMap((question) => question.answers.map((answer) => answer.id))
    expect(new Set(questionIds).size).toBe(questionIds.length)
    expect(new Set(answerIds).size).toBe(answerIds.length)
  })

  it('donne au moins une bonne réponse à chaque question', () => {
    for (const question of questions) {
      expect(question.answers.some((answer) => answer.isCorrect)).toBe(true)
    }
  })

  it('génère les images en data URL SVG, sans réseau', () => {
    const url = buildEmojiImageUrl('🎹')
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url)).toContain('🎹')
  })
})
