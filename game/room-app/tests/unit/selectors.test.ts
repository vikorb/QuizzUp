import { FLASH_BLIND_TEST_BUZZ_WINDOW_MS, type GameState } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'

import { getDemoThemes } from '@/game/demoContent'
import {
  BLIND_TEST_STAGES,
  getBlindTestView,
  getLeaderboard,
  getLiveQuestionId,
  getQuestionNumber,
  getRemaining,
  getRevealView,
  getThemeName,
} from '@/game/selectors'
import { createMemorySessionStorage, GameSession } from '@/game/session'

import { correctButton, driveToQuestion } from '../_helpers/drive'
import { baseSetup, createManualClock, REGISTRATIONS } from '../_helpers/fixtures'

function startedSession() {
  const clock = createManualClock()
  const session = GameSession.create(baseSetup(), REGISTRATIONS, {
    storage: createMemorySessionStorage(),
    now: clock.now,
  })
  session.start()
  return { session, clock }
}

/** Question en cours, replacée au palier voulu (0-based) démarré à `stageStartedAt`. */
function questionAtStage(audioEffect: 'short' | undefined, stageIndex: number) {
  const clock = createManualClock()
  const themes = getDemoThemes().map((theme) => ({
    ...theme,
    questions: theme.questions.map((question) => ({ ...question, audioEffect })),
  }))
  const session = GameSession.create(baseSetup({ themes }), REGISTRATIONS, {
    storage: createMemorySessionStorage(),
    now: clock.now,
  })
  session.start()
  driveToQuestion(session, clock)
  const { phase } = session.state
  if (phase.name !== 'question' || phase.miniGameState.kind !== MINI_GAME_FLASH_BLIND_TEST) {
    throw new Error('question de blind test attendue')
  }
  const stageStartedAt = clock.value
  const state: GameState = {
    ...session.state,
    phase: { ...phase, miniGameState: { ...phase.miniGameState, stageIndex, stageStartedAt } },
  }
  return { state, stageStartedAt }
}

