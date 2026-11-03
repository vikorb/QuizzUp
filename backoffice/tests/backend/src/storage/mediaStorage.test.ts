import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QUESTION_AUDIO_DEFAULT_MAX_BYTES } from '@quizzup/shared'
import {
  buildQuestionMediaKey,
  createDiskMediaStorage,
  getMediaMaxBytes,
  getMediaStorageDir,
  isValidMediaKey,
} from '@backend/storage/mediaStorage'

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer))
  }

  return Buffer.concat(chunks)
}

// `process.env.X = undefined` écrirait la chaîne "undefined" : on supprime la variable.
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('storage/mediaStorage — keys', () => {
  it('builds unique keys scoped to the question', () => {
    const first = buildQuestionMediaKey(12, 'mp3')
    const second = buildQuestionMediaKey(12, 'mp3')

    expect(first).toMatch(/^questions\/12\/[0-9a-f-]{36}\.mp3$/)
    expect(first).not.toBe(second)
    expect(isValidMediaKey(first)).toBe(true)
  })

  it('rejects keys that could escape the storage folder', () => {
    expect(isValidMediaKey('../etc/passwd')).toBe(false)
    expect(isValidMediaKey('/questions/1/a.mp3')).toBe(false)
    expect(isValidMediaKey('questions/1/../../x.mp3')).toBe(false)
    expect(isValidMediaKey('questions/1/00000000-0000-0000-0000-000000000000.exe')).toBe(false)
    expect(isValidMediaKey(null)).toBe(false)
  })
})

describe('storage/mediaStorage — disk', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'quizzup-media-'))
  })

  afterEach(async () => {
    await fs.promises.rm(rootDir, { recursive: true, force: true })
  })

  it('saves, reads and removes a file', async () => {
    const storage = createDiskMediaStorage(rootDir)
    const key = buildQuestionMediaKey(3, 'ogg')
    const content = Buffer.from('OggS-content')

    await storage.save(key, content)

    const file = await storage.read(key)

    expect(file?.size).toBe(content.length)
    expect(await readStream(file!.stream)).toEqual(content)
    expect(fs.existsSync(path.join(rootDir, key))).toBe(true)

    await storage.remove(key)

    expect(await storage.read(key)).toBeNull()
  })

  it('leaves no temporary file behind', async () => {
    const storage = createDiskMediaStorage(rootDir)
    const key = buildQuestionMediaKey(3, 'mp3')

    await storage.save(key, Buffer.from('ID3'))

    expect(await fs.promises.readdir(path.join(rootDir, 'questions/3'))).toEqual([
      path.basename(key),
    ])
  })

  it('returns null for a missing file and ignores removing it', async () => {
    const storage = createDiskMediaStorage(rootDir)
    const key = buildQuestionMediaKey(4, 'mp3')

    expect(await storage.read(key)).toBeNull()
    await expect(storage.remove(key)).resolves.toBeUndefined()
  })

  it('refuses invalid keys', async () => {
    const storage = createDiskMediaStorage(rootDir)

    await expect(storage.save('../evil.mp3', Buffer.from('x'))).rejects.toThrow()
    await expect(storage.read('../evil.mp3')).rejects.toThrow()
  })
})

describe('storage/mediaStorage — configuration', () => {
  const previousDir = process.env.MEDIA_STORAGE_DIR
  const previousMax = process.env.MEDIA_MAX_BYTES

  afterEach(() => {
    restoreEnv('MEDIA_STORAGE_DIR', previousDir)
    restoreEnv('MEDIA_MAX_BYTES', previousMax)
  })

  it('reads the folder and the size limit from the environment', () => {
    process.env.MEDIA_STORAGE_DIR = '/data/media'
    process.env.MEDIA_MAX_BYTES = '2048'

    expect(getMediaStorageDir()).toBe('/data/media')
    expect(getMediaMaxBytes()).toBe(2048)
  })

  it('falls back to defaults', () => {
    process.env.MEDIA_STORAGE_DIR = ''
    process.env.MEDIA_MAX_BYTES = 'abc'

    expect(getMediaStorageDir()).toBe(path.resolve(process.cwd(), 'storage/media'))
    expect(getMediaMaxBytes()).toBe(QUESTION_AUDIO_DEFAULT_MAX_BYTES)
  })
})
