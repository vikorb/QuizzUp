import type {
  CreateRoomAccountPayload,
  CreateRoomAccountResponse,
  CreateRoomPayload,
  DeleteRoomAccountResponse,
  LoadCompanyRoomsResponse,
  RoomAccountResponse,
  RoomResponse,
  RoomStatus,
  UpdateRoomPayload,
} from '@/types/room'
import { apiRequestJson } from '@/utils/api'

export function loadCompanyRoomsService(companyId: number) {
  return apiRequestJson<LoadCompanyRoomsResponse>({
    path: `/companies/${companyId}/rooms`,
    method: 'GET',
    authenticated: true,
  })
}

export function loadCompanyRoomService(companyId: number, roomId: number) {
  return apiRequestJson<RoomResponse>({
    path: `/companies/${companyId}/rooms/${roomId}`,
    method: 'GET',
    authenticated: true,
  })
}

export function createCompanyRoomService(companyId: number, payload: CreateRoomPayload) {
  return apiRequestJson<RoomResponse>({
    path: `/companies/${companyId}/rooms`,
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function updateCompanyRoomService(
  companyId: number,
  roomId: number,
  payload: UpdateRoomPayload
) {
  return apiRequestJson<RoomResponse>({
    path: `/companies/${companyId}/rooms/${roomId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function updateRoomStatusService(companyId: number, roomId: number, status: RoomStatus) {
  return apiRequestJson<RoomResponse>({
    path: `/companies/${companyId}/rooms/${roomId}/status`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  })
}

export function deleteRoomService(companyId: number, roomId: number) {
  return apiRequestJson<RoomResponse>({
    path: `/companies/${companyId}/rooms/${roomId}`,
    method: 'DELETE',
    authenticated: true,
  })
}

function roomAccountPath(companyId: number, roomId: number): string {
  return `/companies/${companyId}/rooms/${roomId}/account`
}

/** US-ROOM-02 : compte du PC de la salle (`account: null` si aucun compte). */
export function loadRoomAccountService(companyId: number, roomId: number) {
  return apiRequestJson<RoomAccountResponse>({
    path: roomAccountPath(companyId, roomId),
    method: 'GET',
    authenticated: true,
  })
}

export function createRoomAccountService(
  companyId: number,
  roomId: number,
  payload: CreateRoomAccountPayload
) {
  return apiRequestJson<CreateRoomAccountResponse>({
    path: roomAccountPath(companyId, roomId),
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

/** Supprime le compte et révoque ses sessions : le PC de la salle est déconnecté. */
export function deleteRoomAccountService(companyId: number, roomId: number) {
  return apiRequestJson<DeleteRoomAccountResponse>({
    path: roomAccountPath(companyId, roomId),
    method: 'DELETE',
    authenticated: true,
  })
}
