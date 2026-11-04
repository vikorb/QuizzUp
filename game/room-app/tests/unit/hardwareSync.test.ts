import { syncHardwareWithRoom } from '@/hardware/hardwareSync'
import { saveBuzzerKeymap, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'

const SERVER_KEYMAP = Object.fromEntries([['KeyP', { desk: 2, button: 'B' } as const]])

describe('config matérielle sur le compte de la salle', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    signIn('tok', { id: 10, companyId: 1, role: 'room' })
  })

  afterEach(() => vi.restoreAllMocks())

  it('applique la config du backoffice puis y enregistre les modifications', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({
      id: 1,
      name: 'Salle',
      config: { buzzers: { keymap: SERVER_KEYMAP } },
    })
    const save = vi.spyOn(roomApi, 'saveRoomConfig').mockResolvedValue({
      id: 1,
      name: 'Salle',
      config: {},
    })

    await syncHardwareWithRoom()
    const { hardware, syncStatus } = useRoomHardware()
    expect(hardware.value.config.buzzers.keymap).toEqual(SERVER_KEYMAP)
    expect(syncStatus.value).toBe('saved')
    expect(save).not.toHaveBeenCalled()

    await saveBuzzerKeymap({})
    expect(save).toHaveBeenCalledWith('tok', expect.objectContaining({ buzzers: { keymap: {} } }))
    expect(syncStatus.value).toBe('saved')

    save.mockRejectedValueOnce(new Error('offline'))
    await saveBuzzerKeymap(SERVER_KEYMAP)
    expect(syncStatus.value).toBe('error')
    expect(localStorage.getItem('quizzup_room_hardware')).toContain('KeyP')
  })

  it('remonte la config du PC quand la salle est vierge, et ne touche à rien hors ligne', async () => {
    await saveBuzzerKeymap(SERVER_KEYMAP)
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValueOnce({ id: 1, name: 'Salle', config: {} })
    const save = vi.spyOn(roomApi, 'saveRoomConfig').mockResolvedValue({
      id: 1,
      name: 'Salle',
      config: {},
    })

    await syncHardwareWithRoom()
    expect(save).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ buzzers: { keymap: SERVER_KEYMAP } })
    )

    vi.spyOn(roomApi, 'fetchRoomInfo').mockRejectedValueOnce(new Error('offline'))
    await syncHardwareWithRoom()
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(SERVER_KEYMAP)
  })

  it('reste sur le PC en mode démo', async () => {
    enterDemo()
    const info = vi.spyOn(roomApi, 'fetchRoomInfo')
    await syncHardwareWithRoom()
    await saveBuzzerKeymap(SERVER_KEYMAP)
    expect(info).not.toHaveBeenCalled()
    expect(useRoomHardware().syncStatus.value).toBe('local')
  })
})
