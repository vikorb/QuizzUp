import { createServer } from 'node:net'

import type { CliIo } from '@bridge/cli'
import { readVersion, runCli } from '@bridge/cli'
import type { BridgeServer } from '@bridge/server'

const BASE = ['--target', '127.0.0.1', '--origin', 'https://salle.quizzup.fr']
const ARGS = [...BASE, '--port', '7654']

/** Port libre sur 127.0.0.1 (le pont refuse `--port 0`). */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()))
  const { port } = probe.address() as { port: number }
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

function io(overrides: Partial<CliIo> = {}) {
  const out: string[] = []
  const err: string[] = []
  let shutdown: (() => void) | null = null
  const value: CliIo = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
    readFile: () => JSON.stringify({ version: '1.2.3' }),
    onShutdown: (handler) => {
      shutdown = handler
    },
    ...overrides,
  }
  return { io: value, out, err, shutdown: () => shutdown?.() }
}

const fakeServer = (listen: () => Promise<number>) => {
  const close = vi.fn(async () => undefined)
  const server = { listen, close, core: {}, hasClient: () => false } as unknown as BridgeServer
  return { server, close }
}

describe('ligne de commande quizzup-artnet-bridge', () => {
  it('affiche l’aide et la version', async () => {
    const help = io()
    expect(await runCli(['--help'], help.io)).toBe(0)
    expect(help.out[0]).toContain('quizzup-artnet-bridge')
    const version = io()
    expect(await runCli(['--version'], version.io)).toBe(0)
    expect(version.out).toEqual(['1.2.3'])
  })

  it('lit la version du package', () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+$/)
    expect(readVersion(() => '{}')).toBe('0.0.0')
    expect(
      readVersion(() => {
        throw new Error('absent')
      })
    ).toBe('0.0.0')
  })

  it('explique une erreur de configuration et renvoie 1', async () => {
    const context = io()
    expect(await runCli(['--origin', 'https://a.fr'], context.io)).toBe(1)
    expect(context.err[0]).toContain('--target est obligatoire')
    expect(context.err[1]).toContain('--help')
  })

  it('tourne jusqu’à l’arrêt demandé, en horodatant le journal', async () => {
    const context = io()
    const running = runCli([...BASE, '--port', String(await freePort())], context.io)
    await vi.waitFor(() =>
      expect(context.out.some((line) => line.includes('ws://127.0.0.1:'))).toBe(true)
    )
    expect(context.out[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] /)
    context.shutdown()
    context.shutdown()
    expect(await running).toBe(0)
    expect(context.out.some((line) => line.includes('Arrêt demandé'))).toBe(true)
  })

  it('signale un port déjà utilisé', async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()))
    const { port } = blocker.address() as { port: number }
    const context = io()
    const args = [...BASE, '--port', String(port)]
    expect(await runCli(args, context.io)).toBe(1)
    expect(context.err[0]).toContain(`le port ${port} est déjà utilisé`)
    await new Promise<void>((resolve) => blocker.close(() => resolve()))
  })

  it('signale une adresse --bind étrangère et les autres erreurs de démarrage', async () => {
    const notAvailable = Object.assign(new Error('bind'), { code: 'EADDRNOTAVAIL' })
    const bound = fakeServer(() => Promise.reject(notAvailable))
    const context = io({ createServer: () => bound.server })
    expect(await runCli([...ARGS, '--bind', '10.9.9.9'], context.io)).toBe(1)
    expect(context.err[0]).toContain("l'adresse --bind 10.9.9.9 n'appartient pas à ce PC")
    expect(bound.close).toHaveBeenCalled()

    const other = fakeServer(() => Promise.reject(new Error('boum')))
    const otherContext = io({ createServer: () => other.server })
    expect(await runCli(ARGS, otherContext.io)).toBe(1)
    expect(otherContext.err[0]).toBe('Erreur au démarrage : boum')

    const noBind = fakeServer(() => Promise.reject(notAvailable))
    const noBindContext = io({ createServer: () => noBind.server })
    expect(await runCli(ARGS, noBindContext.io)).toBe(1)
  })
})
