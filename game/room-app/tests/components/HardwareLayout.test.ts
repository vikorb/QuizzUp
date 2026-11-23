import { flushPromises } from '@vue/test-utils'

import { getLighting, saveRoomHardwareConfig } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const TABS = ['assistant', 'buzzers', 'plan', 'lights', 'diagnostic', 'advanced'] as const

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)
const primaries = (wrapper: Wrapper) => wrapper.findAll('.ui-btn--primary')

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

async function keydown(wrapper: Wrapper, name: string, key: string) {
  await sel(wrapper, name).trigger('keydown', { key })
  await flushPromises()
}

/** Un buzzer par bouton pour les pupitres 1-4. */
function fullKeymap() {
  const keymap: Record<string, { desk: 1 | 2 | 3 | 4; button: 'A' | 'B' | 'C' | 'D' }> = {}
  for (const [index, letter] of [...'BCGHIJKLMNOPTUYZ'].entries()) {
    keymap[`Key${letter}`] = {
      desk: (Math.floor(index / 4) + 1) as 1 | 2 | 3 | 4,
      button: 'ABCD'[index % 4] as 'A' | 'B' | 'C' | 'D',
    }
  }
  return keymap
}

describe('écran Matériel : onglets', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('expose le motif d’onglets : tablist, onglet actif, panneau relié', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(TABS.length)

    // Un seul onglet actif (Buzzers par défaut), seul dans l'ordre de tabulation.
    expect(tabs.filter((tab) => tab.attributes('aria-selected') === 'true')).toHaveLength(1)
    expect(sel(wrapper, 'tab-buzzers').attributes('aria-selected')).toBe('true')
    expect(sel(wrapper, 'tab-buzzers').attributes('tabindex')).toBe('0')
    expect(sel(wrapper, 'tab-plan').attributes('aria-selected')).toBe('false')
    expect(sel(wrapper, 'tab-plan').attributes('tabindex')).toBe('-1')

    // Chaque onglet désigne le panneau, qui existe et est nommé par l'onglet actif.
    const panel = wrapper.find('[role="tabpanel"]')
    expect(panel.exists()).toBe(true)
    for (const tab of tabs) {
      expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'))
    }
    expect(panel.attributes('aria-labelledby')).toBe(sel(wrapper, 'tab-buzzers').attributes('id'))
    expect(panel.find('[data-test="desks-count"]').exists()).toBe(true)
  })

  it('ouvre l’onglet demandé par l’adresse et relie le panneau à cet onglet', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=diagnostic' })

    const panel = wrapper.find('[role="tabpanel"]')
    expect(sel(wrapper, 'tab-diagnostic').attributes('aria-selected')).toBe('true')
    expect(panel.attributes('aria-labelledby')).toBe(
      sel(wrapper, 'tab-diagnostic').attributes('id')
    )
    expect(panel.find('[data-test="diagnostic"]').exists()).toBe(true)
  })

  it('un clic change l’onglet actif et le tabindex roulant', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-advanced')

    expect(sel(wrapper, 'tab-advanced').attributes('aria-selected')).toBe('true')
    expect(sel(wrapper, 'tab-advanced').attributes('tabindex')).toBe('0')
    expect(sel(wrapper, 'tab-buzzers').attributes('aria-selected')).toBe('false')
    expect(sel(wrapper, 'tab-buzzers').attributes('tabindex')).toBe('-1')
    expect(wrapper.find('[role="tabpanel"]').find('[data-test="config-json"]').exists()).toBe(true)
  })

  it('navigue au clavier : flèches circulaires, Début et Fin, avec le focus', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await keydown(wrapper, 'tab-buzzers', 'ArrowRight')
    expect(sel(wrapper, 'tab-plan').attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(sel(wrapper, 'tab-plan').element)
    expect(wrapper.find('[role="tabpanel"]').find('[data-test="plan-tab"]').exists()).toBe(true)

    await keydown(wrapper, 'tab-plan', 'ArrowLeft')
    expect(sel(wrapper, 'tab-buzzers').attributes('aria-selected')).toBe('true')

    await keydown(wrapper, 'tab-buzzers', 'ArrowLeft')
    expect(sel(wrapper, 'tab-assistant').attributes('aria-selected')).toBe('true')

    // Le début boucle sur la fin, et inversement.
    await keydown(wrapper, 'tab-assistant', 'ArrowLeft')
    expect(sel(wrapper, 'tab-advanced').attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(sel(wrapper, 'tab-advanced').element)
    await keydown(wrapper, 'tab-advanced', 'ArrowRight')
    expect(sel(wrapper, 'tab-assistant').attributes('aria-selected')).toBe('true')

    await keydown(wrapper, 'tab-assistant', 'End')
    expect(sel(wrapper, 'tab-advanced').attributes('aria-selected')).toBe('true')
    await keydown(wrapper, 'tab-advanced', 'Home')
    expect(sel(wrapper, 'tab-assistant').attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(sel(wrapper, 'tab-assistant').element)
  })

  it('ignore les autres touches', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await keydown(wrapper, 'tab-buzzers', 'a')
    await keydown(wrapper, 'tab-buzzers', 'ArrowDown')

    expect(sel(wrapper, 'tab-buzzers').attributes('aria-selected')).toBe('true')
  })
})

