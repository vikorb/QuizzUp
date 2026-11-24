import { DEFAULT_GAME_TIMINGS, getMiniGameQuestion } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST, QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'

import { getDemoThemes } from '@/game/demoContent'
import { setMediaCredits } from '@/game/mediaCredits'
import type { RevealView } from '@/game/selectors'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame, useRoomGame } from '@/game/useRoomGame'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import RevealScreen from '@/views/game/RevealScreen.vue'
import GameView from '@/views/GameView.vue'

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
import { pressKey } from '../_helpers/keyboard'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

const COVER = 'https://cdn-images.dzcdn.net/images/cover/abc/500x500.jpg'
const CREDIT = {
  provider: 'deezer',
  title: 'Titre du morceau',
  artist: 'Nom de l’artiste',
  coverUrl: COVER,
  link: 'https://www.deezer.com/track/12',
}

/** Révélation minimale d'une question de blind test. */
function revealView(questionId: number): RevealView {
  return {
    miniGame: MINI_GAME_FLASH_BLIND_TEST,
    question: {
      id: questionId,
      text: 'Q',
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: 'https://cdnt-preview.dzcdn.net/x.mp3',
      mediaStartMs: 0,
      answers: [{ id: 1, text: 'Réponse', isCorrect: true }],
    },
    correctAnswerIds: [1],
    winnerId: null,
    points: 0,
    stage: null,
    results: [],
  }
}

async function mountReveal(questionId = 7) {
  const { wrapper } = await mountWithApp(RevealScreen, {
    props: { view: revealView(questionId), winner: undefined },
  })
  return wrapper
}

describe('crédit d’un extrait à la révélation', () => {
  afterEach(() => setMediaCredits([]))

  it('affiche pochette décorative, « artiste — titre » et la mention du fournisseur', async () => {
    setMediaCredits([{ questions: [{ id: 7, mediaCredit: CREDIT }] }])
    const wrapper = await mountReveal()

    const cover = wrapper.find('.reveal__cover')
    expect(cover.attributes('src')).toBe(COVER)
    expect(cover.attributes('alt')).toBe('')
    expect(wrapper.find('.reveal__credit-track').text()).toBe('Nom de l’artiste — Titre du morceau')
    expect(wrapper.find('.reveal__credit-source').text()).toBe('Extrait fourni par Deezer')
    // Le lien n'est pas cliquable sur l'écran de salle.
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(CREDIT.link)
  })

  it('n’affiche rien pour une question sans crédit', async () => {
    setMediaCredits([{ questions: [{ id: 7, mediaCredit: CREDIT }] }])
    const wrapper = await mountReveal(8)

    expect(wrapper.find('.reveal__credit').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Deezer')
  })

  it('tolère l’absence de pochette', async () => {
    setMediaCredits([{ questions: [{ id: 7, mediaCredit: { ...CREDIT, coverUrl: null } }] }])
    const wrapper = await mountReveal()

    expect(wrapper.find('.reveal__cover').exists()).toBe(false)
    expect(wrapper.find('.reveal__credit-track').text()).toContain('Titre du morceau')
  })

  it('masque une pochette qui ne charge pas, sans retirer le texte', async () => {
    setMediaCredits([{ questions: [{ id: 7, mediaCredit: CREDIT }] }])
    const wrapper = await mountReveal()

    await wrapper.find('.reveal__cover').trigger('error')

    expect(wrapper.find('.reveal__cover').exists()).toBe(false)
    expect(wrapper.find('.reveal__credit-source').exists()).toBe(true)
  })
})

describe('crédit pendant une partie', () => {
  const KEY_BY_DESK = { 1: 'Digit1', 2: 'KeyQ', 3: 'KeyA', 4: 'KeyZ' } as const
  let clock: ReturnType<typeof createManualClock>

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    clock = createManualClock()
    configureRoomGame({ storage: createMemorySessionStorage(), now: clock.now })
  })

  afterEach(() => closeGame())

  it('ne paraît qu’une fois la réponse révélée', async () => {
    const themes = getDemoThemes().map((theme) => ({
      ...theme,
      questions: theme.questions.map((question) => ({ ...question, mediaCredit: CREDIT })),
    }))
    startNewGame({
      registrations: REGISTRATIONS,
      themes,
      seed: 11,
      miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    })
    const { state } = useRoomGame()
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })

    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(wrapper.text()).toContain('choisit le thème'))
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressKey(KEY_BY_DESK[chooser])
    await flushPromises()
    expect(wrapper.text()).toContain('Écoute…')
    expect(wrapper.text()).not.toContain(CREDIT.title)

    pressKey('Digit1')
    await flushPromises()
    expect(wrapper.text()).toContain('répond')
    expect(wrapper.text()).not.toContain(CREDIT.title)
    expect(wrapper.text()).not.toContain('Deezer')

    const phase = state.value?.phase
    const answers =
      phase?.name === 'question' ? getMiniGameQuestion(phase.miniGameState).answers : []
    pressKey(
      ['Digit1', 'Digit2', 'Digit3', 'Digit4'][answers.findIndex((answer) => answer.isCorrect)] ??
        ''
    )
    await flushPromises()

    expect(wrapper.text()).toContain('trouve au palier 1')
    expect(wrapper.find('.reveal__credit-track').text()).toBe('Nom de l’artiste — Titre du morceau')
    wrapper.unmount()
  })
})
