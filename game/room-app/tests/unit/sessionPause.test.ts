import {
  DEFAULT_GAME_TIMINGS,
  FLASH_BLIND_TEST_BUZZ_WINDOW_MS,
  FLASH_BLIND_TEST_STAGE_DURATIONS_MS,
  type GameEvent,
} from '@quizzup/game-engine'
import { GAME_COMMAND_REFUSAL } from '@quizzup/shared'

import { getLiveQuestionId } from '@/game/selectors'
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

/** Question visée par un clic à cet instant (0 hors question). */
function aimed(session: GameSession): number {
  return getLiveQuestionId(session.state) ?? 0
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
    const id = aimed(session)

    session.pause()
    session.abort('operator')

    expect(session.resume()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER })
    expect(session.skip(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER })
  })

  it('applique les échéances déjà tombées avant de figer l’horloge : rien n’est émis pendant la pause', () => {
    const { session, clock } = startQuestion()
    const events: GameEvent[] = []
    session.onChange((_state, emitted) => events.push(...emitted))
    const stage1Ms = FLASH_BLIND_TEST_STAGE_DURATIONS_MS[0] + FLASH_BLIND_TEST_BUZZ_WINDOW_MS
    const stage2Ms = FLASH_BLIND_TEST_STAGE_DURATIONS_MS[1] + FLASH_BLIND_TEST_BUZZ_WINDOW_MS

    // Fin du palier 1 (extrait + fenêtre de buzz) dépassée de 10 ms, sans tick depuis.
    clock.advance(stage1Ms + 10)
    expect(session.state.phase).toMatchObject({ miniGameState: { stageIndex: 0 } })

    expect(session.pause()).toEqual({ ok: true })
    // Le palier 2 a démarré à son échéance, avant la pause.
    expect(session.state.phase).toMatchObject({ miniGameState: { stageIndex: 1 } })
    expect(events.map((event) => event.type)).toContain('blind_test_stage_started')
    const emittedBeforePause = events.length

    // Pendant la pause : ni tick ni appui n'émettent quoi que ce soit.
    clock.advance(120_000)
    session.tick()
    session.press(1, 0)
    expect(events).toHaveLength(emittedBeforePause)

    // À la reprise, le palier 2 suit son cours normal (il lui reste sa durée moins 10 ms).
    session.resume()
    clock.advance(stage2Ms - 20)
    session.tick()
    expect(session.state.phase).toMatchObject({ miniGameState: { stageIndex: 1 } })
    clock.advance(20)
    session.tick()
    expect(session.state.phase).toMatchObject({ miniGameState: { stageIndex: 2 } })
  })

  it('refuse la pause si la partie se termine à l’échéance déjà tombée', () => {
    const { session, clock } = startSession()

    clock.advance(10_000_000)

    expect(session.pause()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER })
    expect(session.paused).toBe(false)
    expect(session.isOver).toBe(true)
  })
})

