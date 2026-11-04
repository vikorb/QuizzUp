import { DEFAULT_GAME_TIMINGS, getMiniGameQuestion } from '@quizzup/game-engine'
import {
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
  type MiniGame,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'

import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import {
  closeGame,
  configureRoomGame,
  pressBuzzer,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import GameView from '@/views/GameView.vue'

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp } from '../_helpers/mount'

type Clock = ReturnType<typeof createManualClock>

function press(desk: number, buttonIndex: number, clock: Clock): void {
  pressBuzzer({ desk, buttonIndex, at: clock.value } as never)
}

async function startOn(miniGame: MiniGame, clock: Clock) {
  startNewGame({
    registrations: REGISTRATIONS,
    themes: getDemoThemes(),
    seed: 5,
    miniGames: [miniGame],
  })
  const { wrapper } = await mountWithApp(GameView, { route: '/play' })
  clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
  useRoomGame().session.value?.tick()
  const round = useRoomGame().state.value?.rounds.at(-1)
  const chooser = REGISTRATIONS.findIndex(
    (_item, index) => index + 1 === round?.chooserParticipantId
  )
  useRoomGame().session.value?.press(chooser + 1 || 1, 0)
  await flushPromises()
  return wrapper
}

function correctIndex(): number {
  const phase = useRoomGame().state.value?.phase
  return phase?.name === 'question'
    ? getMiniGameQuestion(phase.miniGameState).answers.findIndex((answer) => answer.isCorrect)
    : 0
}

/** Une mauvaise réponse de la question en cours (2 à 4 réponses selon la question). */
function wrongIndex(): number {
  const phase = useRoomGame().state.value?.phase
  const count =
    phase?.name === 'question' ? getMiniGameQuestion(phase.miniGameState).answers.length : 4
  return (correctIndex() + 1) % count
}

describe('écrans des mini-jeux', () => {
  let clock: Clock

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    clock = createManualClock()
    configureRoomGame({ storage: createMemorySessionStorage(), now: clock.now })
  })

  afterEach(() => closeGame())

  it('rapidité : compte les réponses puis affiche les points de chacun', async () => {
    const wrapper = await startOn(MINI_GAME_QUICK_ANSWER, clock)
    expect(wrapper.text()).toContain('0 / 3 ont répondu')

    useRoomGame().session.value?.press(1, correctIndex() as 0)
    await flushPromises()
    expect(wrapper.text()).toContain('1 / 3 ont répondu')
    expect(wrapper.text()).toContain('A répondu')

    useRoomGame().session.value?.press(2, correctIndex() as 0)
    useRoomGame().session.value?.press(3, wrongIndex() as 0)
    await flushPromises()
    expect(wrapper.text()).toContain('La bonne réponse')
    expect(wrapper.text()).toContain('+100')
  })

  it('vrai ou faux : rappelle A = Vrai, B = Faux', async () => {
    const wrapper = await startOn(MINI_GAME_TRUE_FALSE, clock)
    expect(wrapper.text()).toContain('A = Vrai · B = Faux')
  })

  it('mort subite : marque les éliminés', async () => {
    const wrapper = await startOn(MINI_GAME_SUDDEN_DEATH, clock)
    const session = useRoomGame().session.value
    session?.press(1, correctIndex() as 0)
    session?.press(2, correctIndex() as 0)
    session?.press(3, wrongIndex() as 0)
    clock.advance(DEFAULT_GAME_TIMINGS.revealMs + 1)
    session?.tick()
    await flushPromises()
    expect(wrapper.text()).toContain('Éliminé')
  })

  it('quitte ou double : écran des mises puis mises affichées', async () => {
    const wrapper = await startOn(MINI_GAME_DOUBLE_OR_NOTHING, clock)
    expect(wrapper.text()).toContain('Faites vos jeux !')
    expect(wrapper.text()).toContain('Tapis')

    const session = useRoomGame().session.value
    session?.press(1, 0)
    await flushPromises()
    expect(wrapper.text()).toContain('A misé')

    session?.press(2, 1)
    session?.press(3, 2)
    await flushPromises()
    expect(wrapper.text()).toContain('Passe')
    expect(wrapper.text()).toContain('Mise 200')
  })

  it('quitte ou double : un joueur juste qui avait passé reste dans la révélation', async () => {
    const wrapper = await startOn(MINI_GAME_DOUBLE_OR_NOTHING, clock)
    const session = useRoomGame().session.value
    for (const desk of [1, 2, 3]) {
      session?.press(desk, 0)
    }
    await flushPromises()
    for (const desk of [1, 2, 3]) {
      session?.press(desk, correctIndex() as 0)
    }
    await flushPromises()

    const reveal = wrapper.find('.reveal')
    expect(reveal.text()).not.toContain('Personne')
    expect(reveal.findAll('.reveal__results li')).toHaveLength(3)
  })

  it('vol de points : le voleur choisit sa victime', async () => {
    const wrapper = await startOn(MINI_GAME_POINT_STEAL, clock)
    const session = useRoomGame().session.value
    session?.press(2, correctIndex() as 0)
    session?.press(1, correctIndex() as 0)
    session?.press(3, wrongIndex() as 0)
    await flushPromises()
    expect(wrapper.text()).toContain('Hugo choisit qui voler')
  })

  it.each([MINI_GAME_FIRST_BUZZ, MINI_GAME_PROGRESSIVE_REVEAL])(
    '%s : le joueur qui buzze répond seul',
    async (miniGame) => {
      const wrapper = await startOn(miniGame, clock)
      expect(wrapper.text()).toContain('Buzzez !')

      press(1, 0, clock)
      await flushPromises()
      expect(wrapper.text()).toContain('Léa répond !')
    }
  )
})
