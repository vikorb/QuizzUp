import { Readable } from 'node:stream'

import type { MediaStorage } from '@backend/storage/mediaStorage'

export type MemoryMediaStorage = MediaStorage & { files: Map<string, Buffer>; removed: string[] }

/** Stockage média en mémoire : aucun fichier n'est écrit sur le disque. */
export function createMemoryMediaStorage(): MemoryMediaStorage {
  const files = new Map<string, Buffer>()
  const removed: string[] = []

  return {
    files,
    removed,
    async save(key, content) {
      files.set(key, Buffer.from(content))
    },
    async read(key) {
      const content = files.get(key)

      return content ? { stream: Readable.from(content), size: content.length } : null
    },
    async remove(key) {
      removed.push(key)
      files.delete(key)
    },
  }
}
