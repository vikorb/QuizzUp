import { ROOM_STATUS_INACTIVE } from '@quizzup/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as roomsServiceModule from '@/services/roomsService'

// Le setup global mocke le service : on teste ici l'implémentation réelle,
// en ne mockant que la couche HTTP (apiRequestJson).
const apiRequestJsonMock = vi.hoisted(() =>
  vi.fn(async (_options: Record<string, unknown>) => ({ ok: true, status: 200, data: {} }))
)

vi.mock('@/utils/api', () => ({
  apiRequestJson: apiRequestJsonMock,
}))

type RoomsServiceModule = typeof roomsServiceModule

async function loadService(): Promise<RoomsServiceModule> {
  return vi.importActual<RoomsServiceModule>('@/services/roomsService')
}

beforeEach(() => {
  apiRequestJsonMock.mockClear()
})

describe('services/roomsService.ts', () => {
  it('lists the rooms of a company', async () => {
    const { loadCompanyRoomsService } = await loadService()

    await loadCompanyRoomsService(7)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms',
      method: 'GET',
      authenticated: true,
    })
  })

  it('loads a single room', async () => {
    const { loadCompanyRoomService } = await loadService()

    await loadCompanyRoomService(7, 3)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms/3',
      method: 'GET',
      authenticated: true,
    })
  })

  it('creates a room with a JSON body', async () => {
    const { createCompanyRoomService } = await loadService()

    await createCompanyRoomService(7, { name: 'Salle Néon' })

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms',
      method: 'POST',
      authenticated: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Salle Néon' }),
    })
  })

  it('renames a room without sending its config', async () => {
    const { updateCompanyRoomService } = await loadService()

    await updateCompanyRoomService(7, 3, { name: 'Salle Arcade' })

    const options = apiRequestJsonMock.mock.calls[0]?.[0]

    expect(options).toMatchObject({
      path: '/companies/7/rooms/3',
      method: 'PATCH',
      authenticated: true,
    })
    expect(JSON.parse(String(options?.body))).toEqual({ name: 'Salle Arcade' })
  })

  it('updates the status of a room', async () => {
    const { updateRoomStatusService } = await loadService()

    await updateRoomStatusService(7, 3, ROOM_STATUS_INACTIVE)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms/3/status',
      method: 'PATCH',
      authenticated: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: ROOM_STATUS_INACTIVE }),
    })
  })

  it('soft-deletes a room', async () => {
    const { deleteRoomService } = await loadService()

    await deleteRoomService(7, 3)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms/3',
      method: 'DELETE',
      authenticated: true,
    })
  })

  it('loads the room account', async () => {
    const { loadRoomAccountService } = await loadService()

    await loadRoomAccountService(7, 3)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms/3/account',
      method: 'GET',
      authenticated: true,
    })
  })

  it('creates the room account with a JSON body', async () => {
    const { createRoomAccountService } = await loadService()

    await createRoomAccountService(7, 3, { username: 'salle-neon', password: 'Secret123!' })

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms/3/account',
      method: 'POST',
      authenticated: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'salle-neon', password: 'Secret123!' }),
    })
  })

  it('deletes the room account', async () => {
    const { deleteRoomAccountService } = await loadService()

    await deleteRoomAccountService(7, 3)

    expect(apiRequestJsonMock).toHaveBeenCalledWith({
      path: '/companies/7/rooms/3/account',
      method: 'DELETE',
      authenticated: true,
    })
  })
})
