import {
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
  type RoomStatus,
} from '@quizzup/shared'
import { vi } from 'vitest'

export type RoomMock = {
  id: number
  companyId: number
  name: string
  config: Record<string, unknown>
  status: RoomStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

type ServiceErrorResult = {
  ok: false
  error: string
}

export type LoadCompanyRoomsResult =
  | {
      ok: true
      data: {
        rooms: RoomMock[]
      }
    }
  | ServiceErrorResult

export type RoomResult =
  | {
      ok: true
      data: {
        room: RoomMock
      }
    }
  | ServiceErrorResult

export const roomsFixture: RoomMock[] = [
  {
    id: 1,
    companyId: 1,
    name: 'Salle Néon',
    config: { buzzers: 4 },
    status: ROOM_STATUS_ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 2,
    companyId: 1,
    name: 'Salle Arcade',
    config: {},
    status: ROOM_STATUS_INACTIVE,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 3,
    companyId: 1,
    name: 'Salle Fantôme',
    config: {},
    status: ROOM_STATUS_DELETED,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
    deletedAt: '2026-01-04T00:00:00.000Z',
  },
]

export const createdRoomFixture: RoomMock = {
  id: 42,
  companyId: 1,
  name: 'Salle Créée',
  config: {},
  status: ROOM_STATUS_ACTIVE,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  deletedAt: null,
}

export function createRoomFixture(overrides: Partial<RoomMock> = {}): RoomMock {
  return {
    ...createdRoomFixture,
    ...overrides,
  }
}

async function defaultLoadCompanyRooms(_companyId: number): Promise<LoadCompanyRoomsResult> {
  return {
    ok: true,
    data: {
      rooms: roomsFixture,
    },
  }
}

async function defaultLoadCompanyRoom(_companyId: number, roomId: number): Promise<RoomResult> {
  return {
    ok: true,
    data: {
      room: createRoomFixture({ id: roomId }),
    },
  }
}

async function defaultCreateCompanyRoom(
  companyId: number,
  payload: { name: string }
): Promise<RoomResult> {
  return {
    ok: true,
    data: {
      room: createRoomFixture({ companyId, name: payload.name }),
    },
  }
}

async function defaultUpdateCompanyRoom(
  companyId: number,
  roomId: number,
  payload: { name: string }
): Promise<RoomResult> {
  return {
    ok: true,
    data: {
      room: createRoomFixture({ id: roomId, companyId, name: payload.name }),
    },
  }
}

async function defaultUpdateRoomStatus(
  companyId: number,
  roomId: number,
  status: RoomStatus
): Promise<RoomResult> {
  return {
    ok: true,
    data: {
      room: createRoomFixture({
        id: roomId,
        companyId,
        status,
        deletedAt: status === ROOM_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
      }),
    },
  }
}

async function defaultDeleteRoom(companyId: number, roomId: number): Promise<RoomResult> {
  return defaultUpdateRoomStatus(companyId, roomId, ROOM_STATUS_DELETED)
}

export const loadCompanyRoomsServiceMock = vi.fn(defaultLoadCompanyRooms)
export const loadCompanyRoomServiceMock = vi.fn(defaultLoadCompanyRoom)
export const createCompanyRoomServiceMock = vi.fn(defaultCreateCompanyRoom)
export const updateCompanyRoomServiceMock = vi.fn(defaultUpdateCompanyRoom)
export const updateRoomStatusServiceMock = vi.fn(defaultUpdateRoomStatus)
export const deleteRoomServiceMock = vi.fn(defaultDeleteRoom)

export function mockLoadCompanyRoomsSuccess(rooms: RoomMock[] = roomsFixture): void {
  loadCompanyRoomsServiceMock.mockResolvedValue({
    ok: true,
    data: {
      rooms,
    },
  })
}

export function mockLoadCompanyRoomsFailure(error = 'server_error'): void {
  loadCompanyRoomsServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockCreateCompanyRoomFailure(error = 'server_error'): void {
  createCompanyRoomServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockUpdateCompanyRoomFailure(error = 'server_error'): void {
  updateCompanyRoomServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockUpdateRoomStatusFailure(error = 'server_error'): void {
  updateRoomStatusServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockDeleteRoomFailure(error = 'server_error'): void {
  deleteRoomServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function resetRoomsServiceMock(): void {
  loadCompanyRoomsServiceMock.mockReset()
  loadCompanyRoomServiceMock.mockReset()
  createCompanyRoomServiceMock.mockReset()
  updateCompanyRoomServiceMock.mockReset()
  updateRoomStatusServiceMock.mockReset()
  deleteRoomServiceMock.mockReset()

  loadCompanyRoomsServiceMock.mockImplementation(defaultLoadCompanyRooms)
  loadCompanyRoomServiceMock.mockImplementation(defaultLoadCompanyRoom)
  createCompanyRoomServiceMock.mockImplementation(defaultCreateCompanyRoom)
  updateCompanyRoomServiceMock.mockImplementation(defaultUpdateCompanyRoom)
  updateRoomStatusServiceMock.mockImplementation(defaultUpdateRoomStatus)
  deleteRoomServiceMock.mockImplementation(defaultDeleteRoom)
}
