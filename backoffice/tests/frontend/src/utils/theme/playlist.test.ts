import { describe, expect, it } from 'vitest'

import { extractPlaylistRef } from '@/utils/theme/playlist'

describe('utils/theme/playlist', () => {
  it.each([
    ['1234567', '1234567'],
    ['  1234567  ', '1234567'],
    ['https://www.deezer.com/fr/playlist/1234567', '1234567'],
    ['https://www.deezer.com/playlist/1234567?utm_source=deezer', '1234567'],
    ['https://api.deezer.com/playlist/1234567/tracks', '1234567'],
    ['12345678901234567890', '12345678901234567890'],
  ])('extracts %j as %j', (input, expected) => {
    expect(extractPlaylistRef(input)).toBe(expected)
  })

  it.each([
    [''],
    ['   '],
    ['pas un lien'],
    ['https://link.deezer.com/s/abc123'],
    ['https://www.deezer.com/fr/album/1234567'],
    ['https://www.deezer.com/fr/playlist/abc'],
    ['123456789012345678901'],
    ['https://www.deezer.com/fr/playlist/123456789012345678901'],
    ['12 34'],
  ])('rejects %j', (input) => {
    expect(extractPlaylistRef(input)).toBeNull()
  })
})
