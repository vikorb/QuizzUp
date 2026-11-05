import { flushPromises } from '@vue/test-utils'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import {
  getRoomHardwareConfig,
  saveBuzzerLayout,
  saveRoomHardwareConfig,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { pressKey } from '../_helpers/keyboard'
import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

const ANSWERS = ['Un', 'Deux', 'Trois', 'Quatre'].map((text, index) => ({
  id: index + 1,
  text,
  isCorrect: index === 0,
}))

const orderOf = (wrapper: Wrapper) =>
  wrapper.findAll('li').map((item) => (item.element as HTMLElement).style.order)
const colorOf = (wrapper: Wrapper) =>
  wrapper
    .findAll('li')
    .map((item) => (item.element as HTMLElement).style.getPropertyValue('--answer-color'))

beforeEach(() => {
  localStorage.clear()
  syncRoomAuth()
  enterDemo()
})

describe('couleurs et disposition des buzzers', () => {
  it('fait choisir les couleurs avant l’apprentissage, puis parle en couleurs', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await click(wrapper, 'start-config')
    expect(sel(wrapper, 'layout-picker').exists()).toBe(true)
    expect(sel(wrapper, 'learning').exists()).toBe(false)

    await click(wrapper, 'color-A-red')
    expect(sel(wrapper, 'color-A-red').attributes('aria-pressed')).toBe('true')
    // A passe en bas à droite : D prend sa place en haut à gauche, sans doublon.
    await click(wrapper, 'corner-A-br')
    expect(sel(wrapper, 'corner-D-tl').attributes('aria-pressed')).toBe('true')
    await click(wrapper, 'layout-continue')

    expect(getRoomHardwareConfig().buzzers.layout.A).toEqual({ color: 'red', corner: 'br' })
    expect(getRoomHardwareConfig().buzzers.layout.D.corner).toBe('tl')
    const prompt = sel(wrapper, 'learn-prompt')
    expect(prompt.text()).toBe('Appuie sur le buzzer rouge (A) du pupitre 1')
    expect(prompt.find('strong').text()).toBe('rouge')
    // Le carré du pupitre met le buzzer demandé en avant.
    expect(sel(wrapper, 'learning').find('.square__cell--on').text()).toBe('A')

    pressKey('KeyB')
    await flushPromises()
    expect(sel(wrapper, 'learn-prompt').text()).toBe('Appuie sur le buzzer violet (B) du pupitre 1')
  })

  it('annule le choix des couleurs sans rien changer', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'start-config')
    await click(wrapper, 'color-B-white')
    const cancel = wrapper
      .find('[data-test="layout-step"]')
      .findAll('button')
      .find((button) => button.text() === 'Annuler')!
    await cancel.trigger('click')

    expect(sel(wrapper, 'layout-picker').exists()).toBe(false)
    expect(getRoomHardwareConfig().buzzers.layout.B.color).toBe('purple')
  })

  it('l’étape Buzzers de l’assistant a aussi le gros bouton', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-assistant')
    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-buzzers').exists()).toBe(true)
    expect(sel(wrapper, 'start-config').text()).toBe('Lancer la configuration des buzzers')
  })
})

describe('AnswerGrid : disposition de la salle', () => {
  it('garde la grille A B / C D et les couleurs d’origine par défaut', async () => {
    const { wrapper } = await mountWithApp(AnswerGrid, { props: { answers: ANSWERS } })
    expect(orderOf(wrapper)).toEqual(['0', '1', '2', '3'])
    expect(colorOf(wrapper)).toEqual([
      'var(--buzzer-blue)',
      'var(--buzzer-purple)',
      'var(--buzzer-green)',
      'var(--buzzer-yellow)',
    ])
  })

  it('suit la couleur et la place configurées', async () => {
    const { layout } = getRoomHardwareConfig().buzzers
    await saveBuzzerLayout({
      A: { color: 'red', corner: 'br' },
      B: { ...layout.B, corner: 'bl' },
      C: { ...layout.C, corner: 'tr' },
      D: { ...layout.D, corner: 'tl' },
    })
    const { wrapper } = await mountWithApp(AnswerGrid, { props: { answers: ANSWERS } })

    expect(orderOf(wrapper)).toEqual(['3', '2', '1', '0'])
    expect(colorOf(wrapper)[0]).toBe('var(--buzzer-red)')
    // L'ordre du DOM (lecteur d'écran) reste A, B, C, D.
    expect(wrapper.findAll('.answer__letter').map((item) => item.text())).toEqual([
      'A',
      'B',
      'C',
      'D',
    ])
  })
})

