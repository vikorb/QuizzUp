import { describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

const fakeDb = (name: string) => ({
  raw: async () => ({ rows: [{ current_database: name }] }),
})

describe('assertTestDatabase', () => {
  it.each(['quizzup', 'quizzup_backoffice', 'quizzup_test_backup', 'test'])(
    'refuse la base %s',
    async (name) => {
      await expect(assertTestDatabase(fakeDb(name))).rejects.toThrow(/refusé/)
    }
  )

  it.each(['quizzup_purge_test', 'quizzup_test'])('accepte la base %s', async (name) => {
    await expect(assertTestDatabase(fakeDb(name))).resolves.toBeUndefined()
  })
})
