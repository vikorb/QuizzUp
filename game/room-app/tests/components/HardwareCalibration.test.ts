import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import { getLighting, saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

/** Touche physique enfoncée puis relâchée, avec modificateurs éventuels, sur `target`. */
async function press(code: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }))
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, ...init }))
  await flushPromises()
}

/** 16 buzzers (pupitres 1 à 4) sur des touches qui n'entrent pas en conflit avec G, H et P. */
function learnedKeymap() {
  const map: Record<string, { desk: 1 | 2 | 3 | 4; button: 'A' | 'B' | 'C' | 'D' }> = {}
  for (const [index, letter] of [...'ABCDEFIJKLMNOQRS'].entries()) {
    map[`Key${letter}`] = {
      desk: (Math.floor(index / 4) + 1) as 1 | 2 | 3 | 4,
      button: 'ABCD'[index % 4] as 'A' | 'B' | 'C' | 'D',
    }
  }
  return map
}

/** Monte l'assistant et l'amène à l'étape des lyres, avec une seule lyre libre (4 pupitres). */
async function atPositions(map: ReturnType<typeof learnedKeymap> = learnedKeymap()) {
  await saveRoomHardwareConfig({
    buzzers: { keymap: map },
    lighting: {
      driver: 'simulation',
      fixtures: [{ id: 'lyre', name: 'Lyre', profileId: 'moving-head-8', address: 1 }],
    },
  })
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await click(wrapper, 'tab-assistant')
  // Navigateur, buzzers, interface, appareils, plan : pas de saisie à faire.
  for (let step = 0; step < 5; step += 1) {
    await click(wrapper, 'assistant-next')
  }
  expect(sel(wrapper, 'step-test').exists()).toBe(true)
  await click(wrapper, 'ok-lyre')
  await click(wrapper, 'assistant-next')
  expect(sel(wrapper, 'step-positions').exists()).toBe(true)
  await vi.waitFor(() => expect(getLighting()?.diagnostics.getState().active).toBe(true))
  return wrapper
}

const values = (wrapper: Wrapper) => ({
  pan: sel(wrapper, 'calibration-pan').text(),
  tilt: sel(wrapper, 'calibration-tilt').text(),
})
/** Nombre de pupitres dont la position est enregistrée (coche ✓). */
const marked = (wrapper: Wrapper) => wrapper.findAll('.head__desk .hw-ok').length
const fixture = () => useRoomHardware().hardware.value.config.lighting.fixtures[0]!

