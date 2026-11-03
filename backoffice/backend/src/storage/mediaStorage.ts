import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'

import { QUESTION_AUDIO_DEFAULT_MAX_BYTES } from '@quizzup/shared'

/**
 * Stockage des fichiers média (extraits audio des questions).
 *
 * V1 : disque du serveur (`MEDIA_STORAGE_DIR`, volume Docker). L'interface est volontairement
 * minimale pour pouvoir brancher plus tard un stockage objet compatible S3 sans toucher aux
 * routes. Les fichiers ne sont jamais servis directement : l'API vérifie les droits puis
 * renvoie le flux (cf. `GET /questions/:questionId/media`).
 */
export interface MediaStorage {
  save(key: string, content: Buffer): Promise<void>
  read(key: string): Promise<{ stream: Readable; size: number } | null>
  remove(key: string): Promise<void>
}

// Clé : `questions/<id>/<uuid>.<ext>`. Rien d'autre n'est accepté (pas de `..`, pas de `/`
// initial) pour qu'une clé ne puisse jamais sortir du dossier de stockage.
const MEDIA_KEY_PATTERN = /^questions\/\d+\/[0-9a-f-]{36}\.(mp3|ogg)$/

export function isValidMediaKey(key: unknown): key is string {
  return typeof key === 'string' && MEDIA_KEY_PATTERN.test(key)
}

export function buildQuestionMediaKey(questionId: number, extension: string): string {
  return `questions/${questionId}/${randomUUID()}.${extension}`
}

export function createDiskMediaStorage(rootDir: string): MediaStorage {
  const root = path.resolve(rootDir)

  function resolveKey(key: string): string {
    if (!isValidMediaKey(key)) {
      throw new Error(`Invalid media key: ${key}`)
    }

    return path.join(root, ...key.split('/'))
  }

  return {
    async save(key, content) {
      const filePath = resolveKey(key)
      const tempPath = `${filePath}.${randomUUID()}.tmp`

      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      // Écriture atomique : un fichier à moitié écrit n'est jamais lisible sous sa clé.
      await fs.promises.writeFile(tempPath, content)
      await fs.promises.rename(tempPath, filePath)
    },

    async read(key) {
      const filePath = resolveKey(key)
      const stats = await fs.promises.stat(filePath).catch(() => null)

      if (!stats?.isFile()) {
        return null
      }

      return { stream: fs.createReadStream(filePath), size: stats.size }
    },

    async remove(key) {
      await fs.promises.rm(resolveKey(key), { force: true })
    },
  }
}

export function getMediaStorageDir(): string {
  return process.env.MEDIA_STORAGE_DIR || path.resolve(process.cwd(), 'storage/media')
}

export function getMediaMaxBytes(): number {
  const value = Number(process.env.MEDIA_MAX_BYTES)

  return Number.isInteger(value) && value > 0 ? value : QUESTION_AUDIO_DEFAULT_MAX_BYTES
}

let mediaStorage: MediaStorage | null = null

export function getMediaStorage(): MediaStorage {
  mediaStorage ??= createDiskMediaStorage(getMediaStorageDir())

  return mediaStorage
}

/** Réservé aux tests : remplace le stockage (ou revient au disque avec `null`). */
export function setMediaStorage(storage: MediaStorage | null): void {
  mediaStorage = storage
}
