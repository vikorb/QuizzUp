import { describe, expect, it } from 'vitest'

import {
  matchesAudioSignature,
  normalizeAudioMimeType,
  sanitizeOriginalName,
} from '@backend/storage/audioFile'

describe('storage/audioFile — normalizeAudioMimeType', () => {
  it('normalizes accepted formats', () => {
    expect(normalizeAudioMimeType('audio/mpeg')).toBe('audio/mpeg')
    expect(normalizeAudioMimeType('audio/MP3')).toBe('audio/mpeg')
    expect(normalizeAudioMimeType('audio/ogg; codecs=vorbis')).toBe('audio/ogg')
  })

  it('rejects other formats', () => {
    expect(normalizeAudioMimeType('audio/wav')).toBeNull()
    expect(normalizeAudioMimeType('application/json')).toBeNull()
    expect(normalizeAudioMimeType(undefined)).toBeNull()
  })
})

describe('storage/audioFile — matchesAudioSignature', () => {
  it('recognizes mp3 with an ID3 tag or a raw MPEG frame', () => {
    expect(matchesAudioSignature(Buffer.from([0x49, 0x44, 0x33, 0x03]), 'audio/mpeg')).toBe(true)
    expect(matchesAudioSignature(Buffer.from([0xff, 0xfb, 0x90, 0x64]), 'audio/mpeg')).toBe(true)
  })

  it('recognizes ogg', () => {
    expect(matchesAudioSignature(Buffer.from('OggS\u0000'), 'audio/ogg')).toBe(true)
  })

  it('rejects mismatching or too short content', () => {
    expect(matchesAudioSignature(Buffer.from('OggS'), 'audio/mpeg')).toBe(false)
    expect(matchesAudioSignature(Buffer.from([0x49, 0x44, 0x33, 0x03]), 'audio/ogg')).toBe(false)
    expect(matchesAudioSignature(Buffer.from('<svg>'), 'audio/mpeg')).toBe(false)
    expect(matchesAudioSignature(Buffer.from([0xff]), 'audio/mpeg')).toBe(false)
  })
})

describe('storage/audioFile — sanitizeOriginalName', () => {
  it('keeps only the base name without control characters', () => {
    expect(sanitizeOriginalName('C:\\Musique\\extrait.mp3')).toBe('extrait.mp3')
    expect(sanitizeOriginalName('../../a\u0000b.ogg')).toBe('ab.ogg')
  })

  it('returns null for empty values and truncates long names', () => {
    expect(sanitizeOriginalName('   ')).toBeNull()
    expect(sanitizeOriginalName(42)).toBeNull()
    expect(sanitizeOriginalName(`${'a'.repeat(300)}.mp3`)).toHaveLength(255)
  })
})
