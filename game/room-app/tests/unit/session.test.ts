import { createLocalSessionStorage, createMemorySessionStorage, GameSession } from '@/game/session'

import { correctButton, driveToQuestion } from '../_helpers/drive'
import { baseSetup, createManualClock, REGISTRATIONS } from '../_helpers/fixtures'

describe('GameSession', () => {
  it('démarre la partie et sauvegarde graine + commandes', () => {
    const storage = createMemorySessionStorage()
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, { storage, now: clock.now })

    const events = session.start()

    expect(events.map((event) => event.type)).toContain('game_started')
    expect(session.state.phase.name).toBe('round_intro')
    expect(storage.current?.commands).toEqual([{ type: 'start', at: 1000 }])
    expect(storage.current?.registrations).toEqual(REGISTRATIONS)
  })

  it('ne sauvegarde pas chaque tick, mais l’horloge au moins chaque seconde', () => {
    const storage = createMemorySessionStorage()
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, { storage, now: clock.now })
    session.start()
    const save = vi.spyOn(storage, 'save')

    clock.advance(100)
    session.tick()
    expect(save).not.toHaveBeenCalled()

    clock.advance(1000)
    session.tick()
    expect(save).toHaveBeenCalledTimes(1)
    expect(storage.current?.lastAt).toBe(2100)
    expect(storage.current?.commands).toHaveLength(1)
  })

  it('notifie les écouteurs avec l’état et les événements', () => {
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, {
      storage: createMemorySessionStorage(),
      now: clock.now,
    })
    const listener = vi.fn()
    const off = session.onChange(listener)

    session.start()
    off()
    session.tick()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[1][0]?.type).toBe('game_started')
  })

  it('reprend après rechargement au même point, horloge décalée', () => {
    const storage = createMemorySessionStorage()
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, { storage, now: clock.now })
    session.start()
    driveToQuestion(session, clock)
    clock.advance(400)
    session.tick()
    clock.advance(700)
    session.tick() // sauvegarde de l'horloge (> 1 s depuis la dernière)
    const before = session.state

    // Après un rechargement, performance.now() repart presque de zéro.
    const reloadedClock = createManualClock(5)
    const resumed = GameSession.resume({ storage, now: reloadedClock.now })

    expect(resumed).not.toBeNull()
    expect(resumed?.state.phase).toEqual(before.phase)
    expect(resumed?.state.scores).toEqual(before.scores)
    expect(resumed?.now()).toBe(storage.current?.lastAt)
    expect(resumed?.savedRegistrations).toEqual(REGISTRATIONS)
  })

  it('ramène l’horodatage d’un appui sur l’horloge de la partie', () => {
    const storage = createMemorySessionStorage()
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, { storage, now: clock.now })
    session.start()
    driveToQuestion(session, clock)
    clock.advance(1000)
    session.tick()

    const resumed = GameSession.resume({ storage, now: createManualClock(0).now })
    const lastAt = storage.current?.lastAt ?? 0
    resumed?.press(1, 0, 3) // keydown à t=3 sur la nouvelle horloge

    expect(storage.current?.commands.at(-1)).toMatchObject({ type: 'press', at: lastAt + 3 })
  })

  it('marque les points de la bonne réponse et passe à la révélation', () => {
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, {
      storage: createMemorySessionStorage(),
      now: clock.now,
    })
    session.start()
    driveToQuestion(session, clock)

    clock.advance(300)
    session.press(2, 0) // Hugo buzze au palier 1
    const button = correctButton(session)
    clock.advance(300)
    const events = session.press(2, button)

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['answer_correct', 'points_awarded', 'question_ended'])
    )
    expect(session.state.phase.name).toBe('reveal')
    expect(session.state.scores.find((line) => line.participantId === 2)?.score).toBe(100)
  })

  it('n’envoie plus rien au moteur une fois la partie arrêtée', () => {
    const storage = createMemorySessionStorage()
    const clock = createManualClock()
    const session = GameSession.create(baseSetup(), REGISTRATIONS, { storage, now: clock.now })
    session.start()

    expect(session.abort('operator_abort').map((event) => event.type)).toEqual(['game_aborted'])
    expect(session.isOver).toBe(true)
    expect(session.tick()).toEqual([])

    session.discard()
    expect(storage.current).toBeNull()
  })

  it('ignore une sauvegarde absente ou illisible', () => {
    const storage = createMemorySessionStorage()
    expect(GameSession.resume({ storage })).toBeNull()

    storage.current = {
      version: 1,
      setup: { ...baseSetup(), participants: [] },
      commands: [],
      lastAt: 0,
      registrations: [],
    }
    expect(GameSession.resume({ storage })).toBeNull()
    expect(storage.current).toBeNull()
  })
})

describe('createLocalSessionStorage', () => {
  beforeEach(() => localStorage.clear())

  it('sauvegarde, relit et efface dans localStorage', () => {
    const storage = createLocalSessionStorage('test_key')
    const snapshot = {
      version: 1 as const,
      setup: baseSetup(),
      commands: [],
      lastAt: 10,
      registrations: [],
    }

    storage.save(snapshot)
    expect(storage.load()).toEqual(snapshot)
    storage.clear()
    expect(storage.load()).toBeNull()
  })

  it('rejette un contenu corrompu ou d’une autre version', () => {
    const storage = createLocalSessionStorage('test_key')

    localStorage.setItem('test_key', '{pas du json')
    expect(storage.load()).toBeNull()
    localStorage.setItem('test_key', JSON.stringify({ version: 2 }))
    expect(storage.load()).toBeNull()
  })
})
