import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { BridgeOptions } from './options.js'
import { HELP_TEXT, OptionsError, parseCliArgs } from './options.js'
import type { BridgeServer } from './server.js'
import { createBridgeServer } from './server.js'

export type CliIo = {
  out: (line: string) => void
  err: (line: string) => void
  env: Record<string, string | undefined>
  readFile: (path: string) => string
  /** Abonne l'arrêt (Ctrl+C, arrêt du service) ; renvoyé pour les tests. */
  onShutdown: (handler: () => void) => void
  createServer?: (
    options: BridgeOptions & { version: string; log: (line: string) => void }
  ) => BridgeServer
}

/** Version injectée par `scripts/build-sea.mjs` : dans l'exécutable, il n'y a pas de `package.json`. */
declare const BUNDLED_VERSION: string | undefined

/** Version du pont, lue dans `package.json` (une seule source de vérité). */
export function readVersion(
  read: (path: string) => string = (path) => readFileSync(path, 'utf8')
): string {
  if (typeof BUNDLED_VERSION === 'string') {
    return BUNDLED_VERSION
  }
  try {
    const raw = JSON.parse(read(fileURLToPath(new URL('../package.json', import.meta.url)))) as {
      version?: unknown
    }
    return typeof raw.version === 'string' ? raw.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const timestamp = () => new Date().toLocaleTimeString('fr-FR', { hour12: false })

/**
 * Point d'entrée de la ligne de commande. Renvoie le code de sortie (0 = aide/version, 1 =
 * erreur de configuration ou de démarrage) ; quand le pont tourne, la promesse se résout
 * seulement à l'arrêt.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const version = readVersion(io.readFile)
  let command: ReturnType<typeof parseCliArgs>
  try {
    command = parseCliArgs(argv, { env: io.env, readFile: io.readFile })
  } catch (error) {
    if (error instanceof OptionsError) {
      io.err(`Erreur : ${error.message}`)
      io.err('Aide : quizzup-artnet-bridge --help')
      return 1
    }
    throw error
  }
  if (command.kind === 'help') {
    io.out(HELP_TEXT)
    return 0
  }
  if (command.kind === 'version') {
    io.out(version)
    return 0
  }

  const log = (line: string) => io.out(`[${timestamp()}] ${line}`)
  const create = io.createServer ?? createBridgeServer
  const server = create({ ...command.options, version, log })
  try {
    await server.listen()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    io.err(
      code === 'EADDRINUSE'
        ? `Erreur : le port ${command.options.port} est déjà utilisé (un autre pont tourne-t-il déjà ?)`
        : code === 'EADDRNOTAVAIL'
          ? `Erreur : l'adresse --bind ${command.options.bind ?? ''} n'appartient pas à ce PC`
          : `Erreur au démarrage : ${(error as Error).message}`
    )
    await server.close().catch(() => undefined)
    return 1
  }

  return new Promise<number>((resolve) => {
    let stopping = false
    io.onShutdown(() => {
      if (stopping) {
        return
      }
      stopping = true
      log('Arrêt demandé : envoi du noir puis fermeture')
      void server.close().finally(() => resolve(0))
    })
  })
}