describe('plan de salle', () => {
  it('place les pupitres en rangée et déplace un élément aux flèches', async () => {
    await saveRoomHardwareConfig({
      desksCount: 2,
      lighting: { fixtures: [{ id: 'par', name: 'PAR fond', profileId: 'par-rgb', address: 1 }] },
    })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-plan')

    expect(sel(wrapper, 'room-plan').exists()).toBe(true)
    expect(sel(wrapper, 'plan-screen').exists()).toBe(true)
    expect(sel(wrapper, 'plan-desk-3').exists()).toBe(false)
    expect(sel(wrapper, 'plan-fixture-par').text()).toContain('PAR fond')
    const desk = sel(wrapper, 'plan-desk-1')
    expect(desk.attributes('tabindex')).toBe('0')
    expect(desk.attributes('aria-label')).toContain('Pupitre 1')
    // Le carré de buzzers du pupitre.
    expect(desk.findAll('.square__cell')).toHaveLength(4)

    const before = getRoomHardwareConfig().plan.desks[1]
    expect(before).toBeUndefined()
    await desk.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    // Défaut : un tiers de la largeur pour 2 pupitres, plus un pas de 2 %.
    expect(getRoomHardwareConfig().plan.desks[1]?.x).toBeCloseTo(1 / 3 + 0.02)

    await sel(wrapper, 'plan-desk-1').trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await flushPromises()
    const moved = getRoomHardwareConfig().plan.desks[1]
    expect(moved?.y).toBeCloseTo(0.72 + 0.1)
    expect(sel(wrapper, 'plan-desk-1').attributes('aria-label')).toContain(
      `${Math.round((moved?.y ?? 0) * 100)} %`
    )
  })

  it('reste dans les bornes du plan', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-plan')
    for (let press = 0; press < 3; press += 1) {
      await sel(wrapper, 'plan-screen').trigger('keydown', { key: 'ArrowUp', shiftKey: true })
      await flushPromises()
    }
    expect(getRoomHardwareConfig().plan.screen.y).toBe(0)
  })

  it('déplace à la souris : position enregistrée au relâchement', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-plan')
    const floor = sel(wrapper, 'room-plan').element
    floor.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }) as DOMRect

    const screen = sel(wrapper, 'plan-screen').element as HTMLElement
    // jsdom n'a pas PointerEvent : un MouseEvent nommé comme l'évènement pointeur suffit.
    const fire = (type: string, clientX: number, clientY: number) =>
      screen.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }))
    fire('pointerdown', 300, 70)
    fire('pointermove', 200, 150)
    await flushPromises()
    // Pendant le glisser, rien n'est encore enregistré, mais le plan suit déjà la souris.
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
    expect(screen.style.left).toBe('25%')
    fire('pointerup', 200, 150)
    await flushPromises()

    expect(getRoomHardwareConfig().plan.screen.x).toBeCloseTo(0.25)
    expect(getRoomHardwareConfig().plan.screen.y).toBeCloseTo(0.5)
  })

  it('apparaît dans l’assistant, juste après les appareils', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-assistant')
    expect(wrapper.find('.steps').text()).toMatch(/Appareils\s*Plan\s*Fin/)
  })
})