describe('écran Matériel : un seul bouton primaire par onglet', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it.each(TABS)('onglet %s : au plus un primaire à l’ouverture', async (tab) => {
    const { wrapper } = await mountWithApp(HardwareView, { route: `/hardware?tab=${tab}` })
    await flushPromises()

    expect(primaries(wrapper).length).toBeLessThanOrEqual(1)
  })

  it('Buzzers : « Configurer » est le primaire, à droite de l’en-tête', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    expect(primaries(wrapper)).toHaveLength(1)
    expect(wrapper.find('.hw-panel__actions [data-test="start-config"]').classes()).toContain(
      'ui-btn--primary'
    )
  })

  it('Diagnostic : « Lancer » est le primaire, à droite de l’en-tête', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=diagnostic' })
    await flushPromises()

    expect(primaries(wrapper)).toHaveLength(1)
    expect(wrapper.find('.hw-panel__actions [data-test="diag-begin"]').classes()).toContain(
      'ui-btn--primary'
    )
  })

  it('Configuration avancée : « Enregistrer » est le seul primaire (éditeur de profils compris)', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=advanced' })

    expect(sel(wrapper, 'profile-editor').exists()).toBe(true)
    expect(primaries(wrapper)).toHaveLength(1)
    expect(sel(wrapper, 'config-save').classes()).toContain('ui-btn--primary')
    expect(sel(wrapper, 'profiles-save').classes()).not.toContain('ui-btn--primary')
  })

  it('Buzzers : l’étape des couleurs garde un seul primaire', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'start-config')

    expect(sel(wrapper, 'layout-step').exists()).toBe(true)
    expect(primaries(wrapper)).toHaveLength(1)
    expect(sel(wrapper, 'layout-continue').classes()).toContain('ui-btn--primary')
  })
})

describe('écran Matériel : arrêt d’urgence', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('Lumières : « Arrêt d’urgence » est à droite de l’en-tête, en danger', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=lights' })
    await flushPromises()

    const stop = wrapper.find('.hw-panel__head .hw-panel__actions [data-test="emergency-stop"]')
    expect(stop.exists()).toBe(true)
    expect(stop.classes()).toContain('ui-btn--danger')
    // Le titre est du côté gauche, dans le bloc d'en-tête.
    expect(
      wrapper.find('.hw-panel__head .hw-panel__heading [data-test="lights-status"]').exists()
    ).toBe(true)
  })

  it('Diagnostic : « Arrêt d’urgence » est à droite de l’en-tête, en danger', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=diagnostic' })
    await flushPromises()

    const stop = wrapper.find('.hw-panel__head .hw-panel__actions [data-test="diag-emergency"]')
    expect(stop.exists()).toBe(true)
    expect(stop.classes()).toContain('ui-btn--danger')
  })
})