describe('étape Lyres : calage au clavier', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('affiche l’aide des raccourcis, les valeurs et donne le focus au panneau', async () => {
    const wrapper = await atPositions()

    const help = sel(wrapper, 'calibration-help').text()
    for (const text of [
      'Maj',
      'Entrée',
      'copier',
      'inverser gauche / droite',
      'inverser haut / bas',
    ]) {
      expect(help).toContain(text)
    }
    expect(sel(wrapper, 'calibration-current').text()).toContain('Lyre : pupitre 1 (1 sur 4)')
    expect(values(wrapper)).toEqual({
      pan: 'Gauche / droite : 32768',
      tilt: 'Haut / bas : 32768',
    })
    expect(document.activeElement).toBe(sel(wrapper, 'calibration').element)
  })

  it('les flèches déplacent pan et tilt, Maj + flèche d’un pas fin, et la lyre suit', async () => {
    const wrapper = await atPositions()

    await press('ArrowRight')
    await press('ArrowDown')
    expect(values(wrapper)).toEqual({
      pan: 'Gauche / droite : 33792',
      tilt: 'Haut / bas : 31744',
    })
    await vi.waitFor(() => {
      expect(Array.from(getLighting()?.getFrame().slice(0, 4) ?? [])).toEqual([132, 0, 124, 0])
    })

    await press('ArrowLeft', { shiftKey: true })
    await press('ArrowUp', { shiftKey: true })
    expect(values(wrapper)).toEqual({
      pan: 'Gauche / droite : 33728',
      tilt: 'Haut / bas : 31808',
    })
    // Les curseurs suivent aussi.
    expect(sel(wrapper, 'pan-lyre-1').element).toHaveProperty('value', '33728')
  })

  it('Entrée valide la position et passe au pupitre suivant, jusqu’au dernier', async () => {
    const wrapper = await atPositions()

    await press('ArrowRight')
    await press('Enter')
    expect(sel(wrapper, 'pan-lyre-1').element).toHaveProperty('value', '33792')
    expect(marked(wrapper)).toBe(1)
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 2 (2 sur 4)')

    await press('Enter')
    await press('Enter')
    await press('Enter')
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 4 (4 sur 4)')
    expect(sel(wrapper, 'calibration-note').text()).toContain('Dernière position validée')
    // Pupitres 2 à 4 validés sans réglage : le centre est enregistré, l'étape est complète.
    expect(marked(wrapper)).toBe(4)
    expect(sel(wrapper, 'assistant-next').attributes('disabled')).toBeUndefined()
    // Le focus passe au bouton « Suivant ».
    expect(document.activeElement).toBe(sel(wrapper, 'assistant-next').element)
  })

  it('P copie le pupitre précédent, G et H inversent pan et tilt sans bouger le faisceau', async () => {
    const wrapper = await atPositions()

    await press('KeyP')
    expect(sel(wrapper, 'calibration-note').text()).toContain('Pas de pupitre précédent')

    await press('ArrowRight')
    await press('Enter')
    await press('KeyP')
    expect(sel(wrapper, 'calibration-note').text()).toContain('Position du pupitre 1 copiée')
    expect(values(wrapper).pan).toBe('Gauche / droite : 33792')

    await press('KeyG')
    await vi.waitFor(() => expect(fixture().invertPan).toBe(true))
    expect(fixture().invertTilt).toBeUndefined()
    expect(values(wrapper).pan).toContain('sens inversé')
    expect(values(wrapper).pan).toContain(String(65_535 - 33_792))
    expect(sel(wrapper, 'calibration-note').text()).toContain('sens inversé')
    // La lyre est repointée au même endroit physique : octet de pan inchangé (132).
    await vi.waitFor(() => expect(getLighting()?.getFrame()[0]).toBe(132))

    await press('KeyH')
    await vi.waitFor(() => expect(fixture().invertTilt).toBe(true))
    await press('KeyG')
    await vi.waitFor(() => expect(fixture().invertPan).toBeUndefined())
  })

  it('le buzzer du pupitre en cours valide sa position, pas celui d’un autre pupitre', async () => {
    const wrapper = await atPositions()

    await press('KeyE') // pupitre 2 : ce n'est pas le pupitre en cours
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 1 (1 sur 4)')

    await press('KeyB') // pupitre 1, bouton B
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 2 (2 sur 4)')
    expect(marked(wrapper)).toBe(1)
  })

  it('reste sans effet quand le focus est dans un champ de saisie', async () => {
    const wrapper = await atPositions()
    const slider = sel(wrapper, 'pan-lyre-1').element

    for (const code of ['ArrowRight', 'ArrowUp', 'Enter', 'KeyG', 'KeyP']) {
      await press(code, {}, slider)
    }
    expect(values(wrapper)).toEqual({
      pan: 'Gauche / droite : 32768',
      tilt: 'Haut / bas : 32768',
    })
    expect(fixture().invertPan).toBeUndefined()
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 1 (1 sur 4)')
  })

  it('un buzzer appris sur G garde la priorité : l’aide barre la touche, le bouton inverse', async () => {
    // Comme le préréglage 6 pupitres : G est le buzzer D du pupitre 4.
    const withG = Object.fromEntries(
      Object.entries(learnedKeymap()).filter(([code]) => code !== 'KeyS')
    ) as ReturnType<typeof learnedKeymap>
    withG.KeyG = { desk: 4, button: 'D' }
    const wrapper = await atPositions(withG)

    expect(sel(wrapper, 'calibration-taken').text()).toContain('occupée par un buzzer')
    expect(wrapper.findAll('[data-test="calibration-taken"]')).toHaveLength(1)

    await press('KeyG')
    expect(fixture().invertPan).toBeUndefined()
    expect(sel(wrapper, 'calibration-note').exists()).toBe(false)
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 1 (1 sur 4)')

    await click(wrapper, 'calibration-invert-pan')
    await vi.waitFor(() => expect(fixture().invertPan).toBe(true))
  })

  it('les boutons du panneau valident, copient et inversent à la souris', async () => {
    const wrapper = await atPositions()

    // Rien à copier sur le premier pupitre de la lyre.
    expect(sel(wrapper, 'calibration-copy').attributes('disabled')).toBeDefined()
    await press('ArrowRight')
    await click(wrapper, 'calibration-validate')
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 2 (2 sur 4)')
    expect(marked(wrapper)).toBe(1)

    expect(sel(wrapper, 'calibration-copy').attributes('disabled')).toBeUndefined()
    await click(wrapper, 'calibration-copy')
    expect(sel(wrapper, 'calibration-note').text()).toContain('Position du pupitre 1 copiée')
    expect(values(wrapper).pan).toBe('Gauche / droite : 33792')

    await click(wrapper, 'calibration-invert-tilt')
    await vi.waitFor(() => expect(fixture().invertTilt).toBe(true))
    await click(wrapper, 'calibration-invert-pan')
    await vi.waitFor(() => expect(fixture().invertPan).toBe(true))
  })

  it('Entrée sur un bouton garde son rôle de clic et ne valide pas', async () => {
    const wrapper = await atPositions()

    await press('Enter', {}, sel(wrapper, 'calibration-copy').element)
    await press('Enter', {}, sel(wrapper, 'assistant-back').element)
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 1 (1 sur 4)')
    expect(marked(wrapper)).toBe(0)
  })

  it('suspend les raccourcis pendant une confirmation', async () => {
    const wrapper = await atPositions()
    const { confirm, cancel } = useConfirm()

    void confirm({ message: 'Sûr ?' })
    await press('ArrowRight')
    await press('Enter')
    expect(values(wrapper).pan).toBe('Gauche / droite : 32768')
    expect(sel(wrapper, 'calibration-current').text()).toContain('pupitre 1 (1 sur 4)')

    cancel()
    await press('ArrowRight')
    expect(values(wrapper).pan).toBe('Gauche / droite : 33792')
  })

  it('ne réagit plus aux touches une fois l’assistant démonté', async () => {
    const wrapper = await atPositions()
    const setFixture = vi.spyOn(getLighting()!.diagnostics, 'setFixture')

    await press('ArrowRight')
    expect(setFixture).toHaveBeenCalled()
    setFixture.mockClear()

    wrapper.unmount()
    await press('ArrowRight')
    await press('Enter')
    expect(setFixture).not.toHaveBeenCalled()
  })

  it('n’écoute rien hors de l’étape des lyres, ni avec Ctrl', async () => {
    await saveRoomHardwareConfig({
      buzzers: { keymap: learnedKeymap() },
      lighting: {
        driver: 'simulation',
        fixtures: [{ id: 'lyre', name: 'Lyre', profileId: 'moving-head-8', address: 1 }],
      },
    })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-assistant')
    await press('ArrowRight')
    await press('Enter')
    expect(fixture().deskPositions).toBeUndefined()
    expect(sel(wrapper, 'step-browser').exists()).toBe(true)

    for (let step = 0; step < 5; step += 1) {
      await click(wrapper, 'assistant-next')
    }
    await click(wrapper, 'ok-lyre')
    await click(wrapper, 'assistant-next')
    await press('ArrowRight', { ctrlKey: true })
    expect(values(wrapper).pan).toBe('Gauche / droite : 32768')
  })
})
