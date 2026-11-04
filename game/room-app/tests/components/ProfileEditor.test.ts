import { flushPromises } from '@vue/test-utils'

import { saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp } from '../_helpers/mount'

async function openEditor() {
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await wrapper.find('[data-test="tab-advanced"]').trigger('click')
  await flushPromises()
  return wrapper
}

describe('éditeur de profils (configuration avancée)', () => {
  beforeEach(async () => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    await saveRoomHardwareConfig({
      lighting: {
        fixtures: [{ id: 'lyre', name: 'Lyre', profileId: 'moving-head-spot-9', address: 1 }],
        customProfiles: [],
      },
    })
  })

  it('copie une lyre générique, ajoute un emplacement de roue et inverse le pan', async () => {
    const wrapper = await openEditor()

    await wrapper.find('[data-test="profile-base"]').setValue('moving-head-spot-9')
    await wrapper.find('[data-test="profile-copy"]').trigger('click')
    const profile = wrapper.find('[data-test="profile"]')
    expect(profile.attributes('data-profile')).toBe('custom-moving-head-spot-9')
    const before = profile.findAll('[data-test="slot"]').length
    expect(before).toBeGreaterThan(0)

    await profile.find('[data-test="slot-add"]').trigger('click')
    const slots = profile.findAll('[data-test="slot"]')
    expect(slots).toHaveLength(before + 1)
    const added = slots[before]!
    await added.find('[data-test="slot-value"]').setValue('200')
    await added.find('[data-test="slot-color"]').setValue('#ff8000')

    // La lyre « Lyre » a un pan : ses cases d'inversion sont proposées.
    await wrapper.find('[data-test="invert-pan"]').setValue(true)
    await wrapper.find('[data-test="profiles-save"]').trigger('click')
    await flushPromises()

    const { config } = useRoomHardware().hardware.value
    const wheel = config.lighting.customProfiles[0]!.channels.find(
      (channel) => channel.role === 'colorWheel'
    )!
    expect(wheel.slots).toHaveLength(before + 1)
    expect(wheel.slots!.at(-1)).toEqual({ value: 200, rgb: [255, 128, 0] })
    expect(config.lighting.fixtures[0]).toMatchObject({ invertPan: true })
    expect(config.lighting.fixtures[0]).not.toHaveProperty('invertTilt')
    expect(useRoomHardware().hardware.value.problems).toEqual([])
  })

  it('un nouveau canal shutter repart avec l’ouverture par défaut', async () => {
    const wrapper = await openEditor()
    await wrapper.find('[data-test="profile-copy"]').trigger('click')
    const channels = () => wrapper.findAll('[data-test="profile"] .channel')
    const count = channels().length

    await wrapper.find('[data-test="new-role"]').setValue('shutter')
    await wrapper.find('[data-test="channel-add"]').trigger('click')

    expect(channels()).toHaveLength(count + 1)
    expect(
      (channels().at(-1)!.find('input[type="number"]').element as HTMLInputElement).value
    ).toBe('255')
  })
})
