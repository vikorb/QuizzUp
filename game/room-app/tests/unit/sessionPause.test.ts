import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { GAME_COMMAND_REFUSAL } from '@quizzup/shared'

import { createMemorySessionStorage, GameSession } from '@/game/session'

import { correctButton, driveToQuestion } from '../_helpers/drive'
import { baseSetup, createManualClock, REGISTRATIONS } from '../_helpers/fixtures'

function startSession() {
  const storage = createMemorySessionStorage()
  const clock = createManualClock()
  const session = GameSession.create(baseSetup(), REGISTRATIONS, { storage, now: clock.now })
  session.start()
  return { session, clock, storage }
}

function startQuestion() {
  const started = startSession()
  driveToQuestion(started.session, started.clock)
  expect(started.session.state.phase.name).toBe('question')
  return started
}

describe('GameSession : pause', () => {
  it('gèle l’horloge : aucune échéance ne tombe pendant la pause, et elle repart de là', () => {
    const { session, clock } = startSession()
    const intro = DEFAULT_GAME_TIMINGS.roundIntroMs

    clock.advance(intro - 1000)
    expect(session.pause()).toEqual({ ok: true })
    expect(session.paused).toBe(true)
    const frozen = session.now()

    // Une heure de pause : le moteur ne voit passer aucune seconde.
    clock.advance(3_600_000)
    session.tick()
    expect(session.now()).toBe(frozen)
    expect(session.state.phase.name).toBe('round_intro')

    expect(session.resume()).toEqual({ ok: true })
    expect(session.paused).toBe(false)
    expect(session.now()).toBe(frozen)

    // L'échéance (1000 ms plus loin) recule du temps de pause : ni sautée ni expirée d'un coup.
    clock.advance(999)
    session.tick()
    expect(session.state.phase.name).toBe('round_intro')
    clock.advance(2)
    session.tick()
    expect(session.state.phase.name).toBe('theme_choice')
  })

  it('cumule plusieurs pauses sans dériver', () => {
    const { session, clock } = startSession()

    clock.advance(500)
    session.pause()
    clock.advance(10_000)
    session.resume()
    clock.advance(500)
    session.pause()
    clock.advance(20_000)
    session.resume()

    // 500 + 500 ms de jeu seulement depuis le démarrage (à 1000).
    expect(session.now()).toBe(2000)
  })

  it('ignore les appuis de buzzers pendant la pause, les prend après la reprise', () => {
    const { session, clock } = startQuestion()
    session.pause()
    const answersBefore = session.state.rounds[0]?.answers.length

    // Le blind test attend un buzz : l'appui en pause ne doit rien déclencher.
    expect(session.press(1, 0)).toEqual([])
    expect(session.press(1, 0, clock.now())).toEqual([])
    expect(session.state.rounds[0]?.answers).toHaveLength(answersBefore ?? -1)

    session.resume()
    const events = session.press(1, 0)
    expect(events.map((event) => event.type)).toContain('buzzer_pressed')
  })

  it('refuse la pause hors partie en cours, avec le bon code', () => {
    const { session } = startSession()

    session.abort('operator')

    expect(session.pause()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER })
    expect(session.paused).toBe(false)
  })

  it('refuse deux pauses et une reprise sans pause', () => {
    const { session } = startSession()

    expect(session.resume()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_PAUSED })
    session.pause()
    expect(session.pause()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.ALREADY_PAUSED })
  })

  it('refuse reprise et passage de question une fois la partie arrêtée', () => {
    const { session } = startQuestion()

    session.pause()
    session.abort('operator')

    expect(session.resume()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER })
    expect(session.skip()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER })
  })

  it('sauvegarde l’instant de la pause : rechargée, la partie reprend là, non pausée', () => {
    const { session, clock, storage } = startSession()

    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs - 1000)
    session.pause()
    const frozen = session.now()
    expect(storage.current?.lastAt).toBe(frozen)

    clock.advance(600_000)
    const resumed = GameSession.resume({ storage, now: createManualClock(5).now })

    expect(resumed?.paused).toBe(false)
    expect(resumed?.now()).toBe(frozen)
    expect(resumed?.state.phase.name).toBe('round_intro')
  })
})

describe('GameSession : passer la question', () => {
  it('termine la question sans point et enchaîne', () => {
    const { session, clock } = startQuestion()
    const scores = session.state.scores.map((line) => line.score)

    clock.advance(200)
    expect(session.skip()).toEqual({ ok: true })

    expect(session.state.phase.name).toBe('reveal')
    expect(session.state.scores.map((line) => line.score)).toEqual(scores)
    expect(session.state.rounds[0]?.skippedQuestionIds).toHaveLength(1)

    clock.advance(DEFAULT_GAME_TIMINGS.revealMs)
    session.tick()
    expect(session.state.phase).toMatchObject({ name: 'question', questionIndex: 1 })
  })

  it('se rejoue après un rechargement : la commande est sauvegardée', () => {
    const { session, clock, storage } = startQuestion()

    clock.advance(200)
    session.skip()
    const resumed = GameSession.resume({ storage, now: createManualClock(5).now })

    expect(storage.current?.commands.map((command) => command.type)).toContain('skip')
    expect(resumed?.state.phase.name).toBe('reveal')
    expect(resumed?.state.rounds[0]?.skippedQuestionIds).toEqual(
      session.state.rounds[0]?.skippedQuestionIds
    )
  })

  it('est refusée hors d’une question et pendant une pause', () => {
    const { session, clock } = startSession()

    expect(session.skip()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })

    driveToQuestion(session, clock)
    session.pause()
    expect(session.skip()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.PAUSED })
    expect(session.state.phase.name).toBe('question')
  })

  it('est refusée si la question vient de finir d’elle-même depuis le dernier tick', () => {
    const { session, clock } = startQuestion()

    // Les trois paliers du blind test durent 35 s ; la révélation dure 5 s. Le moteur n'a pas
    // encore vu passer le temps (toujours « question » dans l'état), mais applique les échéances
    // avant la commande : la question était finie, rien n'est passé.
    clock.advance(36_000)
    expect(session.state.phase.name).toBe('question')

    expect(session.skip()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })
    expect(session.state.rounds[0]?.skippedQuestionIds).toBeUndefined()
    expect(session.state.phase.name).toBe('reveal')
  })

  it('ne change rien à une bonne réponse normale', () => {
    const { session, clock } = startQuestion()

    clock.advance(300)
    session.press(1, 0)
    clock.advance(300)
    session.press(1, correctButton(session))

    expect(session.state.scores.find((line) => line.participantId === 1)?.score).toBe(100)
  })
})
