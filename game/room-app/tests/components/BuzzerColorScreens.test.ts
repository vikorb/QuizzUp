import type { EngineParticipant } from '@quizzup/game-engine'

import type { BetView, StealView } from '@/game/miniGameViews'
import { getRoomHardwareConfig, saveBuzzerLayout } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import BetScreen from '@/views/game/BetScreen.vue'
import StealScreen from '@/views/game/StealScreen.vue'
import ThemeChoiceScreen from '@/views/game/ThemeChoiceScreen.vue'

import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const colorsOf = (wrapper: Wrapper, selector: string) =>
  wrapper
    .findAll(selector)
    .map((item) => (item.element as HTMLElement).style.getPropertyValue('--answer-color'))
const ordersOf = (wrapper: Wrapper, selector: string) =>
  wrapper.findAll(selector).map((item) => (item.element as HTMLElement).style.order)

const DEFAULT_COLORS = [
  'var(--buzzer-blue)',
  'var(--buzzer-purple)',
  'var(--buzzer-green)',
  'var(--buzzer-yellow)',
]

const THEMES = ['Un', 'Deux', 'Trois', 'Quatre'].map((name, index) => ({ id: index + 1, name }))
const BET = { mode: 'bet', remainingRatio: 0.8, betIds: [] } as unknown as BetView
const PARTICIPANTS = [1, 2, 3, 4].map((podium) => ({
  id: podium,
  podium,
  displayName: `Joueur ${podium}`,
})) as unknown as EngineParticipant[]
const STEAL = {
  mode: 'steal',
  thiefId: 1,
  targetIds: [2, 3, 4],
  targeting: 'direct',
  highlightedId: null,
  remainingRatio: 0.8,
} as unknown as StealView

beforeEach(async () => {
  localStorage.clear()
  syncRoomAuth()
  enterDemo()
  // Disposition personnalisée : A rouge en bas à droite, D prend le haut à gauche.
  const { layout } = getRoomHardwareConfig().buzzers
  await saveBuzzerLayout({
    A: { color: 'red', corner: 'br' },
    B: { ...layout.B, color: 'white' },
    C: layout.C,
    D: { ...layout.D, corner: 'tl' },
  })
})

describe('écrans de mini-jeu : couleurs des buzzers de la salle', () => {
  it('pari : une couleur par option, sans changer l’ordre des options', async () => {
    const { wrapper } = await mountWithApp(BetScreen, {
      props: { view: BET, playersCount: 4 },
    })
    expect(colorsOf(wrapper, '.bet__option')).toEqual([
      'var(--buzzer-red)',
      'var(--buzzer-white)',
      'var(--buzzer-green)',
      'var(--buzzer-yellow)',
    ])
    // Rangée unique de quatre options : pas de réordonnancement par coin.
    expect(ordersOf(wrapper, '.bet__option')).toEqual(['', '', '', ''])
  })

  it('choix du thème : couleur et place suivent la disposition', async () => {
    const { wrapper } = await mountWithApp(ThemeChoiceScreen, {
      props: { themes: THEMES, chooser: undefined, reason: null, remainingRatio: 0.5 },
    })
    expect(colorsOf(wrapper, '.choice__theme')).toEqual([
      'var(--buzzer-red)',
      'var(--buzzer-white)',
      'var(--buzzer-green)',
      'var(--buzzer-yellow)',
    ])
    // A en bas à droite (3), B en haut à droite (1), C en bas à gauche (2), D en haut à gauche (0).
    expect(ordersOf(wrapper, '.choice__theme')).toEqual(['3', '1', '2', '0'])
  })

  it('vol de points : la couleur de chaque cible suit son buzzer', async () => {
    const { wrapper } = await mountWithApp(StealScreen, {
      props: { view: STEAL, participants: PARTICIPANTS },
    })
    expect(colorsOf(wrapper, '.steal__target')).toEqual([
      'var(--buzzer-red)',
      'var(--buzzer-white)',
      'var(--buzzer-green)',
      'var(--buzzer-yellow)',
    ])
  })

  it('vol de points en défilement : pas de lettre, donc pas de couleur de buzzer', async () => {
    const { wrapper } = await mountWithApp(StealScreen, {
      props: {
        view: { ...STEAL, targeting: 'scroll', highlightedId: 2 } as StealView,
        participants: PARTICIPANTS,
      },
    })
    expect(colorsOf(wrapper, '.steal__target')).toEqual(['', '', '', ''])
  })

  it('garde les couleurs d’origine avec la disposition par défaut', async () => {
    await saveBuzzerLayout({
      A: { color: 'blue', corner: 'tl' },
      B: { color: 'purple', corner: 'tr' },
      C: { color: 'green', corner: 'bl' },
      D: { color: 'yellow', corner: 'br' },
    })
    const { wrapper } = await mountWithApp(BetScreen, {
      props: { view: BET, playersCount: 4 },
    })
    expect(colorsOf(wrapper, '.bet__option')).toEqual(DEFAULT_COLORS)
  })
})
