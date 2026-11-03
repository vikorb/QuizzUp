import { FLASH_BLIND_TEST_BUZZ_WINDOW_MS, type GameState } from '@quizzup/game-engine'

import {
  BLIND_TEST_STAGES,
  getBlindTestView,
  getLeaderboard,
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
