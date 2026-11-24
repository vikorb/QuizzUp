import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { ROOM_PRESENCE, type RoomDiagnostics, type RoomStatusReport } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { getRoomDiagnosticRows } from '@/utils/room/diagnostics'

const diagnostics: RoomDiagnostics = {
  appVersion: '0.1.0',
  buzzerSource: 'gamepad',
  gamepadCount: 2,
  lightingDriver: 'artnet-bridge',
  lightingStatus: 'open',
  smokeEnabled: true,
  smokeArmed: false,
  lastErrorAt: '2026-11-24T09:30:00.000Z',
}

const status: RoomStatusReport = {
  screen: 'lobby',
  gameId: null,
  phase: null,
  round: null,
  questionIndex: null,
  miniGame: null,
  paused: false,
  scores: [],
  audioReady: true,
  diagnostics,
}

type LiveRoom = ReturnType<typeof createRoomLive>

const rowsOf = (room: LiveRoom | null, uncertain = false) =>
  getRoomDiagnosticRows(room, uncertain, tWithParamsMock, 'en')

const byId = (rows: ReturnType<typeof rowsOf>) =>
  Object.fromEntries(rows.map((row) => [row.id, row]))

/** Une salle en ligne dont le diagnostic est `change` par-dessus celui de départ. */
const roomWith = (change: Partial<RoomDiagnostics>, audioReady = true): LiveRoom =>
  createRoomLive({ status: { ...status, audioReady, diagnostics: { ...diagnostics, ...change } } })

const UNKNOWN = { value: 'rooms.diagnostic.unknown', tone: 'muted' }

describe('utils/room/diagnostics', () => {
  it('writes one readable row per element for an online room', () => {
    const rows = byId(rowsOf(createRoomLive({ status })))

    expect(rows.appVersion).toMatchObject({ value: '0.1.0', tone: null })
    expect(rows.buzzers).toMatchObject({
      value: 'rooms.diagnostic.buzzers.gamepad:{"count":2}',
      tone: 'ok',
    })
    expect(rows.lights).toMatchObject({ tone: 'ok' })
    expect(rows.lights?.value).toContain('rooms.diagnostic.lights.drivers.artnet-bridge')
    expect(rows.lights?.value).toContain('rooms.diagnostic.lights.statuses.open')
    expect(rows.smoke).toMatchObject({ value: 'rooms.diagnostic.smoke.enabled', tone: 'ok' })
    expect(rows.audio).toMatchObject({ value: 'rooms.diagnostic.audio.ready', tone: 'ok' })
    expect(rows.lastError?.tone).toBe('warn')
    // La date s'écrit pour la langue demandée, jamais en ISO brut.
    expect(rows.lastError?.value).not.toContain('2026-11-24T')
  })

  it('also reads the diagnostics of a room in a game', () => {
    const rows = byId(rowsOf(createRoomLive({ presence: ROOM_PRESENCE.IN_GAME, status })))

    expect(rows.appVersion?.value).toBe('0.1.0')
  })

  it.each([
    ['the room is offline', createRoomLive({ presence: ROOM_PRESENCE.OFFLINE, status }), false],
    ['the live stream is not open', createRoomLive({ status }), true],
    ['the room is not in the live list', null, false],
    ['the room never sent a report', createRoomLive({ status: null }), false],
  ])('answers unknown for every element when %s', (_label, room, uncertain) => {
    const rows = rowsOf(room, uncertain)

    expect(rows).toHaveLength(6)
    rows.forEach((row) => expect(row).toMatchObject(UNKNOWN))
  })

  it('answers unknown for the hardware of an old room screen, but still shows its audio', () => {
    const { diagnostics: _omitted, ...oldStatus } = status
    const rows = byId(rowsOf(createRoomLive({ status: oldStatus })))

    expect(rows.audio).toMatchObject({ value: 'rooms.diagnostic.audio.ready', tone: 'ok' })
    for (const id of ['appVersion', 'buzzers', 'lights', 'smoke', 'lastError'] as const) {
      expect(rows[id]).toMatchObject(UNKNOWN)
    }
  })

  it('warns about a gamepad source with no gamepad, and writes the keyboard source plainly', () => {
    const noPad = byId(rowsOf(roomWith({ gamepadCount: 0 })))
    const keyboard = byId(rowsOf(roomWith({ buzzerSource: 'keyboard', gamepadCount: 0 })))

    expect(noPad.buzzers).toMatchObject({
      value: 'rooms.diagnostic.buzzers.gamepadNone',
      tone: 'warn',
    })
    expect(keyboard.buzzers).toMatchObject({
      value: 'rooms.diagnostic.buzzers.keyboard',
      tone: 'ok',
    })
  })

  it.each([
    ['open', 'ok'],
    ['opening', 'warn'],
    ['closing', 'warn'],
    ['error', 'danger'],
    ['closed', 'muted'],
    [null, 'muted'],
  ] as const)('gives the lights status %s the tone %s', (lightingStatus, tone) => {
    const rows = byId(rowsOf(roomWith({ lightingStatus })))

    expect(rows.lights?.tone).toBe(tone)
    expect(rows.lights?.value).toContain(
      `rooms.diagnostic.lights.statuses.${lightingStatus ?? 'unknown'}`
    )
  })

  it.each([
    [false, false, 'disabled', 'muted'],
    [true, false, 'enabled', 'ok'],
    [true, true, 'armed', 'warn'],
  ] as const)(
    'writes the smoke (enabled %s, armed %s) as %s',
    (smokeEnabled, smokeArmed, key, tone) => {
      const rows = byId(rowsOf(roomWith({ smokeEnabled, smokeArmed })))

      expect(rows.smoke).toMatchObject({ value: `rooms.diagnostic.smoke.${key}`, tone })
    }
  )

  it('shows Unknown for a field the server could not read (null), never a default', () => {
    const rows = byId(
      rowsOf(
        roomWith({
          appVersion: null,
          buzzerSource: null,
          lightingDriver: null,
          smokeEnabled: null,
        })
      )
    )

    for (const id of ['appVersion', 'buzzers', 'lights', 'smoke'] as const) {
      expect(rows[id]).toMatchObject(UNKNOWN)
    }
    // Les champs lisibles restent affichés.
    expect(rows.audio?.value).toBe('rooms.diagnostic.audio.ready')
    expect(rows.lastError?.tone).toBe('warn')
  })

  it('keeps what is known of a row when only a part of it is unknown', () => {
    const gamepad = byId(rowsOf(roomWith({ gamepadCount: null })))
    // Fumée autorisée mais armement inconnu : jamais « non armée » par défaut.
    const smoke = byId(rowsOf(roomWith({ smokeEnabled: true, smokeArmed: null })))
    const disabled = byId(rowsOf(roomWith({ smokeEnabled: false, smokeArmed: null })))

    expect(gamepad.buzzers?.value).toBe('rooms.diagnostic.buzzers.gamepadUnknown')
    expect(smoke.smoke).toMatchObject(UNKNOWN)
    expect(disabled.smoke?.value).toBe('rooms.diagnostic.smoke.disabled')
  })

  it('says no error happened when the room has none, and warns about a waiting audio', () => {
    const rows = byId(rowsOf(roomWith({ lastErrorAt: null }, false)))

    expect(rows.lastError).toMatchObject({ value: 'rooms.diagnostic.lastError.none', tone: 'ok' })
    expect(rows.audio).toMatchObject({ value: 'rooms.diagnostic.audio.waiting', tone: 'warn' })
  })
})
