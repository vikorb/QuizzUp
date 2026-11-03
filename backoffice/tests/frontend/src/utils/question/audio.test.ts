import { QUESTION_AUDIO_DEFAULT_MAX_BYTES } from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clampStartMs,
  formatAudioTime,
  formatFileSize,
  getAudioMimeType,
  isExcerptTooShort,
  measureAudioDurationMs,
  validateAudioFile,
} from '@/utils/question/audio'

function file(name: string, type: string, size = 1024) {
  return { name, type, size }
}

describe('utils/question/audio — getAudioMimeType', () => {
  it('uses the browser type, including the audio/mp3 alias', () => {
    expect(getAudioMimeType(file('a.bin', 'audio/mpeg'))).toBe('audio/mpeg')
    expect(getAudioMimeType(file('a.bin', 'audio/mp3'))).toBe('audio/mpeg')
    expect(getAudioMimeType(file('a.bin', 'audio/ogg'))).toBe('audio/ogg')
  })

  it('falls back on the extension when the type is empty', () => {
    expect(getAudioMimeType(file('Extrait.MP3', ''))).toBe('audio/mpeg')
    expect(getAudioMimeType(file('extrait.oga', ''))).toBe('audio/ogg')
    expect(getAudioMimeType(file('extrait.wav', 'audio/wav'))).toBeNull()
  })
})

describe('utils/question/audio — validateAudioFile', () => {
  it('accepts mp3 and ogg under the size limit', () => {
    expect(validateAudioFile(file('a.mp3', 'audio/mpeg'))).toBeNull()
  })

  it('reports invalid, empty and too large files', () => {
    expect(validateAudioFile(file('a.wav', 'audio/wav'))).toBe('audioTypeInvalid')
    expect(validateAudioFile(file('a.mp3', 'audio/mpeg', 0))).toBe('audioEmpty')
    expect(
      validateAudioFile(file('a.mp3', 'audio/mpeg', QUESTION_AUDIO_DEFAULT_MAX_BYTES + 1))
    ).toBe('audioTooLarge')
  })
})

describe('utils/question/audio — formatting', () => {
  it('formats times as m:ss.d', () => {
    expect(formatAudioTime(0)).toBe('0:00.0')
    expect(formatAudioTime(83_450)).toBe('1:23.4')
    expect(formatAudioTime(null)).toBe('0:00.0')
    expect(formatAudioTime(-5)).toBe('0:00.0')
  })

  it('formats file sizes in Ko / Mo', () => {
    expect(formatFileSize(0)).toBe('0 Ko')
    expect(formatFileSize(300)).toBe('1 Ko')
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10,0 Mo')
  })
})

describe('utils/question/audio — start point', () => {
  it('rounds to the slider step and stays inside the file', () => {
    expect(clampStartMs(1234, 60_000)).toBe(1200)
    expect(clampStartMs(70_000, 60_000)).toBe(59_900)
    expect(clampStartMs(-10, 60_000)).toBe(0)
    expect(clampStartMs(Number.NaN, null)).toBe(0)
    expect(clampStartMs(5050, null)).toBe(5100)
  })

  it('flags excerpts shorter than the longest blind test step', () => {
    expect(isExcerptTooShort(45_000, 60_000)).toBe(true)
    expect(isExcerptTooShort(40_000, 60_000)).toBe(false)
    expect(isExcerptTooShort(0, null)).toBe(false)
  })
})

describe('utils/question/audio — measureAudioDurationMs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves null when the browser cannot read the metadata in time', async () => {
    vi.useFakeTimers()

    const promise = measureAudioDurationMs('blob:fake', 50)
    vi.advanceTimersByTime(60)

    await expect(promise).resolves.toBeNull()
  })

  it('reads the duration from loadedmetadata', async () => {
    const listeners: Record<string, () => void> = {}
    const fakeAudio = {
      duration: 31.25,
      preload: '',
      src: '',
      addEventListener: (event: string, listener: () => void) => {
        listeners[event] = listener
      },
      removeAttribute: vi.fn(),
    }

    vi.stubGlobal(
      'Audio',
      vi.fn(function fakeAudioConstructor() {
        return fakeAudio
      })
    )

    const promise = measureAudioDurationMs('blob:fake')
    listeners.loadedmetadata?.()

    await expect(promise).resolves.toBe(31_250)
    vi.unstubAllGlobals()
  })
})
