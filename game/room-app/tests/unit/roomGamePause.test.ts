import { DEFAULT_GAME_TIMINGS, type GameEvent } from '@quizzup/game-engine'
import type { LightingController } from '@quizzup/hardware'
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
import { startLighting, stopLighting } from '@/hardware/roomHardware'
import { setDemoMode } from '@/utils/auth'

import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'
import { saveWithSmokeProof } from '../_helpers/smokeProof'

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

/** Lumières par défaut (simulation), sans fumée : seules les scènes sont observées. */
async function startScenes() {
  const lights = await startLighting()
  return { lights, scene: () => lights.getState().currentSceneId }
}

const PARS = [
  { id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1, desk: 1 },
  { id: 'par2', name: 'PAR 2', profileId: 'par-rgb', address: 4, desk: 2 },
  { id: 'par3', name: 'PAR 3', profileId: 'par-rgb', address: 7, desk: 3 },
  { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 },
]
const SMOKE_ON = { enabled: true, requireConfirmation: false }
/** Scène de salle qui commence par un jet de fumée. */
const SMOKE_INTRO = {
  id: 'intro-fumee',
  name: 'Intro fumée',
  priority: 20,
  steps: [
    { type: 'smoke', durationMs: 1_000 },
    { type: 'color', color: { r: 255, g: 0, b: 0 }, intensity: 0.5, fadeMs: 100 },
  ],
}

/** Salle équipée de PAR et d'une machine à fumée, fumée armée, `extra` fusionné dans `lighting`. */
async function startRoom(extra: Record<string, unknown> = {}) {
  await saveWithSmokeProof({ lighting: { fixtures: PARS, smoke: SMOKE_ON, ...extra } })
  const lights = await startLighting()
  let jets = 0
  let firing = false
  lights.onChange((lightsState) => {
    const now = lightsState.smoke.status === 'firing'
    jets += now && !firing ? 1 : 0
    firing = now
  })
  return { lights, jets: () => jets, scene: () => lights.getState().currentSceneId }
}

/**
 * Avance le temps par pas de 20 ms et compte les baisses de niveau d'un appareil : un éclair en
 * fait au moins une, une montée continue vers une couleur n'en fait aucune.
 */
function countDrops(lights: LightingController, durationMs: number): number {
  const last = new Map<string, number>()
  let drops = 0
  const sample = () => {
    for (const view of lights.getFixtureViews()) {
      const level = view.intensity * Math.max(view.color.r, view.color.g, view.color.b)
      drops += level < (last.get(view.id) ?? 0) - 5 ? 1 : 0
      last.set(view.id, level)
    }
  }
  sample()
  for (let at = 0; at < durationMs; at += 20) {
    vi.advanceTimersByTime(20)
    sample()
  }
  return drops
}

/** Liaison d'un événement à une scène de salle (`null` : liaison retirée). */
const bind = (event: string, scene: string | null) => ({ [event]: scene })

/** Pause de plus de 30 s (repos de la fumée écoulé) puis reprise, et un temps pour tout voir. */
function pauseThenResume() {
  pauseGame()
  vi.advanceTimersByTime(31_000)
  resumeGame()
  vi.advanceTimersByTime(2_000)
}

