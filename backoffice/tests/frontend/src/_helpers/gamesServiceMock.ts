import {
  GAME_STATE_ABORTED,
  GAME_STATE_CANCELLED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  ROOM_SCHEDULE_DAYS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
  type RoomSchedule,
  type RoomScheduleDay,
} from '@quizzup/shared'
import { vi } from 'vitest'

import type {
  Game,
  GameJoin,
  GameParticipant,
  GameRegistration,
  GameRoom,
  GamesQuery,
} from '@/types/game'

type ServiceErrorResult = {
  ok: false
  status: number | null
  error: string
}

type GamesResult =
  { ok: true; status: number; data: { games: Game[]; total: number } } | ServiceErrorResult
type GameResult = { ok: true; status: number; data: { game: Game } } | ServiceErrorResult
type RoomsResult = { ok: true; status: number; data: { rooms: GameRoom[] } } | ServiceErrorResult

type JoinResult = { ok: true; status: number; data: { join: GameJoin } } | ServiceErrorResult
type RegistrationsResult =
  { ok: true; status: number; data: { registrations: GameRegistration[] } } | ServiceErrorResult
type EmptyResult = { ok: true; status: number; data: undefined } | ServiceErrorResult

export function createRegistrationFixture(
  overrides: Partial<GameRegistration> = {}
): GameRegistration {
  return {
    id: 1,
    createdAt: '2026-11-03T10:05:00.000Z',
    displayName: 'Les Fusées',
    email: null,
    hasEmail: false,
    marketingConsent: false,
    secondPlayer: null,
    ...overrides,
  }
}

/** SVG minimal avec des caractères qui exigent l'encodage d'une adresse `data:` (`#`, `<`, espaces). */
export const JOIN_QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path fill="#000" d="M0 0h1v1H0z"/></svg>'

export function createJoinFixture(overrides: Partial<GameJoin> = {}): GameJoin {
  return {
    url: 'https://quizz.example/rejoindre/#jeton',
    qrSvg: JOIN_QR_SVG,
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function createParticipantFixture(
  overrides: Partial<GameParticipant> = {}
): GameParticipant {
  return {
    id: 1,
    podium: 1,
    displayName: 'Les Quizzeurs',
    email: null,
    hasEmail: false,
    consentAt: null,
    marketingConsent: false,
    secondPlayer: null,
    score: 0,
    ...overrides,
  }
}

export function createGameFixture(overrides: Partial<Game> = {}): Game {
  return {
    id: 1,
    companyId: 1,
    roomId: 10,
    roomName: 'Salle Néon',
    adminId: 2,
    roundsCount: 10,
    questionsPerRound: 10,
    seed: 42,
    state: GAME_STATE_PENDING,
    startedAt: null,
    finishedAt: null,
    status: GAME_STATUS_ACTIVE,
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: null,
    participantsCount: 2,
    ...overrides,
  }
}

export const gamesFixture: Game[] = [
  createGameFixture({ id: 4, state: GAME_STATE_PENDING, roomName: 'Salle Néon' }),
  createGameFixture({
    id: 3,
    state: GAME_STATE_RUNNING,
    roomName: 'Salle Laser',
    roomId: 11,
    startedAt: '2026-11-03T09:00:00.000Z',
  }),
  createGameFixture({
    id: 2,
    state: GAME_STATE_FINISHED,
    startedAt: '2026-11-02T21:17:53.000Z',
    finishedAt: '2026-11-02T22:00:00.000Z',
    durationSeconds: 2527,
    topScore: 30,
  }),
  createGameFixture({ id: 1, state: GAME_STATE_ABORTED }),
]

export const roomsFixture: GameRoom[] = [
  { id: 10, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE, desksCount: 4 },
  { id: 11, name: 'Salle Laser', status: ROOM_STATUS_ACTIVE, desksCount: 6 },
  { id: 12, name: 'Salle fermée', status: ROOM_STATUS_INACTIVE },
]

/** Horaire identique les 7 jours : créneaux d'une heure, sans pause, à l'heure locale de la salle. */
export function createScheduleFixture(
  hours: RoomScheduleDay = { opensAt: '10:00', closesAt: '14:00' },
  timezone = 'Europe/Paris'
): RoomSchedule {
  return {
    timezone,
    slotMinutes: 60,
    breakMinutes: 0,
    bookableDesks: 4,
    publicBooking: false,
    days: Object.fromEntries(ROOM_SCHEDULE_DAYS.map((day) => [day, hours])),
  }
}

/** Session programmée, créneau d'une heure (début et fin en UTC). */
export function createScheduledGameFixture(startsAt: string, overrides: Partial<Game> = {}): Game {
  return createGameFixture({
    state: GAME_STATE_SCHEDULED,
    scheduledAt: startsAt,
    scheduledEndAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    ...overrides,
  })
}

export const listGamesServiceMock = vi.fn(
  async (_companyId: number, _query?: GamesQuery): Promise<GamesResult> => ({
    ok: true,
    status: 200,
    data: { games: gamesFixture, total: gamesFixture.length },
  })
)

export const loadGameServiceMock = vi.fn(
  async (_companyId: number, gameId: number): Promise<GameResult> => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId }) },
  })
)

