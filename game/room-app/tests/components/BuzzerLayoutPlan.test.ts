import { flushPromises } from '@vue/test-utils'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import RoomPlan from '@/components/hardware/RoomPlan.vue'
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

  it('une couleur déjà prise passe à l’autre buzzer, sans doublon', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'start-config')
    // A est bleu, C est vert : A prend le vert, C reprend le bleu.
    await click(wrapper, 'color-A-green')
    expect(sel(wrapper, 'color-A-green').attributes('aria-pressed')).toBe('true')
    expect(sel(wrapper, 'color-C-blue').attributes('aria-pressed')).toBe('true')
    expect(sel(wrapper, 'color-C-green').attributes('aria-pressed')).toBe('false')
    await click(wrapper, 'layout-continue')

    const { layout } = getRoomHardwareConfig().buzzers
    expect(layout.A.color).toBe('green')
    expect(layout.C.color).toBe('blue')
    expect(new Set(Object.values(layout).map((style) => style.color)).size).toBe(4)
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

/** jsdom n'a pas PointerEvent : un MouseEvent nommé comme l'évènement pointeur suffit. */
function pointer(
  target: Element,
  type: string,
  init: { clientX?: number; clientY?: number; button?: number; pointerId?: number } = {}
) {
  const event = new MouseEvent(type, { bubbles: true, button: init.button ?? 0, ...init })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 })
  target.dispatchEvent(event)
}

/** Plan de 400 x 200 px en (100, 50) ; la marge intérieure de 5 % en réduit la zone utile. */
function sizeFloor(wrapper: Wrapper) {
  sel(wrapper, 'room-plan').element.getBoundingClientRect = () =>
    ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }) as DOMRect
}

const percent = (element: Element) => (name: 'left' | 'top') =>
  Number.parseFloat((element as HTMLElement).style[name])

async function openPlan() {
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await click(wrapper, 'tab-plan')
  return wrapper
}

async function openPerspective() {
  const wrapper = await openPlan()
  sizeFloor(wrapper)
  await click(wrapper, 'plan-view-perspective')
  return wrapper
}

