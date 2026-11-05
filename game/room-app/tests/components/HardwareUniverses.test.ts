import { flushPromises } from '@vue/test-utils'

import { getRoomHardwareConfig, saveBuzzerKeymap } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { createFakeUsbPort, installFakeSerial, uninstallFakeSerial } from '../_helpers/fakeUsb'
import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
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

describe('assistant : univers DMX par appareil', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    installFakeSerial(createFakeUsbPort())
  })
  afterEach(() => uninstallFakeSerial())

  it('propose 16 univers en simulation et garde l’univers choisi', async () => {
    await saveBuzzerKeymap(fullKeymap())
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-assistant')
    await click(wrapper, 'assistant-next')
    await sel(wrapper, 'buzzer-source').setValue('gamepad')
    await sel(wrapper, 'gamepad-match').setValue('BU0836')
    await click(wrapper, 'assistant-next')
    await sel(wrapper, 'driver-simulation').setValue(true)
    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-fixtures').exists()).toBe(true)

    const universe = sel(wrapper, 'fixture-universe')
    expect(universe.findAll('option')).toHaveLength(16)

    await sel(wrapper, 'fixture-name').setValue('PAR salle')
    await click(wrapper, 'fixture-add')
    // Même adresse, autre univers : pas de conflit.
    await sel(wrapper, 'fixture-address').setValue(1)
    await universe.setValue(1)
    await sel(wrapper, 'fixture-name').setValue('PAR fond')
    await click(wrapper, 'fixture-add')
    expect(wrapper.text()).not.toContain('déjà utilisé')
    expect(sel(wrapper, 'fixture-list').text()).toContain('Univers 1')

    const list = sel(wrapper, 'fixture-list').text()
    expect(list).toContain('PAR salle')
    expect(list).toContain('PAR fond')
    expect(list.match(/Univers/g)).toHaveLength(1)
  })
})

/** Assistant ouvert sur l'étape « interface » (buzzers déjà appris). */
async function openInterfaceStep() {
  await saveBuzzerKeymap(fullKeymap())
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await click(wrapper, 'tab-assistant')
  await click(wrapper, 'assistant-next')
  await sel(wrapper, 'buzzer-source').setValue('gamepad')
  await sel(wrapper, 'gamepad-match').setValue('BU0836')
  await click(wrapper, 'assistant-next')
  return wrapper
}

describe('assistant : IP du nœud Art-Net', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    installFakeSerial(createFakeUsbPort())
  })
  afterEach(() => uninstallFakeSerial())

  it('affiche le champ seulement avec le pont Art-Net, et l’enregistre dans la config', async () => {
    const wrapper = await openInterfaceStep()
    expect(sel(wrapper, 'artnet-target').exists()).toBe(false)
    await sel(wrapper, 'driver-artnet-bridge').setValue(true)
    expect(sel(wrapper, 'artnet-target').exists()).toBe(true)

    await sel(wrapper, 'artnet-target').setValue('192.168.1.50')
    await sel(wrapper, 'artnet-target').trigger('change')
    await flushPromises()
    expect(getRoomHardwareConfig().lighting.artnet).toEqual({ target: '192.168.1.50' })
    expect(sel(wrapper, 'artnet-invalid').exists()).toBe(false)

    // Vider le champ retire le réglage.
    await sel(wrapper, 'artnet-target').setValue('')
    await sel(wrapper, 'artnet-target').trigger('change')
    await flushPromises()
    expect(getRoomHardwareConfig().lighting.artnet).toBeUndefined()
  })

  it('refuse une IP publique ou illisible sans l’enregistrer', async () => {
    const wrapper = await openInterfaceStep()
    await sel(wrapper, 'driver-artnet-bridge').setValue(true)
    for (const value of ['8.8.8.8', 'noeud.local']) {
      await sel(wrapper, 'artnet-target').setValue(value)
      await sel(wrapper, 'artnet-target').trigger('change')
      await flushPromises()
      expect(sel(wrapper, 'artnet-invalid').exists(), value).toBe(true)
      // La saisie refusée reste affichée pour être corrigée.
      expect((sel(wrapper, 'artnet-target').element as HTMLInputElement).value).toBe(value)
      expect(getRoomHardwareConfig().lighting.artnet).toBeUndefined()
    }
  })
})
