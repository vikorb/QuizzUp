import { exportRoomConfig, parseRoomConfigImport } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { resetRoomHardware, saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import AdvancedConfig from '@/views/hardware/AdvancedConfig.vue'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'
import { saveWithSmokeProof } from '../_helpers/smokeProof'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

const SMOKE_FIXTURE = { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }
const BOUNDED_SMOKE = {
  enabled: true,
  maxDurationMs: 2_000,
  cooldownMs: 60_000,
  maxLevel: 200,
  requireConfirmation: true,
}

const smokeConfig = () => useRoomHardware().hardware.value.config.lighting.smoke

async function openAdvanced() {
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await wrapper.find('[data-test="tab-advanced"]').trigger('click')
  await flushPromises()
  const area = wrapper.find<HTMLTextAreaElement>('[data-test="config-json"]')
  /** Réécrit le JSON : `smoke` est fusionné dans `lighting.smoke`, `rest` à la racine. */
  const save = async (smoke: Record<string, unknown>, rest: Record<string, unknown> = {}) => {
    const draft = JSON.parse(area.element.value)
    const edited = {
      ...draft,
      ...rest,
      lighting: { ...draft.lighting, smoke: { ...draft.lighting.smoke, ...smoke } },
    }
    await area.setValue(JSON.stringify(edited))
    await wrapper.find('[data-test="config-save"]').trigger('click')
    await flushPromises()
  }
  return { wrapper, save }
}

describe('configuration avancée : la fumée ne s’assouplit pas par le JSON', () => {
  beforeEach(async () => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    await resetRoomHardware()
  })

  it('n’active pas une fumée désactivée, tout en gardant le reste de la config', async () => {
    await saveRoomHardwareConfig({ lighting: { fixtures: [SMOKE_FIXTURE] } })
    const { save } = await openAdvanced()

    await save({ enabled: true }, { desksCount: 5 })

    expect(smokeConfig().enabled).toBe(false)
    expect(useRoomHardware().hardware.value.config.desksCount).toBe(5)
  })

  it('n’accorde pas la dispense de relais à une salle qui ne l’a pas', async () => {
    await saveRoomHardwareConfig({
      lighting: {
        fixtures: [{ ...SMOKE_FIXTURE, profileId: 'smoke-dmx' }],
        smoke: { enabled: false },
      },
    })
    const { save } = await openAdvanced()

    await save({ enabled: true, cutsOnSignalLoss: true })

    expect(smokeConfig().enabled).toBe(false)
    expect(smokeConfig().cutsOnSignalLoss).toBeUndefined()
  })

  it('ne desserre ni la durée, ni la pause, ni le niveau, ni la confirmation', async () => {
    await saveWithSmokeProof({ lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE } })
    expect(smokeConfig()).toMatchObject(BOUNDED_SMOKE)
    const { save } = await openAdvanced()

    await save({
      maxDurationMs: 9_000,
      cooldownMs: 5_000,
      maxLevel: 255,
      requireConfirmation: false,
    })

    expect(smokeConfig()).toMatchObject(BOUNDED_SMOKE)
  })

  it('accepte de restreindre la fumée', async () => {
    await saveWithSmokeProof({ lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE } })
    const { save } = await openAdvanced()

    await save({ maxDurationMs: 1_000, cooldownMs: 90_000 })
    expect(smokeConfig()).toMatchObject({ enabled: true, maxDurationMs: 1_000, cooldownMs: 90_000 })

    await save({ enabled: false })
    expect(smokeConfig().enabled).toBe(false)
  })
})

describe('configuration avancée : export et import', () => {
  beforeEach(async () => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    await resetRoomHardware()
  })

  it('exporte la config en place, fumée désactivée', async () => {
    await saveWithSmokeProof({
      desksCount: 5,
      lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE },
    })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await wrapper.find('[data-test="tab-advanced"]').trigger('click')
    await flushPromises()

    const { fileName, content } = wrapper.findComponent(AdvancedConfig).vm.exportConfig('Salle 1')
    expect(fileName).toMatch(/^quizzup-salle-salle-1-\d{4}-\d{2}-\d{2}\.json$/)
    const file = JSON.parse(content)
    expect(file.config.desksCount).toBe(5)
    expect(file.config.lighting.smoke.enabled).toBe(false)
  })

  it('importe sans jamais desserrer la fumée de la salle', async () => {
    await saveWithSmokeProof({ lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE } })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await wrapper.find('[data-test="tab-advanced"]').trigger('click')
    await flushPromises()

    const permissive = parseRoomConfigImport(
      exportRoomConfig(
        {
          ...useRoomHardware().hardware.value.config,
          desksCount: 3,
          lighting: {
            ...useRoomHardware().hardware.value.config.lighting,
            smoke: { ...BOUNDED_SMOKE, maxDurationMs: 9_000, cooldownMs: 5_000, maxLevel: 255 },
          },
        },
        { roomName: 'Autre salle', now: new Date() }
      ).content
    )
    if (!permissive.ok) {
      throw new Error(permissive.message)
    }
    await wrapper.findComponent(AdvancedConfig).vm.applyImport(permissive)
    await flushPromises()

    expect(useRoomHardware().hardware.value.config.desksCount).toBe(3)
    expect(smokeConfig()).toEqual({ ...BOUNDED_SMOKE, enabled: false })
  })
})
