import type {
  CreateRoomPayload,
  LoadCompanyRoomsResponse,
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