describe('écran Matériel : assistant, un primaire à chaque étape', () => {
  const STEP_TESTS = [
    'step-browser',
    'step-buzzers',
    'step-interface',
    'step-fixtures',
    'step-plan',
    'step-test',
    'step-positions',
    'step-smoke',
    'step-summary',
  ]

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('titre et progression sont dans l’en-tête du panneau', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=assistant' })

    const heading = wrapper.find('.hw-panel__head .hw-panel__heading')
    expect(heading.find('h2').exists()).toBe(true)
    expect(heading.text()).toContain('1')
  })

  it('« Précédent » à gauche, l’unique primaire à droite, de la première étape à la synthèse', async () => {
    await saveRoomHardwareConfig({
      buzzers: { keymap: fullKeymap() },
      lighting: {
        driver: 'simulation',
        fixtures: [
          { id: 'par', name: 'PAR', profileId: 'par-rgb', address: 1 },
          { id: 'lyre', name: 'Lyre', profileId: 'moving-head-8', address: 20 },
          { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 },
        ],
      },
    })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=assistant' })

    for (const [index, step] of STEP_TESTS.entries()) {
      expect(sel(wrapper, step).exists(), step).toBe(true)
      const last = index === STEP_TESTS.length - 1

      // Un seul primaire, dans la barre de navigation, après « Précédent ».
      expect(primaries(wrapper), step).toHaveLength(1)
      const nav = wrapper.find('.nav')
      expect(nav.findAll('.ui-btn--primary'), step).toHaveLength(1)
      expect(nav.element.firstElementChild, step).toBe(sel(wrapper, 'assistant-back').element)
      expect(nav.find('.ui-btn--primary').attributes('data-test'), step).toBe(
        last ? 'assistant-save' : 'assistant-next'
      )
      expect(sel(wrapper, last ? 'assistant-next' : 'assistant-save').exists(), step).toBe(false)
      // « Précédent » ne passe jamais en primaire.
      expect(sel(wrapper, 'assistant-back').classes(), step).not.toContain('ui-btn--primary')

      if (last) {
        break
      }
      if (step === 'step-test') {
        await click(wrapper, 'ok-par')
        await click(wrapper, 'ok-lyre')
        // La marque « ok » n'est pas un second primaire.
        expect(primaries(wrapper)).toHaveLength(1)
        expect(sel(wrapper, 'ok-par').attributes('aria-pressed')).toBe('true')
      }
      if (step === 'step-positions') {
        await vi.waitFor(() => expect(getLighting()?.diagnostics.getState().active).toBe(true))
        for (let desk = 0; desk < 4; desk += 1) {
          await click(wrapper, 'calibration-validate')
        }
        // « Valider » est un bouton par défaut.
        expect(sel(wrapper, 'calibration-validate').classes()).not.toContain('ui-btn--primary')
        expect(primaries(wrapper)).toHaveLength(1)
      }
      await click(wrapper, 'assistant-next')
    }
  })

  it('« Ajouter » un appareil est un bouton par défaut, sur la ligne des champs', async () => {
    await saveRoomHardwareConfig({ buzzers: { keymap: fullKeymap() } })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=assistant' })
    for (let step = 0; step < 3; step += 1) {
      await click(wrapper, 'assistant-next')
    }

    expect(sel(wrapper, 'step-fixtures').exists()).toBe(true)
    expect(sel(wrapper, 'fixture-add').classes()).not.toContain('ui-btn--primary')
    // Même ligne que les champs, alignée sur leur bas (.hw-fields).
    expect(sel(wrapper, 'fixture-add').element.parentElement?.classList.contains('hw-fields')).toBe(
      true
    )
    expect(sel(wrapper, 'fixture-name').element.closest('.hw-fields')).toBe(
      sel(wrapper, 'fixture-add').element.parentElement
    )
    expect(primaries(wrapper)).toHaveLength(1)
    expect(wrapper.find('label.file-btn').exists()).toBe(true)
  })

  it('sans buzzers appris, « Suivant » reste le seul primaire (grisé)', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware?tab=assistant' })
    await click(wrapper, 'assistant-next')

    expect(sel(wrapper, 'step-buzzers').exists()).toBe(true)
    expect(sel(wrapper, 'assistant-next').attributes('disabled')).toBeDefined()
    expect(primaries(wrapper)).toHaveLength(1)
    // « Configurer » est un bouton par défaut dans l'assistant.
    expect(sel(wrapper, 'start-config').classes()).not.toContain('ui-btn--primary')
  })
})
