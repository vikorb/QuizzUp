import { flushPromises } from '@vue/test-utils'

import { syncHardwareWithRoom } from '@/hardware/hardwareSync'
import { resetRoomHardware, saveBuzzerKeymap, useRoomHardware } from '@/hardware/roomHardware'
import { signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

/** Un buzzer par bouton pour les pupitres 1-4 (l'étape Buzzers n'a alors aucun blocage). */
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

const OTHER_STATION_KEYMAP = Object.fromEntries([['KeyP', { desk: 2, button: 'B' } as const]])

/** Salle connectée, config du compte (révision 1) reçue au démarrage. */
async function startOnline() {
  vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({
    id: 1,
    name: 'Salle',
    config: { buzzers: { keymap: fullKeymap() } },
    configRevision: 1,
  })
  await syncHardwareWithRoom()
}

/** Le prochain enregistrement tombe sur un 409 : un autre poste a enregistré avant. */
function otherStationSavedFirst() {
  vi.spyOn(roomApi, 'saveRoomConfig').mockRejectedValue(
    new roomApi.RoomApiError(409, 'room_config_conflict', {
      error: 'room_config_conflict',
      config: { buzzers: { keymap: OTHER_STATION_KEYMAP } },
      configRevision: 2,
    })
  )
}

describe('conflit de configuration entre deux postes', () => {
  beforeEach(async () => {
    localStorage.clear()
    await resetRoomHardware()
    syncRoomAuth()
    signIn('tok', { id: 10, companyId: 1, role: 'room' })
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'isSecureContext')
  })

  it("l'assistant repart de la config du compte et affiche le conflit", async () => {
    await startOnline()
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-assistant')
    await click(wrapper, 'assistant-next')
    expect(sel(wrapper, 'step-buzzers').exists()).toBe(true)
    expect(sel(wrapper, 'sync-conflict').exists()).toBe(false)

    otherStationSavedFirst()
    await saveBuzzerKeymap({})
    await flushPromises()

    expect(useRoomHardware().syncStatus.value).toBe('conflict')
    expect(sel(wrapper, 'step-browser').exists()).toBe(true)
    expect(sel(wrapper, 'sync-conflict').text()).toContain('modifiée depuis un autre poste')
  })

  it('la config avancée recharge le brouillon, sans « enregistré », avec le conflit', async () => {
    await startOnline()
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await click(wrapper, 'tab-advanced')
    const area = sel(wrapper, 'config-json')
    expect((area.element as HTMLTextAreaElement).value).toContain('KeyB')

    otherStationSavedFirst()
    const draft = JSON.parse((area.element as HTMLTextAreaElement).value)
    draft.buzzers.keymap = {}
    await area.setValue(JSON.stringify(draft))
    await click(wrapper, 'config-save')

    const text = (sel(wrapper, 'config-json').element as HTMLTextAreaElement).value
    expect(text).toContain('KeyP')
    expect(text).not.toContain('KeyB')
    expect(wrapper.find('.hw-ok').exists()).toBe(false)
    expect(sel(wrapper, 'sync-conflict').exists()).toBe(true)
  })
})
