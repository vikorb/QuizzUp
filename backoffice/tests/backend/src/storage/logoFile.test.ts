import { describe, expect, it } from 'vitest'

import { detectLogoMimeType } from '@backend/storage/logoFile'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
])

describe('storage/logoFile — detectLogoMimeType', () => {
  it('recognizes png, jpeg and webp from their first bytes', () => {
    expect(detectLogoMimeType(PNG)).toBe('image/png')
    expect(detectLogoMimeType(JPEG)).toBe('image/jpeg')
    expect(detectLogoMimeType(WEBP)).toBe('image/webp')
  })

  it('refuses svg, text and other containers', () => {
    expect(detectLogoMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(detectLogoMimeType(Buffer.from('<?xml version="1.0"?><svg/>'))).toBeNull()
    expect(detectLogoMimeType(Buffer.from('GIF89a\u0001\u0000'))).toBeNull()
    expect(detectLogoMimeType(Buffer.from('#!/bin/sh\nrm -rf /'))).toBeNull()
  })

  it('refuses a RIFF container that is not webp (wav, avi)', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')])

    expect(detectLogoMimeType(wav)).toBeNull()
  })

  it('refuses truncated signatures and empty content', () => {
    expect(detectLogoMimeType(Buffer.alloc(0))).toBeNull()
    expect(detectLogoMimeType(PNG.subarray(0, 7))).toBeNull()
    expect(detectLogoMimeType(JPEG.subarray(0, 2))).toBeNull()
    expect(detectLogoMimeType(WEBP.subarray(0, 11))).toBeNull()
  })
})