function startIntro() {
  startNewGame({
    registrations: REGISTRATIONS,
    themes: getPlayableThemes(),
    seed: 7,
    miniGames: [MINI_GAME_FLASH_BLIND_TEST],
  })
  vi.advanceTimersByTime(2_000)
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

  /** Partie lancée, amenée à la phase `theme_choice` (joueur qui choisit le thème). */
  function startThemeChoice() {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: 7,
      miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
    vi.advanceTimersByTime(50)
  }

  /** Question de blind test en cours, la scène du choix de thème (20) étant terminée. */
  function startClip() {
    startThemeChoice()
    vi.advanceTimersByTime(1_000)
    const { state } = useRoomGame()
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
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
      await saveWithSmokeProof(SMOKE_CONFIG)
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

  describe('lumières : signaux de pause et de reprise', () => {
    it('la pause joue la scène pause, la reprise rejoue la scène de la phase d’intro de manche', async () => {
      const { scene } = await startScenes()
      startNewGame({
        registrations: REGISTRATIONS,
        themes: getPlayableThemes(),
        seed: 7,
        miniGames: [MINI_GAME_FLASH_BLIND_TEST],
      })
      expect(useRoomGame().state.value?.phase.name).toBe('round_intro')
      expect(scene()).toBe('round-start')

      pauseGame()
      expect(scene()).toBe('pause')
      vi.advanceTimersByTime(600)
      resumeGame()

      expect(scene()).toBe('round-start')
    })

    it('pause pendant le choix du thème : reprise sur la scène du joueur qui choisit', async () => {
      const { scene } = await startScenes()
      startThemeChoice()
      expect(useRoomGame().state.value?.phase.name).toBe('theme_choice')
      expect(scene()).toBe('chooser')

      pauseGame()
      expect(scene()).toBe('pause')
      vi.advanceTimersByTime(600)
      resumeGame()

      expect(scene()).toBe('chooser')
    })

    it('pause pendant un extrait : reprise sur la scène de l’extrait', async () => {
      const { scene } = await startScenes()
      startClip()
      expect(scene()).toBe('clip-playing')

      pauseGame()
      expect(scene()).toBe('pause')
      vi.advanceTimersByTime(600)
      resumeGame()

      expect(scene()).toBe('clip-playing')
    })

    it('pause pendant la réponse d’un joueur : reprise sur la scène de son buzz', async () => {
      const { scene } = await startScenes()
      startClip()
      buzz()
      expect(scene()).toBe('buzz')

      pauseGame()
      expect(scene()).toBe('pause')
      vi.advanceTimersByTime(600)
      resumeGame()

      expect(scene()).toBe('buzz')
    })

    it('pause pendant la révélation : reprise sur l’ambiance de question', async () => {
      const { scene } = await startScenes()
      startQuestion()
      skipQuestion(aimed())
      expect(useRoomGame().state.value?.phase.name).toBe('reveal')

      pauseGame()
      expect(scene()).toBe('pause')
      vi.advanceTimersByTime(600)
      resumeGame()

      expect(scene()).toBe('question')
    })

    it('une reprise en moins de 400 ms n’est pas refusée par la scène pause encore en cours', async () => {
      const { scene } = await startScenes()
      startClip()

      pauseGame()
      vi.advanceTimersByTime(100)
      expect(scene()).toBe('pause')
      resumeGame()

      expect(scene()).toBe('clip-playing')
    })

    it('reprise sans pause préalable : refusée, aucun signal, la scène en cours est gardée', async () => {
      const { lights, scene } = await startScenes()
      startQuestion()
      const handle = vi.spyOn(lights, 'handleGameEvent')
      const before = scene()

      expect(resumeGame()).toEqual({ ok: false, code: GAME_COMMAND_REFUSAL.NOT_PAUSED })

      expect(scene()).toBe(before)
      expect(handle).not.toHaveBeenCalled()
    })

    it('des lumières démarrées hors pause n’émettent aucun signal de pause', async () => {
      startQuestion()

      const lights = await startLighting()

      // Ni `pause`, ni `question` de reprise : les lumières naissent au repos.
      expect(lights.getState().currentSceneId).toBe('idle')
    })

    it('des lumières démarrées pendant une pause jouent la scène pause', async () => {
      startQuestion()
      pauseGame()

      const lights = await startLighting()

      expect(lights.getState().currentSceneId).toBe('pause')
    })

    it('la partie arrêtée puis fermée pendant la pause ne rallume pas l’ambiance de question', async () => {
      const { scene } = await startScenes()
      startQuestion()
      pauseGame()
      abortGame()
      expect(scene()).toBe('idle')

      closeGame()

      expect(scene()).toBe('idle')
    })

    it('un jet demandé par la scène pause elle-même est refusé : la coupure passe avant le signal', async () => {
      const { lights, jets } = await startRoom({
        scenes: [
          {
            id: 'pause',
            name: 'Pause',
            priority: 60,
            steps: [
              { type: 'smoke', durationMs: 1_000 },
              { type: 'color', color: { r: 40, g: 40, b: 40 }, intensity: 0.12, fadeMs: 400 },
            ],
          },
        ],
      })
      const refusals: string[] = []
      lights.onWarning((warning) => {
        refusals.push(warning.kind === 'smoke_refused' ? warning.reason : warning.kind)
      })
      startClip()

      pauseGame()
      vi.advanceTimersByTime(2_000)

      expect(refusals).toEqual(['paused'])
      expect(jets()).toBe(0)
      expect(lights.getState().smoke.status).toBe('ready')
    })

    describe('reprise : couleurs seulement, jamais de fumée ni d’éclair', () => {
      const INTRO = { scenes: [SMOKE_INTRO], bindings: bind('round_started', 'intro-fumee') }

      it('scène de salle avec fumée en première étape : un seul jet pour l’intro, aucun à la reprise', async () => {
        const { jets, scene } = await startRoom(INTRO)
        startIntro()
        expect(jets()).toBe(1)
        expect(useRoomGame().state.value?.phase.name).toBe('round_intro')

        pauseThenResume()

        expect(scene()).not.toBe('pause')
        expect(jets()).toBe(1)
      })

      it('trois pauses et reprises espacées de plus de 30 s : toujours un seul jet', async () => {
        const { jets } = await startRoom(INTRO)
        startIntro()

        for (let cycle = 0; cycle < 3; cycle += 1) {
          pauseThenResume()
        }

        expect(jets()).toBe(1)
      })

      it('une scène de salle liée à un buzz, avec fumée, ne jette aucun jet à la reprise', async () => {
        const { jets } = await startRoom({
          scenes: [{ ...SMOKE_INTRO, id: 'buzz-fumee', priority: 40 }],
          bindings: bind('buzzer_pressed', 'buzz-fumee'),
        })
        startClip()
        buzz()
        vi.advanceTimersByTime(2_000)
        expect(jets()).toBe(1)

        pauseThenResume()

        expect(jets()).toBe(1)
      })

      it('une salle qui a retiré la liaison de reprise : la scène pause (longue) s’arrête, la phase revient', async () => {
        const { scene } = await startRoom({
          bindings: bind('game_resumed', null),
          scenes: [
            {
              id: 'pause',
              name: 'Pause longue',
              priority: 60,
              steps: [
                { type: 'color', color: { r: 40, g: 40, b: 40 }, intensity: 0.12, fadeMs: 400 },
                { type: 'wait', durationMs: 60_000 },
              ],
            },
          ],
        })
        startClip()
        expect(scene()).toBe('clip-playing')

        pauseGame()
        vi.advanceTimersByTime(1_000)
        expect(scene()).toBe('pause')
        resumeGame()

        expect(scene()).toBe('clip-playing')
      })

      it('liaison de reprise retirée, phase sans scène propre (révélation) : ambiance de question', async () => {
        const { scene } = await startRoom({ bindings: bind('game_resumed', null) })
        startClip()
        skipQuestion(aimed())
        vi.advanceTimersByTime(1_000)

        pauseGame()
        resumeGame()

        expect(scene()).toBe('question')
      })

      it('scènes par défaut : une pause pendant round-start n’ajoute aucun éclair, la couleur revient', async () => {
        const { lights, scene } = await startRoom()
        startNewGame({
          registrations: REGISTRATIONS,
          themes: getPlayableThemes(),
          seed: 7,
          miniGames: [MINI_GAME_FLASH_BLIND_TEST],
        })
        vi.advanceTimersByTime(3_000)
        pauseGame()
        vi.advanceTimersByTime(600)

        resumeGame()

        expect(scene()).toBe('round-start')
        expect(countDrops(lights, 2_000)).toBe(0)
        const par = lights.getFixtureViews().find((view) => view.id === 'par1')
        expect(par?.intensity).toBeCloseTo(0.4, 1)
      })

      it('scènes par défaut : une pause pendant buzz n’ajoute aucun éclair, le pupitre reste allumé', async () => {
        const { lights, scene } = await startRoom()
        startClip()
        buzz()
        vi.advanceTimersByTime(2_000)
        pauseGame()
        vi.advanceTimersByTime(600)

        resumeGame()

        expect(scene()).toBe('buzz')
        expect(countDrops(lights, 2_000)).toBe(0)
        const lit = lights.getFixtureViews().filter((view) => view.intensity >= 0.9)
        expect(lit).toHaveLength(1)
      })

      it('le même événement joué normalement (hors reprise) fait bien des éclairs', async () => {
        const { lights } = await startRoom()
        startNewGame({
          registrations: REGISTRATIONS,
          themes: getPlayableThemes(),
          seed: 7,
          miniGames: [MINI_GAME_FLASH_BLIND_TEST],
        })
        vi.advanceTimersByTime(3_000)

        lights.handleGameEvent({ type: 'round_started', payload: { miniGame: 'flash_blind_test' } })

        expect(countDrops(lights, 2_000)).toBeGreaterThan(0)
      })
    })

    it('une nouvelle partie lancée pendant une pause : lumières de la partie neuve, rien d’une reprise', async () => {
      const { scene, jets } = await startRoom({
        scenes: [SMOKE_INTRO],
        bindings: bind('round_started', 'intro-fumee'),
      })
      startClip()
      pauseGame()
      vi.advanceTimersByTime(31_000)
      expect(jets()).toBe(1)

      startNewGame({
        registrations: REGISTRATIONS,
        themes: getPlayableThemes(),
        seed: 8,
        miniGames: [MINI_GAME_FLASH_BLIND_TEST],
      })

      expect(useRoomGame().paused.value).toBe(false)
      expect(scene()).toBe('intro-fumee')
      // Un jet pour chaque partie, aucun de plus pour la reprise parasite de l'état neuf.
      expect(jets()).toBe(2)
    })
  })
})
