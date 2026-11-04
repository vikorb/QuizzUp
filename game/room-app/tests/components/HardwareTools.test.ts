import { MAX_FREEZE_MS } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import {
  getLighting,
  HARDWARE_STORAGE_KEY,
  saveBuzzerKeymap,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

async function openTab(wrapper: Wrapper, tab: string) {
  await click(wrapper, `tab-${tab}`)
}

/** Un buzzer par bouton pour les pupitres 1-4. */
function fullKeymap() {
  const letters = 'BCGHIJKLMNOPTUYZ'
  const keymap: Record<string, { desk: 1 | 2 | 3 | 4; button: 'A' | 'B' | 'C' | 'D' }> = {}
  for (const [index, letter] of [...letters].entries()) {
    keymap[`Key${letter}`] = {
      desk: (Math.floor(index / 4) + 1) as 1 | 2 | 3 | 4,
      button: 'ABCD'[index % 4] as 'A' | 'B' | 'C' | 'D',
    }
  }
  return keymap
}

/** Accepte les confirmations demandées (la modale n'est pas montée ici). */
async function acceptConfirmations(count: number) {
  for (let index = 0; index < count; index += 1) {
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()
  }
}

describe('onglet Diagnostic', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('pilote un canal, protège la fumée et un appareil, puis rend la main aux scènes', async () => {
    const { saveRoomHardwareConfig } = await import('@/hardware/roomHardware')
    await saveRoomHardwareConfig({
      lighting: {
        fixtures: [
          { id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1 },
          { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 10 },
        ],
      },
    })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'diagnostic')
    await vi.waitFor(() => expect(getLighting()).not.toBeNull())
    expect(sel(wrapper, 'diag-interface').text()).toContain('simulation')

    await click(wrapper, 'diag-begin')
    expect(getLighting()?.diagnostics.getState().active).toBe(true)

    await sel(wrapper, 'diag-channel').setValue(2)
    await sel(wrapper, 'diag-value').setValue(200)
    await vi.waitFor(() => expect(getLighting()?.getFrame()[1]).toBe(200))

    await sel(wrapper, 'diag-channel').setValue(10)
    await click(wrapper, 'diag-send')
    expect(sel(wrapper, 'diag-refusal').text()).toContain('Canal de fumée')

    await sel(wrapper, 'diag-channel').setValue(300)
    await click(wrapper, 'diag-send')
    expect(sel(wrapper, 'diag-refusal').text()).toContain('aucun appareil déclaré')

    await click(wrapper, 'diag-par1-red')
    await vi.waitFor(() => expect(getLighting()?.getFrame()[0]).toBe(255))
    await click(wrapper, 'diag-clear')
    await vi.waitFor(() => expect(getLighting()?.getFrame()[0]).toBe(0))

    expect(sel(wrapper, 'diag-freeze').exists()).toBe(true)
    await click(wrapper, 'diag-end')
    expect(getLighting()?.diagnostics.getState().active).toBe(false)
    expect(sel(wrapper, 'diag-begin').exists()).toBe(true)
  })

  it('autorise la recherche d’adresse en prévenant de débrancher la fumée', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'diagnostic')
    await vi.waitFor(() => expect(getLighting()).not.toBeNull())
    await sel(wrapper, 'diag-unknown').setValue(true)
    expect(wrapper.text()).toContain('Débranche d’abord la machine à fumée')
    await click(wrapper, 'diag-begin')
    await sel(wrapper, 'diag-channel').setValue(300)
    await sel(wrapper, 'diag-value').setValue(90)
    await vi.waitFor(() => expect(getLighting()?.getFrame()[299]).toBe(90))

    // Quitter l'onglet termine le diagnostic.
    await openTab(wrapper, 'lights')
    expect(getLighting()?.diagnostics.getState().active).toBe(false)
  })
})