describe('GameSession : pause sauvegardée', () => {
  it('rechargée pendant une pause, la partie reprend là, en pause, puis la reprise relance l’horloge', () => {
    const { session, clock, storage } = startSession()

    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs - 1000)
    session.pause()
    const frozen = session.now()
    expect(storage.current).toMatchObject({ lastAt: frozen, paused: true })

    clock.advance(600_000)
    const reloadedClock = createManualClock(5)
    const resumed = GameSession.resume({ storage, now: reloadedClock.now })

    expect(resumed?.paused).toBe(true)
    expect(resumed?.now()).toBe(frozen)
    expect(resumed?.state.phase.name).toBe('round_intro')

    // Toujours gelée : le temps qui passe ne compte pas, les buzzers sont sourds.
    reloadedClock.advance(3_600_000)
    resumed?.tick()
    expect(resumed?.now()).toBe(frozen)
    expect(resumed?.state.phase.name).toBe('round_intro')
    expect(resumed?.press(1, 0)).toEqual([])

    // La reprise relance l'horloge là où elle s'était arrêtée.
    expect(resumed?.resume()).toEqual({ ok: true })
    expect(resumed?.paused).toBe(false)
    expect(resumed?.now()).toBe(frozen)
    reloadedClock.advance(999)
    resumed?.tick()
    expect(resumed?.state.phase.name).toBe('round_intro')
    reloadedClock.advance(2)
    resumed?.tick()
    expect(resumed?.state.phase.name).toBe('theme_choice')
  })

  it('sauvegarde la partie non pausée après la reprise', () => {
    const { session, clock, storage } = startSession()

    session.pause()
    session.resume()
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs)
    session.tick() // l'événement déclenche une sauvegarde

    expect(storage.current?.paused).toBe(false)
    expect(GameSession.resume({ storage, now: createManualClock(5).now })?.paused).toBe(false)
  })

  it('lit une sauvegarde d’avant le champ « paused » : reprise non pausée', () => {
    const { session, clock, storage } = startSession()

    clock.advance(500)
    session.tick()
    const legacy = structuredClone(storage.current) as { paused?: boolean } | null
    expect(legacy).not.toBeNull()
    delete legacy?.paused
    storage.current = legacy as typeof storage.current

    expect(GameSession.resume({ storage, now: createManualClock(5).now })?.paused).toBe(false)
  })

  it('une partie rechargée en pause refuse de passer la question', () => {
    const { session, clock, storage } = startQuestion()
    const id = aimed(session)

    clock.advance(100)
    session.pause()
    const resumed = GameSession.resume({ storage, now: createManualClock(5).now })

    expect(resumed?.skip(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.PAUSED })
  })
})

describe('GameSession : passer la question', () => {
  it('termine la question sans point et enchaîne', () => {
    const { session, clock } = startQuestion()
    const scores = session.state.scores.map((line) => line.score)

    clock.advance(200)
    expect(session.skip(aimed(session))).toEqual({ ok: true })

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
    session.skip(aimed(session))
    const resumed = GameSession.resume({ storage, now: createManualClock(5).now })

    expect(storage.current?.commands.map((command) => command.type)).toContain('skip')
    expect(resumed?.state.phase.name).toBe('reveal')
    expect(resumed?.state.rounds[0]?.skippedQuestionIds).toEqual(
      session.state.rounds[0]?.skippedQuestionIds
    )
  })

  it('est refusée hors d’une question et pendant une pause', () => {
    const { session, clock } = startSession()

    expect(session.skip(0)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })

    driveToQuestion(session, clock)
    const id = aimed(session)
    session.pause()
    expect(session.skip(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.PAUSED })
    expect(session.state.phase.name).toBe('question')
  })

  it('est refusée si la question vient de finir d’elle-même depuis le dernier tick', () => {
    const { session, clock } = startQuestion()
    const id = aimed(session)

    // Les trois paliers du blind test durent 35 s ; la révélation dure 5 s. Le moteur n'a pas
    // encore vu passer le temps (toujours « question » dans l'état), mais applique les échéances
    // avant la commande : la question était finie, rien n'est passé.
    clock.advance(36_000)
    expect(session.state.phase.name).toBe('question')

    expect(session.skip(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })
    expect(session.state.rounds[0]?.skippedQuestionIds).toBeUndefined()
    expect(session.state.phase.name).toBe('reveal')
  })

  it('ne passe pas la question suivante quand la visée a fini plus de 41 s avant la validation', () => {
    const { session, clock } = startQuestion()
    const id = aimed(session)

    // La question visée et sa révélation sont passées, la suivante est en cours. Sans tick, le
    // moteur applique les échéances avant la commande : il ne doit rien passer.
    clock.advance(41_000)
    expect(session.state.phase).toMatchObject({ name: 'question', questionIndex: 0 })

    expect(session.skip(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })
    expect(session.state.phase).toMatchObject({ name: 'question', questionIndex: 1 })
    expect(session.state.rounds[0]?.skippedQuestionIds).toBeUndefined()
  })

  it('ne passe pas la question suivante quand la validation arrive après un tick', () => {
    const { session, clock } = startQuestion()
    const id = aimed(session)

    clock.advance(41_000)
    session.tick()
    expect(session.state.phase).toMatchObject({ name: 'question', questionIndex: 1 })

    expect(session.skip(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })
    expect(session.state.rounds[0]?.skippedQuestionIds).toBeUndefined()
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
