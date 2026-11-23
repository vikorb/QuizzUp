import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { GAME_COMMAND_REFUSAL, MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'

import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import {
  abortGame,
  closeGame,
  configureRoomGame,
  pauseGame,
  pressBuzzer,
  resumeGame,
  skipQuestion,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import { setDemoMode } from '@/utils/auth'

import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'

function fakePlayer(): ExtractPlayer {
  return {
    ...createSilentExtractPlayer(),
    play: vi.fn(async () => 'ended' as const),
    pause: vi.fn(() => 0),
    resume: vi.fn(),
    stop: vi.fn(),
    isLoaded: vi.fn(() => true),
  }
}

describe('useRoomGame : pause et passage de question', () => {
  let clock: ReturnType<typeof createManualClock>
  let player: ExtractPlayer

  beforeEach(() => {
    vi.useFakeTimers()
    clock = createManualClock()
    player = fakePlayer()
    configureRoomGame({ storage: createMemorySessionStorage(), player, now: clock.now })
    setDemoMode(true)
  })

  afterEach(() => {
    closeGame()
    setDemoMode(false)
    localStorage.clear()
    vi.useRealTimers()
  })

  /** Partie de blind test amenée à la 1re question (thème A choisi). */
  function startQuestion() {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: 7,
      miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)
    const { state } = useRoomGame()
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
    expect(state.value?.phase.name).toBe('question')
  }

  function buzz(desk: 1 | 2 | 3 = 1) {
    pressBuzzer({ desk, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
  }

  it('sans partie, chaque commande est refusée avec le code game_over', () => {
    const refused = { ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER }

    expect(pauseGame()).toEqual(refused)
    expect(resumeGame()).toEqual(refused)
    expect(skipQuestion()).toEqual(refused)
  })

  it('met en pause : horloge gelée, extrait suspendu, indicateur exposé, puis reprise', () => {
    const { paused, state, now } = useRoomGame()
    startQuestion()
    const frozen = now.value

    expect(paused.value).toBe(false)
    expect(pauseGame()).toEqual({ ok: true })
    expect(paused.value).toBe(true)
    expect(player.pause).toHaveBeenCalledTimes(1)

    clock.advance(120_000)
    vi.advanceTimersByTime(50)
    expect(now.value).toBe(frozen)
    expect(state.value?.phase.name).toBe('question')

    expect(resumeGame()).toEqual({ ok: true })
    expect(paused.value).toBe(false)
    expect(player.resume).toHaveBeenCalledTimes(1)
    expect(now.value).toBe(frozen)
  })

  it('ignore les buzzers pendant la pause', () => {
    startQuestion()
    const { state } = useRoomGame()
    pauseGame()

    buzz()
    expect(state.value?.phase).toMatchObject({
      name: 'question',
      miniGameState: { status: 'playing' },
    })

    resumeGame()
    buzz()
    expect(state.value?.phase).toMatchObject({
      name: 'question',
      miniGameState: { status: 'answering' },
    })
  })

  it('ne relance pas l’extrait à la reprise s’il attendait déjà la réponse d’un joueur', () => {
    startQuestion()
    buzz()

    pauseGame()
    resumeGame()

    expect(player.resume).not.toHaveBeenCalled()
  })

  it('refuse avec le bon code : déjà en pause, pas en pause, passer en pause', () => {
    startQuestion()

    expect(resumeGame()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_PAUSED })
    pauseGame()
    expect(pauseGame()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.ALREADY_PAUSED })
    expect(skipQuestion()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.PAUSED })
    // Les refus ne touchent pas à l'extrait.
    expect(player.pause).toHaveBeenCalledTimes(1)
  })

  it('refuse de passer la question hors question', () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 7,
      miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    })

    expect(skipQuestion()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })
  })

  it('passe la question en cours : scores inchangés, révélation', () => {
    startQuestion()
    const { state } = useRoomGame()
    const scores = state.value?.scores.map((line) => line.score)

    expect(skipQuestion()).toEqual({ ok: true })

    expect(state.value?.phase.name).toBe('reveal')
    expect(state.value?.scores.map((line) => line.score)).toEqual(scores)
    expect(player.stop).toHaveBeenCalled()
  })

  it('refuse tout après l’arrêt de la partie, même pendant une pause', () => {
    startQuestion()
    pauseGame()
    abortGame()
    const refused = { ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER }

    expect(pauseGame()).toEqual(refused)
    expect(resumeGame()).toEqual(refused)
    expect(skipQuestion()).toEqual(refused)
  })

  it('fermer la partie remet l’indicateur de pause à zéro', () => {
    const { paused } = useRoomGame()
    startQuestion()
    pauseGame()

    closeGame()

    expect(paused.value).toBe(false)
  })
})
