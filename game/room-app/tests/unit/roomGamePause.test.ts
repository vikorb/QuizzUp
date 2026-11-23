import { DEFAULT_GAME_TIMINGS, type GameEvent } from '@quizzup/game-engine'
import { GAME_COMMAND_REFUSAL, MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'

import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { getDemoThemes } from '@/game/demoContent'
import { getLiveQuestionId } from '@/game/selectors'
import { createMemorySessionStorage } from '@/game/session'
import * as roomGame from '@/game/useRoomGame'
import {
  abortGame,
  closeGame,
  configureRoomGame,
  pauseGame,
  pressBuzzer,
  resumeGame,
  resumeSavedGame,
  skipQuestion,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import { saveRoomHardwareConfig, startLighting, stopLighting } from '@/hardware/roomHardware'
import { setDemoMode } from '@/utils/auth'

import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'

const noop = () => undefined

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

/** Question visée par un clic à cet instant. */
function aimed(): number {
  const { state } = useRoomGame()
  return (state.value ? getLiveQuestionId(state.value) : null) ?? 0
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
    expect(skipQuestion(1)).toEqual(refused)
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
    const id = aimed()

    expect(resumeGame()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_PAUSED })
    pauseGame()
    expect(pauseGame()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.ALREADY_PAUSED })
    expect(skipQuestion(id)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.PAUSED })
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

    expect(skipQuestion(1)).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION })
  })

  it('refuse de passer une autre question que celle visée, et ne touche pas à la partie', () => {
    startQuestion()
    const { state } = useRoomGame()
    const id = aimed()

    expect(skipQuestion(id + 1)).toEqual({
      ok: false,
      code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION,
    })
    expect(state.value?.phase.name).toBe('question')
    expect(state.value?.rounds[0]?.skippedQuestionIds).toBeUndefined()
  })

  it('passe la question en cours : scores inchangés, révélation', () => {
    startQuestion()
    const { state } = useRoomGame()
    const scores = state.value?.scores.map((line) => line.score)

    expect(skipQuestion(aimed())).toEqual({ ok: true })

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
    expect(skipQuestion(1)).toEqual(refused)
  })

  it('rechargée en pause, la partie reprend en pause, l’extrait suspendu jusqu’à la reprise', async () => {
    const { paused, now } = useRoomGame()
    startQuestion()
    const frozen = now.value
    pauseGame()

    // Rechargement : la session sauvegardée est rouverte à la place de celle en mémoire.
    expect(await resumeSavedGame()).toBe(true)

    expect(paused.value).toBe(true)
    expect(now.value).toBe(frozen)
    // L'extrait relancé par la reprise est aussitôt suspendu : la salle reste silencieuse.
    expect(player.play).toHaveBeenCalledTimes(2)
    expect(player.pause).toHaveBeenCalledTimes(2)
    clock.advance(120_000)
    vi.advanceTimersByTime(50)
    expect(now.value).toBe(frozen)

    vi.mocked(player.resume).mockClear()
    expect(resumeGame()).toEqual({ ok: true })
    expect(paused.value).toBe(false)
    expect(player.resume).toHaveBeenCalledTimes(1)
  })

  it('fermer la partie remet l’indicateur de pause à zéro', () => {
    const { paused } = useRoomGame()
    startQuestion()
    pauseGame()

    closeGame()

    expect(paused.value).toBe(false)
  })

  describe('fumée', () => {
    const SMOKE_CONFIG = {
      lighting: {
        fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }],
        smoke: { enabled: true, requireConfirmation: false },
      },
    }
    const VICTORY: GameEvent = {
      seq: 1,
      type: 'game_ended',
      at: 0,
      payload: { winnerIds: [1], desk: 1 },
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function startLights() {
      await saveRoomHardwareConfig(SMOKE_CONFIG)
      return startLighting()
    }

    /** Écoute des événements remplacée : le test les injecte lui-même, partie en pause ou non. */
    function captureGameEvents() {
      let listener: (events: GameEvent[]) => void = noop
      vi.spyOn(roomGame, 'onGameEvents').mockImplementation((next) => {
        listener = next
        return noop
      })
      return (events: GameEvent[]) => listener(events)
    }

    it('coupe le jet en cours dès la mise en pause', async () => {
      const lights = await startLights()
      startQuestion()
      expect(lights.smoke.fire(3_000)).toMatchObject({ ok: true })
      expect(lights.getState().smoke.status).toBe('firing')

      pauseGame()

      expect(lights.getState().smoke.status).toBe('cooldown')
      expect(lights.getState().smoke.level).toBe(0)
      expect(lights.getState().smoke.lastStopReason).toBe('manual')
    })

    it('ne relance aucun jet à la reprise', async () => {
      const lights = await startLights()
      startQuestion()
      lights.smoke.fire(3_000)

      pauseGame()
      resumeGame()

      expect(lights.getState().smoke.status).not.toBe('firing')
      vi.advanceTimersByTime(60_000)
      expect(lights.getState().smoke.status).toBe('ready')
    })

    it('ne touche ni à l’armement ni au temps de repos quand aucun jet n’est en cours', async () => {
      const lights = await startLights()
      startQuestion()

      pauseGame()

      expect(lights.getState().smoke).toMatchObject({ status: 'ready', armed: true })
    })

    it('hors pause, un événement de victoire déclenche la fumée', async () => {
      const emit = captureGameEvents()
      const lights = await startLights()
      startQuestion()

      emit([VICTORY])
      vi.advanceTimersByTime(500)

      expect(lights.getState().smoke.status).toBe('firing')
    })

    it('en pause, un événement qui déclencherait la fumée ne la déclenche pas', async () => {
      const emit = captureGameEvents()
      const lights = await startLights()
      startQuestion()
      pauseGame()

      emit([VICTORY])
      vi.advanceTimersByTime(500)

      expect(lights.getState().smoke.status).toBe('ready')
      expect(lights.getState().currentSceneId).not.toBe('victory')
    })

    it('à la reprise, la fumée ne revient que sur un nouvel événement', async () => {
      const emit = captureGameEvents()
      const lights = await startLights()
      startQuestion()
      pauseGame()
      emit([VICTORY])
      resumeGame()
      vi.advanceTimersByTime(500)
      expect(lights.getState().smoke.status).toBe('ready')

      emit([VICTORY])
      vi.advanceTimersByTime(500)

      expect(lights.getState().smoke.status).toBe('firing')
    })

    it('l’arrêt de partie pendant la pause remet les lumières au repos, même sur une scène prioritaire', async () => {
      const lights = await startLights()
      startQuestion()
      lights.playScene('answer-correct', { desk: 1 })
      expect(lights.getState().currentSceneId).toBe('answer-correct')
      pauseGame()

      abortGame()

      expect(lights.getState().currentSceneId).toBe('idle')
    })

    it('une scène de victoire lancée avant la pause ne tire pas la fumée pendant la pause', async () => {
      const lights = await startLights()
      startQuestion()
      lights.playScene('victory', { desk: 1 })

      pauseGame()
      vi.advanceTimersByTime(500)

      expect(lights.getState().smoke.status).not.toBe('firing')
      expect(lights.getState().smoke.status).toBe('ready')
    })

    it('pendant la pause, le test manuel de fumée est refusé avec le motif paused', async () => {
      const lights = await startLights()
      startQuestion()
      pauseGame()

      expect(lights.smoke.fire(1_000)).toEqual({ ok: false, reason: 'paused' })
      expect(lights.getState().smoke.status).toBe('ready')
    })

    it('à la reprise, un tir immédiat tombe dans le temps de repos du jet coupé par la pause', async () => {
      const lights = await startLights()
      startQuestion()
      lights.smoke.fire(3_000)
      pauseGame()
      resumeGame()

      expect(lights.smoke.fire(1_000)).toEqual({ ok: false, reason: 'cooldown' })
    })

    it('des lumières redémarrées pendant une pause naissent en pause et refusent la fumée', async () => {
      const first = await startLights()
      startQuestion()
      pauseGame()

      await stopLighting()
      const again = await startLighting()

      expect(again).not.toBe(first)
      expect(again.smoke.fire(1_000)).toEqual({ ok: false, reason: 'paused' })

      resumeGame()
      expect(again.smoke.fire(1_000)).toMatchObject({ ok: true })
    })
  })
})