export const createGameServiceMock = vi.fn(
  async (_companyId: number, _payload: unknown): Promise<GameResult> => ({
    ok: true,
    status: 201,
    data: { game: createGameFixture({ id: 99 }) },
  })
)

export const updateGameServiceMock = vi.fn(
  async (_companyId: number, gameId: number, _payload: unknown): Promise<GameResult> => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId, state: GAME_STATE_SCHEDULED }) },
  })
)

export const abortGameServiceMock = vi.fn(
  async (_companyId: number, gameId: number): Promise<GameResult> => ({
    ok: true,
    status: 200,
    data: {
      game: createGameFixture({
        id: gameId,
        state: GAME_STATE_ABORTED,
        finishedAt: '2026-11-03T11:00:00.000Z',
      }),
    },
  })
)

export const openGameServiceMock = vi.fn(
  async (_companyId: number, gameId: number): Promise<GameResult> => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId, state: GAME_STATE_PENDING }) },
  })
)

export const cancelGameServiceMock = vi.fn(
  async (_companyId: number, gameId: number): Promise<GameResult> => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId, state: GAME_STATE_CANCELLED }) },
  })
)

export const listGameRoomsServiceMock = vi.fn(async (_companyId: number): Promise<RoomsResult> => ({
  ok: true,
  status: 200,
  data: { rooms: roomsFixture },
}))

export const openGameJoinServiceMock = vi.fn(
  async (_companyId: number, _gameId: number): Promise<JoinResult> => ({
    ok: true,
    status: 200,
    data: { join: createJoinFixture() },
  })
)

export const closeGameJoinServiceMock = vi.fn(
  async (_companyId: number, _gameId: number): Promise<EmptyResult> => ({
    ok: true,
    status: 204,
    data: undefined,
  })
)

export const listGameRegistrationsServiceMock = vi.fn(
  async (_companyId: number, _gameId: number): Promise<RegistrationsResult> => ({
    ok: true,
    status: 200,
    data: { registrations: [] },
  })
)

export const acceptGameRegistrationServiceMock = vi.fn(
  async (
    _companyId: number,
    _gameId: number,
    _registrationId: number,
    _podium?: number
  ): Promise<{ ok: true; status: number; data: unknown } | ServiceErrorResult> => ({
    ok: true,
    status: 201,
    data: { participant: createParticipantFixture() },
  })
)

export const refuseGameRegistrationServiceMock = vi.fn(
  async (_companyId: number, _gameId: number, _registrationId: number): Promise<EmptyResult> => ({
    ok: true,
    status: 204,
    data: undefined,
  })
)