describe('plan de salle', () => {
  it('place les pupitres en rangée et déplace un élément aux flèches', async () => {
    await saveRoomHardwareConfig({
      desksCount: 2,
      lighting: { fixtures: [{ id: 'par', name: 'PAR fond', profileId: 'par-rgb', address: 1 }] },
    })
    const wrapper = await openPlan()

    expect(sel(wrapper, 'room-plan').exists()).toBe(true)
    expect(sel(wrapper, 'plan-screen').exists()).toBe(true)
    expect(sel(wrapper, 'plan-desk-3').exists()).toBe(false)
    expect(sel(wrapper, 'plan-fixture-par').text()).toContain('PAR fond')
    const desk = sel(wrapper, 'plan-desk-1')
    expect(desk.attributes('tabindex')).toBe('0')
    expect(desk.attributes('aria-label')).toContain('Pupitre 1')
    expect(desk.attributes('aria-roledescription')).toBe('élément déplaçable')
    // Le carré de buzzers du pupitre.
    expect(desk.findAll('.square__cell')).toHaveLength(4)

    expect(getRoomHardwareConfig().plan.desks[1]).toBeUndefined()
    await desk.trigger('keydown', { key: 'ArrowRight' })
    await desk.trigger('keyup', { key: 'ArrowRight' })
    await flushPromises()
    // Défaut : un tiers de la largeur pour 2 pupitres, plus un pas de 2 %.
    expect(getRoomHardwareConfig().plan.desks[1]?.x).toBeCloseTo(1 / 3 + 0.02)

    await sel(wrapper, 'plan-desk-1').trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await sel(wrapper, 'plan-desk-1').trigger('keyup', { key: 'ArrowDown' })
    await flushPromises()
    const moved = getRoomHardwareConfig().plan.desks[1]
    expect(moved?.y).toBeCloseTo(0.72 + 0.1)
    expect(sel(wrapper, 'plan-desk-1').attributes('aria-label')).toContain(
      `${Math.round((moved?.y ?? 0) * 100)} %`
    )
    // Le déplacement est annoncé aux lecteurs d'écran.
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('Pupitre 1 déplacé')
  })

  it('reste dans les bornes du plan', async () => {
    const wrapper = await openPlan()
    for (let press = 0; press < 3; press += 1) {
      await sel(wrapper, 'plan-screen').trigger('keydown', { key: 'ArrowUp', shiftKey: true })
      await sel(wrapper, 'plan-screen').trigger('keyup', { key: 'ArrowUp' })
      await flushPromises()
    }
    expect(getRoomHardwareConfig().plan.screen.y).toBe(0)
    // La marge intérieure garde l'élément entièrement visible au bord.
    expect(percent(sel(wrapper, 'plan-screen').element)('top')).toBeCloseTo(5)
  })

  it('touche maintenue : l’aperçu suit, un seul enregistrement au relâchement', async () => {
    const wrapper = await openPlan()
    const desk = sel(wrapper, 'plan-desk-1')
    const moves = () => wrapper.findComponent(RoomPlan).emitted('move') ?? []

    for (let repeat = 0; repeat < 5; repeat += 1) {
      await desk.trigger('keydown', { key: 'ArrowRight', repeat: repeat > 0 })
    }
    // Rien d'enregistré pendant la rafale, mais l'élément a déjà bougé à l'écran.
    expect(getRoomHardwareConfig().plan.desks[1]).toBeUndefined()
    expect(moves()).toHaveLength(0)
    const shown = percent(desk.element)('left')
    await desk.trigger('keyup', { key: 'ArrowRight' })
    await flushPromises()

    expect(getRoomHardwareConfig().plan.desks[1]?.x).toBeCloseTo(0.2 + 5 * 0.02)
    expect(percent(sel(wrapper, 'plan-desk-1').element)('left')).toBeCloseTo(shown)
    expect(moves()).toHaveLength(1)
  })

  it('touche maintenue sans relâchement : enregistre après une courte pause', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = await openPlan()
      await sel(wrapper, 'plan-desk-1').trigger('keydown', { key: 'ArrowLeft' })
      expect(getRoomHardwareConfig().plan.desks[1]).toBeUndefined()
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(getRoomHardwareConfig().plan.desks[1]?.x).toBeCloseTo(0.2 - 0.02)
    } finally {
      vi.useRealTimers()
    }
  })

  it('enregistre l’aperçu en attente quand le plan est quitté', async () => {
    const wrapper = await openPlan()
    await sel(wrapper, 'plan-desk-1').trigger('keydown', { key: 'ArrowDown' })
    expect(getRoomHardwareConfig().plan.desks[1]).toBeUndefined()
    wrapper.unmount()
    await flushPromises()
    expect(getRoomHardwareConfig().plan.desks[1]?.y).toBeCloseTo(0.72 + 0.02)
  })

  it('déplace à la souris : position enregistrée au relâchement', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)

    const screen = sel(wrapper, 'plan-screen').element
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70 })
    pointer(screen, 'pointermove', { clientX: 200, clientY: 150 })
    await flushPromises()
    // Pendant le glisser, rien n'est encore enregistré, mais le plan suit déjà la souris.
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
    // Le curseur est à 25 % de la salle : l'élément y est, la position enregistrée tient compte
    // de la marge ((0,25 - 0,05) / 0,9).
    expect(percent(screen)('left')).toBeCloseTo(25)
    pointer(screen, 'pointerup', { clientX: 200, clientY: 150 })
    await flushPromises()

    expect(getRoomHardwareConfig().plan.screen.x).toBeCloseTo(0.2 / 0.9)
    expect(getRoomHardwareConfig().plan.screen.y).toBeCloseTo(0.5)
  })

  it('ramène un lâcher en bordure dans [0,1], marge comprise', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)
    const screen = sel(wrapper, 'plan-screen').element
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70 })
    pointer(screen, 'pointermove', { clientX: 5000, clientY: -300 })
    pointer(screen, 'pointerup', { clientX: 5000, clientY: -300 })
    await flushPromises()
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 1, y: 0 })
  })

  it('un simple clic ne déplace rien et n’enregistre rien', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)
    const desk = sel(wrapper, 'plan-desk-1').element
    pointer(desk, 'pointerdown', { clientX: 200, clientY: 100 })
    // Un tremblement sous le seuil reste un clic.
    pointer(desk, 'pointermove', { clientX: 201, clientY: 101 })
    pointer(desk, 'pointerup', { clientX: 201, clientY: 101 })
    await flushPromises()
    expect(wrapper.findComponent(RoomPlan).emitted('move')).toBeUndefined()
    expect(getRoomHardwareConfig().plan.desks[1]).toBeUndefined()
  })

  it('ignore un bouton autre que le principal', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)
    const screen = sel(wrapper, 'plan-screen').element
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70, button: 2 })
    pointer(screen, 'pointermove', { clientX: 200, clientY: 150 })
    pointer(screen, 'pointerup', { clientX: 200, clientY: 150 })
    await flushPromises()
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
  })

  it('ignore un second pointeur pendant un glisser', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)
    const screen = sel(wrapper, 'plan-screen').element
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70, pointerId: 1 })
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70, pointerId: 2 })
    pointer(screen, 'pointermove', { clientX: 100, clientY: 250, pointerId: 2 })
    pointer(screen, 'pointermove', { clientX: 200, clientY: 150, pointerId: 1 })
    // Le relâchement de l'autre doigt ne termine pas le glisser du premier.
    pointer(screen, 'pointerup', { clientX: 100, clientY: 250, pointerId: 2 })
    await flushPromises()
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
    pointer(screen, 'pointerup', { clientX: 200, clientY: 150, pointerId: 1 })
    await flushPromises()
    expect(getRoomHardwareConfig().plan.screen.x).toBeCloseTo(0.2 / 0.9)
    expect(getRoomHardwareConfig().plan.screen.y).toBeCloseTo(0.5)
  })

  it('annule le glisser quand la capture du pointeur est perdue', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)
    const screen = sel(wrapper, 'plan-screen').element
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70 })
    pointer(screen, 'pointermove', { clientX: 200, clientY: 150 })
    await flushPromises()
    expect(percent(screen)('left')).toBeCloseTo(25)
    pointer(screen, 'lostpointercapture')
    await flushPromises()
    // Retour à la position enregistrée (50 % de la salle), rien d'écrit.
    expect(percent(screen)('left')).toBeCloseTo(50)
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
    pointer(screen, 'pointerup', { clientX: 200, clientY: 150 })
    await flushPromises()
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
  })

  it('annule le glisser sur pointercancel', async () => {
    const wrapper = await openPlan()
    sizeFloor(wrapper)
    const screen = sel(wrapper, 'plan-screen').element
    pointer(screen, 'pointerdown', { clientX: 300, clientY: 70 })
    pointer(screen, 'pointermove', { clientX: 200, clientY: 150 })
    pointer(screen, 'pointercancel')
    pointer(screen, 'pointerup', { clientX: 200, clientY: 150 })
    await flushPromises()
    expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
  })

  it('range les appareils rattachés au-dessus de leur pupitre, noms courts en infobulle', async () => {
    await saveRoomHardwareConfig({
      desksCount: 6,
      lighting: {
        fixtures: [
          {
            id: 'par1',
            name: 'Projecteur très long du pupitre 1',
            profileId: 'par-rgb',
            address: 1,
            desk: 1,
          },
          { id: 'fond', name: 'Fond', profileId: 'par-rgb', address: 10 },
        ],
      },
    })
    const wrapper = await openPlan()
    const desk = percent(sel(wrapper, 'plan-desk-1').element)
    const linked = sel(wrapper, 'plan-fixture-par1')
    expect(percent(linked.element)('top')).toBeLessThan(desk('top'))
    expect(percent(linked.element)('left')).toBeCloseTo(desk('left'))
    // Rangée du haut pour l'appareil libre, au-dessus de la rangée des pupitres.
    expect(percent(sel(wrapper, 'plan-fixture-fond').element)('top')).toBeLessThan(desk('top'))
    expect(linked.attributes('title')).toBe('Projecteur très long du pupitre 1')
    expect(linked.attributes('aria-label')).toContain('Projecteur très long du pupitre 1')
  })

  describe('vue en perspective', () => {
    it('bascule en perspective, vue de dessus par défaut, et mémorise le choix', async () => {
      const wrapper = await openPlan()
      expect(sel(wrapper, 'plan-view-top').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.plan-wrap--perspective').exists()).toBe(false)
      await click(wrapper, 'plan-view-perspective')
      expect(sel(wrapper, 'plan-view-perspective').attributes('aria-pressed')).toBe('true')
      expect(sel(wrapper, 'plan-view-top').attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('.plan-wrap--perspective').exists()).toBe(true)
      expect(sel(wrapper, 'plan-perspective-help').exists()).toBe(true)
      expect(localStorage.getItem('quizzup.roomPlanView')).toBe('perspective')
    })

    it('ne déplace pas à la souris en perspective', async () => {
      const wrapper = await openPerspective()
      const screen = sel(wrapper, 'plan-screen').element
      pointer(screen, 'pointerdown', { clientX: 300, clientY: 70 })
      pointer(screen, 'pointermove', { clientX: 200, clientY: 150 })
      pointer(screen, 'pointerup', { clientX: 200, clientY: 150 })
      await flushPromises()
      expect(wrapper.findComponent(RoomPlan).emitted('move')).toBeUndefined()
      expect(getRoomHardwareConfig().plan.screen).toEqual({ x: 0.5, y: 0.08 })
    })

    it('déplace encore aux flèches en perspective', async () => {
      await saveRoomHardwareConfig({ desksCount: 2 })
      const wrapper = await openPerspective()
      await sel(wrapper, 'plan-desk-1').trigger('keydown', { key: 'ArrowRight' })
      await sel(wrapper, 'plan-desk-1').trigger('keyup', { key: 'ArrowRight' })
      await flushPromises()
      expect(wrapper.findComponent(RoomPlan).emitted('move')).toHaveLength(1)
      expect(getRoomHardwareConfig().plan.desks[1]?.x).toBeCloseTo(1 / 3 + 0.02)
    })
  })

  it('apparaît dans l’assistant, juste après les appareils', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-assistant')
    expect(wrapper.find('.steps').text()).toMatch(/Appareils\s*Plan\s*Fin/)
  })
})
