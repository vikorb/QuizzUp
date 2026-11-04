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
import type { Registration } from '@/game/registrations'
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

import { createManualClock, REGISTRATIONS, SIX_REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp } from '../_helpers/mount'

type Clock = ReturnType<typeof createManualClock>

function press(desk: number, buttonIndex: number, clock: Clock): void {
  pressBuzzer({ desk, buttonIndex, at: clock.value } as never)
}

async function startOn(
  miniGame: MiniGame,
  clock: Clock,
  registrations: Registration[] = REGISTRATIONS
) {
  startNewGame({
    registrations,
    themes: getDemoThemes(),
    seed: 5,
    miniGames: [miniGame],
  })
  const { wrapper } = await mountWithApp(GameView, { route: '/play' })
  clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
  useRoomGame().session.value?.tick()
  const round = useRoomGame().state.value?.rounds.at(-1)
  const chooser = registrations.findIndex(
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

  it('vol de points : à 3 joueurs, une lettre par pupitre et pas de défilement', async () => {
    const wrapper = await startOn(MINI_GAME_POINT_STEAL, clock)
    const session = useRoomGame().session.value
    session?.press(2, correctIndex() as 0)
    session?.press(1, correctIndex() as 0)
    session?.press(3, correctIndex() as 0)
    await flushPromises()

    expect(wrapper.find('.steal__letter').exists()).toBe(true)
    expect(wrapper.findAll('.steal__letter').map((letter) => letter.text())).toEqual([
      'A',
      'B',
      'C',
    ])
    expect(wrapper.find('[data-test="steal-keys"]').exists()).toBe(false)
    expect(wrapper.find('.steal__target--picked').exists()).toBe(false)
    expect(wrapper.text()).toContain('Appuie sur la lettre du pupitre visé')
  })

  it('vol de points à 6 joueurs : la cible en surbrillance suit A et B', async () => {
    const wrapper = await startOn(MINI_GAME_POINT_STEAL, clock, SIX_REGISTRATIONS)
    const session = useRoomGame().session.value
    session?.press(5, correctIndex() as 0)
    session?.press(2, correctIndex() as 0)
    session?.press(6, correctIndex() as 0)
    for (const desk of [1, 3, 4]) {
      session?.press(desk, wrongIndex() as 0)
    }
    await flushPromises()

    expect(wrapper.text()).toContain('Joueur 5 choisit qui voler')
    expect(wrapper.findAll('.steal__target')).toHaveLength(6)
    // Plus de lettres (A à D ne suffisent plus), mais la consigne de défilement.
    expect(wrapper.find('.steal__letter').exists()).toBe(false)
    expect(wrapper.find('[data-test="steal-keys"]').text()).toContain('A précédent')
    expect(wrapper.find('[data-test="steal-keys"]').text()).toContain('B suivant')
    expect(wrapper.find('[data-test="steal-keys"]').text()).toContain('C ou D valide')
    expect(wrapper.text()).toContain('A : cible précédente')

    const picked = () =>
      wrapper.findAll('.steal__target--picked').map((item) => item.attributes('data-test'))
    expect(picked()).toEqual(['steal-target-2'])

    session?.press(5, 1)
    await flushPromises()
    expect(picked()).toEqual(['steal-target-6'])

    session?.press(5, 0)
    session?.press(5, 0)
    await flushPromises()
    expect(picked()).toEqual(['steal-target-6'])
    // Les pupitres sans points ne sont pas des cibles : ils restent atténués.
    expect(wrapper.find('[data-test="steal-target-3"]').classes()).toContain('steal__target--off')
    expect(wrapper.find('[data-test="steal-target-6"]').classes()).not.toContain(
      'steal__target--off'
    )
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