describe('onglet Assistant', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('installe une salle en simulation avec un PAR et une fumée sécurisée', async () => {
    await saveBuzzerKeymap(fullKeymap())
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'assistant')
    expect(sel(wrapper, 'step-browser').exists()).toBe(true)

    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-buzzers').exists()).toBe(true)
    expect(sel(wrapper, 'blockers').exists()).toBe(false)
    await sel(wrapper, 'buzzer-source').setValue('gamepad')
    expect(wrapper.text()).toContain('Appuie sur un buzzer pour activer la carte')
    await sel(wrapper, 'gamepad-match').setValue('BU0836')

    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-interface').exists()).toBe(true)
    await sel(wrapper, 'driver-opendmx').setValue(true)
    expect(wrapper.text()).toContain('Open DMX est expérimental')
    await sel(wrapper, 'driver-simulation').setValue(true)

    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-fixtures').exists()).toBe(true)
    await sel(wrapper, 'fixture-name').setValue('PAR pupitre 1')
    await click(wrapper, 'fixture-add')
    await sel(wrapper, 'fixture-profile').setValue('smoke-relay')
    await sel(wrapper, 'fixture-address').setValue(2)
    await click(wrapper, 'fixture-add')
    expect(wrapper.text()).toContain('canal 2 déjà utilisé par « PAR pupitre 1 »')
    await sel(wrapper, 'fixture-address').setValue('')
    await sel(wrapper, 'fixture-name').setValue('Fumée')
    await click(wrapper, 'fixture-add')
    expect(sel(wrapper, 'fixture-list').text()).toContain('Adresse 4')

    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-test').exists()).toBe(true)
    await vi.waitFor(() => expect(getLighting()?.diagnostics.getState().active).toBe(true))
    await click(wrapper, 'light-par-pupitre-1')
    await vi.waitFor(() => expect(getLighting()?.getFrame()[0]).toBe(255))
    expect(sel(wrapper, 'assistant-next').attributes('disabled')).toBeDefined()
    await click(wrapper, 'ok-par-pupitre-1')

    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-smoke').exists()).toBe(true)
    await sel(wrapper, 'smoke-enable').setValue(true)
    expect(sel(wrapper, 'blockers').text()).toContain("Arrêt d'urgence physique")
    expect(sel(wrapper, 'assistant-freeze').attributes('disabled')).toBeDefined()
    await sel(wrapper, 'check-physicalStop').setValue(true)
    await sel(wrapper, 'check-timedRelay').setValue(true)
    await sel(wrapper, 'check-siteRules').setValue(true)

    // Plantage simulé, deux confirmations : la fumée part puis les trames s'arrêtent.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
    await acceptConfirmations(2)
    await freeze
    await flushPromises()
    // La trame figée contient bien la fumée : c'est elle que l'interface répète.
    expect(getLighting()?.diagnostics.getState().frozenUntil).not.toBeNull()
    expect(getLighting()?.getFrame()[3]).toBeGreaterThan(0)
    expect(sel(wrapper, 'freeze-running').exists()).toBe(true)
    // La config de test (fumée active avant le test) n'est jamais enregistrée.
    expect(useRoomHardware().hardware.value.config.lighting.smoke.enabled).toBe(true)
    expect(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '').not.toContain('"enabled":true')
    await vi.advanceTimersByTimeAsync(MAX_FREEZE_MS)
    vi.useRealTimers()
    await flushPromises()
    expect(sel(wrapper, 'freeze-question').exists()).toBe(true)
    await click(wrapper, 'freeze-ok')
    expect(sel(wrapper, 'blockers').exists()).toBe(false)

    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-summary').exists()).toBe(true)
    expect(sel(wrapper, 'summary-warnings').text()).toContain('simulation')
    await click(wrapper, 'assistant-save')
    expect(wrapper.text()).toContain('Configuration enregistrée')

    const { config } = useRoomHardware().hardware.value
    expect(config.lighting.smoke.enabled).toBe(true)
    expect(config.buzzers.source).toEqual({ kind: 'gamepad', match: 'BU0836' })
    expect(config.lighting.fixtures.map((fixture) => fixture.id)).toEqual([
      'par-pupitre-1',
      'fumee',
    ])
  })

  it('referme la fumée si on quitte l’assistant après le seul test de gel', async () => {
    await saveBuzzerKeymap(fullKeymap())
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'assistant')
    await click(wrapper, 'assistant-next')
    await click(wrapper, 'assistant-next')
    await click(wrapper, 'assistant-next')
    await sel(wrapper, 'fixture-profile').setValue('smoke-relay')
    await click(wrapper, 'fixture-add')
    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-smoke').exists()).toBe(true)
    await sel(wrapper, 'check-physicalStop').setValue(true)
    await sel(wrapper, 'check-timedRelay').setValue(true)
    // Sans « Utiliser la fumée », pas de test de gel.
    expect(sel(wrapper, 'assistant-freeze').attributes('disabled')).toBeDefined()
    await sel(wrapper, 'smoke-enable').setValue(true)

    const cancelled = sel(wrapper, 'assistant-freeze').trigger('click')
    await acceptConfirmations(1)
    // Seconde confirmation refusée : rien ne part.
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().cancel()
    await cancelled
    await flushPromises()
    expect(sel(wrapper, 'freeze-running').exists()).toBe(false)
    expect(getLighting()?.getState().smoke.armed).toBe(false)

    // La fumée ne s'arrête pas seule : « tout couper » déclenche l'arrêt d'urgence.
    const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
    await acceptConfirmations(2)
    await freeze
    await flushPromises()
    expect(sel(wrapper, 'freeze-running').exists()).toBe(true)
    await click(wrapper, 'freeze-abort')
    expect(getLighting()?.getState().emergency).toBe(true)
    expect(getLighting()?.diagnostics.getState().frozenUntil).toBeNull()
    expect(wrapper.text()).toContain('La fumée ne doit pas être utilisée')
    expect(useRoomHardware().hardware.value.config.lighting.smoke.enabled).toBe(true)
    expect(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '').not.toContain('"enabled":true')

    await openTab(wrapper, 'buzzers')
    await vi.waitFor(() =>
      expect(useRoomHardware().hardware.value.config.lighting.smoke.enabled).toBe(false)
    )
    await click(wrapper, 'tab-assistant')
    await click(wrapper, 'assistant-back')
    expect(sel(wrapper, 'step-browser').exists()).toBe(true)
  })
})