export function mockServiceFailure(
  mock:
    | typeof listGamesServiceMock
    | typeof loadGameServiceMock
    | typeof createGameServiceMock
    | typeof updateGameServiceMock
    | typeof abortGameServiceMock
    | typeof openGameServiceMock
    | typeof cancelGameServiceMock
    | typeof listGameRoomsServiceMock
    | typeof openGameJoinServiceMock
    | typeof closeGameJoinServiceMock
    | typeof listGameRegistrationsServiceMock
    | typeof acceptGameRegistrationServiceMock
    | typeof refuseGameRegistrationServiceMock,
  error = 'server_error',
  status: number | null = 500
): void {
  mock.mockResolvedValue({ ok: false, status, error })
}

export const gamesServiceModuleMock = {
  listGamesService: listGamesServiceMock,
  loadGameService: loadGameServiceMock,
  createGameService: createGameServiceMock,
  updateGameService: updateGameServiceMock,
  abortGameService: abortGameServiceMock,
  openGameService: openGameServiceMock,
  cancelGameService: cancelGameServiceMock,
  listGameRoomsService: listGameRoomsServiceMock,
  openGameJoinService: openGameJoinServiceMock,
  closeGameJoinService: closeGameJoinServiceMock,
  listGameRegistrationsService: listGameRegistrationsServiceMock,
  acceptGameRegistrationService: acceptGameRegistrationServiceMock,
  refuseGameRegistrationService: refuseGameRegistrationServiceMock,
}

export function resetGamesServiceMock(): void {
  listGamesServiceMock.mockReset()
  loadGameServiceMock.mockReset()
  createGameServiceMock.mockReset()
  updateGameServiceMock.mockReset()
  abortGameServiceMock.mockReset()
  openGameServiceMock.mockReset()
  cancelGameServiceMock.mockReset()
  listGameRoomsServiceMock.mockReset()
  openGameJoinServiceMock.mockReset()
  closeGameJoinServiceMock.mockReset()
  listGameRegistrationsServiceMock.mockReset()
  acceptGameRegistrationServiceMock.mockReset()
  refuseGameRegistrationServiceMock.mockReset()

  listGamesServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { games: gamesFixture, total: gamesFixture.length },
  })
  loadGameServiceMock.mockImplementation(async (_companyId, gameId) => ({
    ok: true,
    status: 200,
    data: {
      game: createGameFixture({
        id: gameId,
        participants: [
          createParticipantFixture({ id: 2, podium: 2, displayName: 'Team B', score: 7 }),
          createParticipantFixture({
            id: 1,
            podium: 1,
            displayName: 'Team A',
            email: 'a@quizzup.test',
            hasEmail: true,
            consentAt: '2026-11-03T10:00:00.000Z',
            score: 12,
          }),
        ],
      }),
    },
  }))
  createGameServiceMock.mockResolvedValue({
    ok: true,
    status: 201,
    data: { game: createGameFixture({ id: 99 }) },
  })
  updateGameServiceMock.mockImplementation(async (_companyId, gameId) => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId, state: GAME_STATE_SCHEDULED }) },
  }))
  abortGameServiceMock.mockImplementation(async (_companyId, gameId) => ({
    ok: true,
    status: 200,
    data: {
      game: createGameFixture({
        id: gameId,
        state: GAME_STATE_ABORTED,
        finishedAt: '2026-11-03T11:00:00.000Z',
      }),
    },
  }))
  openGameServiceMock.mockImplementation(async (_companyId, gameId) => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId, state: GAME_STATE_PENDING }) },
  }))
  cancelGameServiceMock.mockImplementation(async (_companyId, gameId) => ({
    ok: true,
    status: 200,
    data: { game: createGameFixture({ id: gameId, state: GAME_STATE_CANCELLED }) },
  }))
  listGameRoomsServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { rooms: roomsFixture },
  })
  openGameJoinServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { join: createJoinFixture() },
  })
  closeGameJoinServiceMock.mockResolvedValue({ ok: true, status: 204, data: undefined })
  listGameRegistrationsServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { registrations: [] },
  })
  acceptGameRegistrationServiceMock.mockResolvedValue({
    ok: true,
    status: 201,
    data: { participant: createParticipantFixture() },
  })
  refuseGameRegistrationServiceMock.mockResolvedValue({ ok: true, status: 204, data: undefined })
}
