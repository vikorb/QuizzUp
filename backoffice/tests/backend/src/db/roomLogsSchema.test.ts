import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  ROOM_LOG_APP_VERSION_MAX_LENGTH,
  ROOM_LOG_CODE_MAX_LENGTH,
  ROOM_LOG_CONTEXT_MAX_LENGTH,
  ROOM_LOG_LEVELS,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

/** Les contraintes de la migration `room_logs` restent alignées sur les constantes partagées. */
const migration = readFileSync(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124040000_create_room_logs.js'),
  'utf8'
)

describe('room_logs migration', () => {
  it('aligns the level CHECK with ROOM_LOG_LEVELS', () => {
    const listed = /level IN \(([^)]*)\)/.exec(migration)?.[1] ?? ''

    expect(listed.split(',').map((value) => value.trim().replaceAll("'", ''))).toEqual([
      ...ROOM_LOG_LEVELS,
    ])
  })

  it('aligns the column lengths and the context size with the shared limits', () => {
    expect(migration).toContain(`table.string('code', ${ROOM_LOG_CODE_MAX_LENGTH})`)
    expect(migration).toContain(`table.string('message', ${ROOM_LOG_MESSAGE_MAX_LENGTH})`)
    expect(migration).toContain(`table.string('app_version', ${ROOM_LOG_APP_VERSION_MAX_LENGTH})`)
    expect(migration).toContain(`length(context::text) <= ${ROOM_LOG_CONTEXT_MAX_LENGTH}`)
  })

  it('has a log, not a record: no status, and rows follow the room (CASCADE)', () => {
    expect(migration).not.toContain("'status'")
    expect(migration).toContain(".inTable('rooms').onDelete('CASCADE')")
    expect(migration).toContain(".inTable('companies').onDelete('CASCADE')")
  })
})
