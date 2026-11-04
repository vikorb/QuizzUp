import { syncHardwareWithRoom } from '@/hardware/hardwareSync'
import {
  getHardwareSyncMeta,
  resetRoomHardware,
  saveBuzzerKeymap,
  saveRoomHardwareConfig,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { enterDemo, signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'

const SERVER_KEYMAP = Object.fromEntries([['KeyP', { desk: 2, button: 'B' } as const]])
const LOCAL_KEYMAP = Object.fromEntries([['KeyL', { desk: 3, button: 'A' } as const]])
const ROOM = { id: 1, name: 'Salle' }

function mockSave() {
  return vi.spyOn(roomApi, 'saveRoomConfig').mockResolvedValue({ ...ROOM, config: {} })
}

const ACCOUNT = { id: 10, companyId: 1, role: 'room' }

/** Rechargement de la page : la config repart de la copie locale, le compte est relu. */
async function reload(options: { offline?: boolean } = {}): Promise<void> {
  await resetRoomHardware()
  syncRoomAuth()
  if (!options.offline) {
    signIn('tok', ACCOUNT)
  }
}

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

  it('renvoie au démarrage une modification restée sur le PC faute de réseau', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({
      ...ROOM,
      config: { buzzers: { keymap: SERVER_KEYMAP } },
    })
    const save = mockSave()
    await syncHardwareWithRoom()

    save.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await saveBuzzerKeymap(LOCAL_KEYMAP)
    expect(getHardwareSyncMeta()).toMatchObject({ accountId: 10, pending: true })

    await reload()
    await syncHardwareWithRoom()

    const { hardware, syncStatus } = useRoomHardware()
    expect(hardware.value.config.buzzers.keymap).toEqual(LOCAL_KEYMAP)
    expect(save).toHaveBeenLastCalledWith(
      'tok',
      expect.objectContaining({ buzzers: { keymap: LOCAL_KEYMAP } })
    )
    expect(syncStatus.value).toBe('saved')
    expect(getHardwareSyncMeta().pending).toBe(false)
  })

  it('n’envoie jamais une config par défaut sur une salle vierge', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({ ...ROOM, config: {} })
    const save = mockSave()
    await syncHardwareWithRoom()
    expect(save).not.toHaveBeenCalled()
  })

  it('garde et envoie les réglages du PC quand le compte n’a qu’une config par défaut', async () => {
    localStorage.setItem(
      'quizzup_room_hardware',
      JSON.stringify({ buzzers: { keymap: LOCAL_KEYMAP } })
    )
    await reload()
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({
      ...ROOM,
      config: { version: 1, buzzers: { keymap: {} } },
    })
    const save = mockSave()

    await syncHardwareWithRoom()

    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(LOCAL_KEYMAP)
    expect(save).toHaveBeenCalledOnce()
    expect(getHardwareSyncMeta().accountId).toBe(10)
  })

  it('n’envoie pas à une salle la copie locale d’une autre salle', async () => {
    localStorage.setItem(
      'quizzup_room_hardware',
      JSON.stringify({ buzzers: { keymap: LOCAL_KEYMAP } })
    )
    localStorage.setItem(
      'quizzup_room_hardware_sync',
      JSON.stringify({ accountId: 7, pending: true })
    )
    await reload()
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({ ...ROOM, config: {} })
    const save = mockSave()

    await syncHardwareWithRoom()

    expect(save).not.toHaveBeenCalled()
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual({})
    expect(getHardwareSyncMeta()).toMatchObject({ accountId: 10, pending: false })
  })

  it('n’envoie rien à un autre compte tant que sa config n’a pas été relue', async () => {
    localStorage.setItem(
      'quizzup_room_hardware',
      JSON.stringify({ buzzers: { keymap: LOCAL_KEYMAP } })
    )
    localStorage.setItem(
      'quizzup_room_hardware_sync',
      JSON.stringify({ accountId: 7, pending: true })
    )
    await reload()
    vi.spyOn(roomApi, 'fetchRoomInfo').mockRejectedValue(new Error('offline'))
    const save = mockSave()

    await syncHardwareWithRoom()
    await saveBuzzerKeymap(SERVER_KEYMAP)

    expect(save).not.toHaveBeenCalled()
    expect(getHardwareSyncMeta()).toMatchObject({ accountId: 7, pending: false })
  })

  it('retrouve hors ligne le compte de la copie locale et la renvoie au retour du réseau', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValueOnce({
      ...ROOM,
      config: { buzzers: { keymap: SERVER_KEYMAP } },
    })
    const save = mockSave()
    await syncHardwareWithRoom()

    await reload({ offline: true })
    vi.spyOn(roomApi, 'fetchRoomInfo').mockRejectedValueOnce(new Error('offline'))
    await syncHardwareWithRoom()
    save.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await saveBuzzerKeymap(LOCAL_KEYMAP)
    expect(getHardwareSyncMeta()).toMatchObject({ accountId: 10, pending: true })

    await reload()
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValueOnce({
      ...ROOM,
      config: { buzzers: { keymap: SERVER_KEYMAP } },
    })
    await syncHardwareWithRoom()
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(LOCAL_KEYMAP)
    expect(save).toHaveBeenLastCalledWith(
      'tok',
      expect.objectContaining({ buzzers: { keymap: LOCAL_KEYMAP } })
    )
  })

  it('ne renvoie pas une config refusée au démarrage suivant', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({
      ...ROOM,
      config: { buzzers: { keymap: SERVER_KEYMAP } },
    })
    const save = mockSave()
    await syncHardwareWithRoom()
    save.mockRejectedValueOnce(new roomApi.RoomApiError(400, 'room_config_too_large'))
    await saveBuzzerKeymap(LOCAL_KEYMAP)
    expect(getHardwareSyncMeta().pending).toBe(false)

    await reload()
    await syncHardwareWithRoom()
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(SERVER_KEYMAP)
  })

  it('ignore la config relue si le PC a enregistré pendant la lecture', async () => {
    let answer: ((room: roomApi.RoomInfo) => void) | undefined
    vi.spyOn(roomApi, 'fetchRoomInfo').mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    mockSave()

    const syncing = syncHardwareWithRoom()
    await saveBuzzerKeymap(LOCAL_KEYMAP)
    answer?.({ ...ROOM, config: { buzzers: { keymap: SERVER_KEYMAP } } })
    await syncing

    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(LOCAL_KEYMAP)
  })

  it('distingue une config refusée par le backoffice d’une coupure réseau', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({ ...ROOM, config: {} })
    vi.spyOn(roomApi, 'saveRoomConfig').mockRejectedValue(
      new roomApi.RoomApiError(400, 'room_config_too_large')
    )
    await syncHardwareWithRoom()
    await saveBuzzerKeymap(LOCAL_KEYMAP)
    expect(useRoomHardware().syncStatus.value).toBe('rejected')
  })

  it('envoie les enregistrements un par un, dans l’ordre', async () => {
    vi.spyOn(roomApi, 'fetchRoomInfo').mockResolvedValue({ ...ROOM, config: {} })
    const order: string[] = []
    let release: (() => void) | undefined
    vi.spyOn(roomApi, 'saveRoomConfig').mockImplementation(async (_token, config) => {
      const keys = Object.keys((config as { buzzers: { keymap: object } }).buzzers.keymap)
      order.push(`start ${keys.join()}`)
      if (order.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      order.push(`end ${keys.join()}`)
      return { ...ROOM, config: {} }
    })
    await syncHardwareWithRoom()

    const first = saveBuzzerKeymap(SERVER_KEYMAP)
    const second = saveRoomHardwareConfig({ buzzers: { keymap: LOCAL_KEYMAP } })
    await vi.waitFor(() => expect(order).toEqual(['start KeyP']))
    release?.()
    await Promise.all([first, second])

    expect(order).toEqual(['start KeyP', 'end KeyP', 'start KeyL', 'end KeyL'])
    expect(useRoomHardware().syncStatus.value).toBe('saved')
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
