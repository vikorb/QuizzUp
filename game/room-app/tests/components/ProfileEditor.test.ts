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

type Wrapper = Awaited<ReturnType<typeof openEditor>>

/** Copie la lyre spot générique 9 canaux en profil sur mesure. */
async function copySpot(wrapper: Wrapper) {
  await wrapper.find('[data-test="profile-base"]').setValue('moving-head-spot-9')
  await wrapper.find('[data-test="profile-copy"]').trigger('click')
}

/** Remplace les profils sur mesure comme le ferait un autre onglet ou le JSON. */
function replaceProfilesExternally(id: string) {
  const { config } = useRoomHardware().hardware.value
  return saveRoomHardwareConfig({
    ...config,
    lighting: {
      ...config.lighting,
      customProfiles: [
        { id, name: id, kind: 'movingHead', channels: [{ role: 'pan' }, { role: 'tilt' }] },
      ],
    },
  })
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
    await copySpot(wrapper)
    const channels = () => wrapper.findAll('[data-test="profile"] .channel')
    const count = channels().length

    await wrapper.find('[data-test="new-role"]').setValue('shutter')
    await wrapper.find('[data-test="channel-add"]').trigger('click')

    expect(channels()).toHaveLength(count + 1)
    expect(
      (channels().at(-1)!.find('input[type="number"]').element as HTMLInputElement).value
    ).toBe('255')
  })

  it('enchaîne un enregistrement de l’éditeur puis du JSON sans perdre le profil', async () => {
    const wrapper = await openEditor()
    await copySpot(wrapper)
    await wrapper.find('[data-test="profiles-save"]').trigger('click')
    await flushPromises()

    // Le brouillon JSON reflète l'enregistrement de l'éditeur…
    const textarea = wrapper.find('[data-test="config-json"]')
    expect((textarea.element as HTMLTextAreaElement).value).toContain('custom-moving-head-spot-9')

    // …donc l'enregistrer à son tour ne supprime pas le profil.
    await wrapper.find('[data-test="config-save"]').trigger('click')
    await flushPromises()
    const { config } = useRoomHardware().hardware.value
    expect(config.lighting.customProfiles.map((profile) => profile.id)).toEqual([
      'custom-moving-head-spot-9',
    ])
    expect(wrapper.find('[data-test="profile"]').exists()).toBe(true)
  })

  it('recharge l’éditeur quand la config change ailleurs, sauf s’il a des modifications', async () => {
    const wrapper = await openEditor()
    // Éditeur propre : la config extérieure apparaît.
    await replaceProfilesExternally('exterieur')
    await flushPromises()
    expect(
      wrapper.findAll('[data-test="profile"]').map((node) => node.attributes('data-profile'))
    ).toEqual(['exterieur'])

    // Éditeur modifié : ses modifications non enregistrées survivent à un changement extérieur.
    await copySpot(wrapper)
    await replaceProfilesExternally('autre')
    await flushPromises()
    expect(
      wrapper.findAll('[data-test="profile"]').map((node) => node.attributes('data-profile'))
    ).toEqual(['exterieur', 'custom-moving-head-spot-9'])
  })

  it('désactive la suppression d’un profil utilisé et liste les appareils concernés', async () => {
    const channels = [{ role: 'pan' }, { role: 'tilt' }]
    await saveRoomHardwareConfig({
      lighting: {
        customProfiles: [
          { id: 'mine', name: 'Ma lyre', kind: 'movingHead', channels },
          { id: 'libre', name: 'Libre', kind: 'movingHead', channels },
        ],
        fixtures: [
          {
            id: 'a',
            name: 'Lyre A',
            profileId: 'mine',
            address: 1,
            deskPositions: { 1: { pan: 10, tilt: 20 } },
          },
        ],
      },
    })
    const wrapper = await openEditor()
    const mine = wrapper.find('[data-profile="mine"]')
    const free = wrapper.find('[data-profile="libre"]')

    expect(mine.find('[data-test="profile-remove"]').attributes('disabled')).toBeDefined()
    expect(mine.find('[data-test="profile-in-use"]').text()).toContain('Lyre A')
    expect(free.find('[data-test="profile-in-use"]').exists()).toBe(false)

    await mine.find('[data-test="profile-remove"]').trigger('click')
    expect(wrapper.find('[data-profile="mine"]').exists()).toBe(true)

    await free.find('[data-test="profile-remove"]').trigger('click')
    expect(wrapper.find('[data-profile="libre"]').exists()).toBe(false)
  })

  it('bloque l’ajout d’emplacements à 256', async () => {
    const slots = Array.from({ length: 256 }, (_value, index) => ({ value: index, rgb: [0, 0, 0] }))
    await saveRoomHardwareConfig({
      lighting: {
        customProfiles: [
          {
            id: 'pleine',
            name: 'Pleine',
            kind: 'movingHead',
            channels: [{ role: 'colorWheel', slots }],
          },
        ],
      },
    })
    const wrapper = await openEditor()
    expect(wrapper.findAll('[data-test="slot"]')).toHaveLength(256)
    expect(wrapper.find('[data-test="slot-add"]').attributes('disabled')).toBeDefined()
  })

  it('donne un nom accessible aux champs du shutter et un numéro aux rôles', async () => {
    const wrapper = await openEditor()
    await copySpot(wrapper)

    const closed = wrapper.find('[data-test="shutter-closed"]').element as HTMLInputElement
    expect(closed.labels?.[0]?.textContent).toContain('Fermé')
    const open = wrapper.find('[data-test="shutter-open"]').element as HTMLInputElement
    expect(open.labels?.[0]?.textContent).toContain('Ouvert')
    expect(wrapper.find('select[aria-label="Rôle du canal 3"]').exists()).toBe(true)
  })
})