describe('selectors', () => {
  it('expose les 3 paliers du blind test (1 s / 5 s / 20 s, 100 / 50 / 20)', () => {
    expect(BLIND_TEST_STAGES).toEqual([
      { stage: 1, durationMs: 1000, points: 100 },
      { stage: 2, durationMs: 5000, points: 50 },
      { stage: 3, durationMs: 20_000, points: 20 },
    ])
  })

  it('classe avec ex-aequo et points de la manche', () => {
    const { session } = startedSession()
    const state: GameState = {
      ...session.state,
      scores: [
        { participantId: 1, score: 50 },
        { participantId: 2, score: 100 },
        { participantId: 3, score: 50 },
      ],
    }

    expect(getLeaderboard(state).map((line) => [line.displayName, line.rank])).toEqual([
      ['Hugo', 1],
      ['Léa', 2],
      ['Inès', 2],
    ])
  })

  it('donne l’identifiant de la question en cours, seulement pendant la question', () => {
    const { session, clock } = startedSession()

    expect(getLiveQuestionId(session.state)).toBeNull()

    driveToQuestion(session, clock)
    const id = session.state.rounds[0]?.questions[0]?.id
    expect(id).toBeDefined()
    expect(getLiveQuestionId(session.state)).toBe(id)

    session.skip(id as number)
    expect(session.state.phase.name).toBe('reveal')
    expect(getLiveQuestionId(session.state)).toBeNull()
  })

  it('décrit la question : écoute, fenêtre de buzz, réponse', () => {
    const { session, clock } = startedSession()
    driveToQuestion(session, clock)
    const startedAt = clock.value

    expect(getQuestionNumber(session.state)).toBe(1)
    expect(getThemeName(session.state, session.state.rounds[0]?.themeId)).not.toBe('')

    const listening = getBlindTestView(session.state, startedAt + 500)
    expect(listening).toMatchObject({ stage: 1, status: 'listening' })

    const window = getBlindTestView(session.state, startedAt + 1500)
    expect(window?.status).toBe('buzz_window')
    expect(window?.stageRemainingMs).toBe(1000 + FLASH_BLIND_TEST_BUZZ_WINDOW_MS - 1500)

    clock.advance(1500)
    session.press(1, 0)
    const answering = getBlindTestView(session.state, clock.value + 2000)
    expect(answering).toMatchObject({ status: 'answering', answeringParticipantId: 1 })
    expect(answering?.answerRemainingMs).toBe(3000)
    // Pendant la réponse, l'avancement du palier est figé.
    expect(answering?.stageProgress).toBe(
      getBlindTestView(session.state, clock.value)?.stageProgress
    )
  })

  describe('durées des paliers selon l’effet audio de la question', () => {
    const WINDOW = FLASH_BLIND_TEST_BUZZ_WINDOW_MS

    it('effet short, palier 1 (0,5 s) : écoute puis fenêtre de buzz', () => {
      const { state, stageStartedAt: startedAt } = questionAtStage('short', 0)

      const listening = getBlindTestView(state, startedAt + 300)
      expect(listening?.status).toBe('listening')
      expect(listening?.stageRemainingMs).toBe(500 + WINDOW - 300)
      expect(listening?.stageProgress).toBeCloseTo(300 / (500 + WINDOW))

      const window = getBlindTestView(state, startedAt + 700)
      expect(window?.status).toBe('buzz_window')
      expect(window?.stageRemainingMs).toBe(500 + WINDOW - 700)
      expect(window?.stageProgress).toBeCloseTo(700 / (500 + WINDOW))
    })

    it('effet short, palier 3 (10 s) : écoute puis fenêtre de buzz', () => {
      const { state, stageStartedAt } = questionAtStage('short', 2)

      const listening = getBlindTestView(state, stageStartedAt + 9000)
      expect(listening?.status).toBe('listening')
      expect(listening?.stageRemainingMs).toBe(10_000 + WINDOW - 9000)
      expect(listening?.stageProgress).toBeCloseTo(9000 / (10_000 + WINDOW))

      const window = getBlindTestView(state, stageStartedAt + 10_500)
      expect(window?.status).toBe('buzz_window')
      expect(window?.stageRemainingMs).toBe(10_000 + WINDOW - 10_500)
    })

    it('effet short : la vue expose les paliers raccourcis, les points ne changent pas', () => {
      const { state } = questionAtStage('short', 0)

      expect(getBlindTestView(state, 0)?.stages).toEqual([
        { stage: 1, durationMs: 500, points: 100 },
        { stage: 2, durationMs: 2000, points: 50 },
        { stage: 3, durationMs: 10_000, points: 20 },
      ])
    })

    it('sans effet : durées inchangées (1 s / 5 s / 20 s)', () => {
      const first = questionAtStage(undefined, 0)
      expect(getBlindTestView(first.state, first.stageStartedAt + 700)?.status).toBe('listening')
      expect(getBlindTestView(first.state, first.stageStartedAt)?.stages).toEqual(BLIND_TEST_STAGES)

      const third = questionAtStage(undefined, 2)
      const view = getBlindTestView(third.state, third.stageStartedAt + 10_500)
      expect(view?.status).toBe('listening')
      expect(view?.stageRemainingMs).toBe(20_000 + WINDOW - 10_500)
    })
  })

  it('décrit la révélation avec le gagnant et ses points', () => {
    const { session, clock } = startedSession()
    driveToQuestion(session, clock)
    clock.advance(200)
    session.press(3, 0)
    session.press(3, correctButton(session))

    const reveal = getRevealView(session.state)
    expect(reveal).toMatchObject({ winnerId: 3, points: 100, stage: 1 })
    expect(reveal?.correctAnswerIds).toHaveLength(1)
    expect(getBlindTestView(session.state, clock.value)).toBeNull()
  })

  it('révèle « personne » quand le palier 3 se termine sans bonne réponse', () => {
    const { session, clock } = startedSession()
    driveToQuestion(session, clock)
    clock.advance(36_000) // 3 paliers (1+3, 5+3, 20+3 s) = 35 s, révélation 5 s
    session.tick()

    expect(getRevealView(session.state)).toMatchObject({ winnerId: null, points: 0 })
  })

  it('borne le temps restant à zéro', () => {
    expect(getRemaining(100, 150)).toBe(0)
    expect(getRemaining(150, 100)).toBe(50)
  })
})
