import { flushPromises } from '@vue/test-utils'

import {
  getRoomHardwareConfig,
  pollArtnetNodes,
  saveBuzzerKeymap,
  stopLighting,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { createFakeUsbPort, installFakeSerial, uninstallFakeSerial } from '../_helpers/fakeUsb'
import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

const NODES = [
  {
    ip: '192.168.1.50',
    shortName: 'NET-3',
    longName: 'Showtec NET-3',
    universes: ['0.0.0', '0.0.1'],
  },
  { ip: '10.0.0.4', shortName: 'Boitier', longName: '' },
]

/** Pont factice : ack avec ou sans `features`, et réponse `nodes` à chaque `poll`. */
const bridge = {
  features: ['poll'] as string[] | undefined,
  nodes: NODES as unknown[],
  polls: 0,
}

class BridgeSocket {
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null

  constructor() {
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }

  send(data: unknown) {
    if (typeof data !== 'string') {
      return
    }
    const message = JSON.parse(data) as { type: string }
    let reply: unknown = null
    if (message.type === 'hello') {
      reply = {
        type: 'ack',
        protocol: 1,
        bridge: 'b',
        universes: 16,
        artnet: { target: null, port: 6454, source: 'none' },
        ...(bridge.features ? { features: bridge.features } : {}),
      }
    } else if (message.type === 'poll') {
      bridge.polls += 1
      reply = { type: 'nodes', nodes: bridge.nodes }
    }
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(reply) }))
  }

  close() {
    this.readyState = 3
  }
}

/** Un buzzer par bouton pour les pupitres 1-4. */
function fullKeymap() {
  const keymap: Record<string, { desk: 1 | 2 | 3 | 4; button: 'A' | 'B' | 'C' | 'D' }> = {}
  for (const [index, letter] of [...'BCGHIJKLMNOPTUYZ'].entries()) {
    keymap[`Key${letter}`] = {
      desk: (Math.floor(index / 4) + 1) as 1 | 2 | 3 | 4,
      button: 'ABCD'[index % 4] as 'A' | 'B' | 'C' | 'D',
    }
  }
  return keymap
}

/** Assistant sur l'étape « interface », pilote pont Art-Net choisi. */
async function openBridgeStep() {
  await saveBuzzerKeymap(fullKeymap())
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await click(wrapper, 'tab-assistant')
  await click(wrapper, 'assistant-next')
  await sel(wrapper, 'buzzer-source').setValue('gamepad')
  await sel(wrapper, 'gamepad-match').setValue('BU0836')
  await click(wrapper, 'assistant-next')
  await sel(wrapper, 'driver-artnet-bridge').setValue(true)
  return wrapper
}

async function connectBridge(wrapper: Wrapper) {
  await click(wrapper, 'assistant-connect')
  await vi.waitFor(() => expect(sel(wrapper, 'artnet-effective').exists()).toBe(true))
}

describe('assistant : recherche des nœuds Art-Net', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    installFakeSerial(createFakeUsbPort())
    bridge.features = ['poll']
    bridge.nodes = NODES
    bridge.polls = 0
    vi.stubGlobal('WebSocket', BridgeSocket)
  })
  afterEach(async () => {
    await stopLighting()
    vi.unstubAllGlobals()
    uninstallFakeSerial()
  })

  it('pont non connecté : le bouton est grisé et la recherche refusée', async () => {
    const wrapper = await openBridgeStep()
    expect(sel(wrapper, 'artnet-search').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'artnet-search-offline').exists()).toBe(true)
    await expect(pollArtnetNodes()).rejects.toThrow('non connecté')
  })

  it('affiche les nœuds trouvés ; un clic enregistre l’IP comme la saisie', async () => {
    const wrapper = await openBridgeStep()
    await connectBridge(wrapper)
    expect(sel(wrapper, 'artnet-search').attributes('disabled')).toBeUndefined()
    expect(sel(wrapper, 'artnet-nodes').exists()).toBe(false)

    await click(wrapper, 'artnet-search')
    await vi.waitFor(() => expect(sel(wrapper, 'artnet-nodes').exists()).toBe(true))
    expect(bridge.polls).toBe(1)
    const buttons = wrapper.findAll('[data-test="artnet-node"]')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.text()).toContain('Showtec NET-3')
    expect(buttons[0]!.text()).toContain('192.168.1.50')
    expect(buttons[0]!.text()).toContain('0.0.0, 0.0.1')
    // Sans nom long, on retombe sur le nom court.
    expect(buttons[1]!.text()).toContain('Boitier')

    await buttons[1]!.trigger('click')
    await flushPromises()
    expect(getRoomHardwareConfig().lighting.artnet).toEqual({ target: '10.0.0.4' })
    expect((sel(wrapper, 'artnet-target').element as HTMLInputElement).value).toBe('10.0.0.4')
  })

  it('aucun nœud trouvé : message dédié', async () => {
    bridge.nodes = []
    const wrapper = await openBridgeStep()
    await connectBridge(wrapper)
    await click(wrapper, 'artnet-search')
    await vi.waitFor(() => expect(sel(wrapper, 'artnet-nodes-empty').exists()).toBe(true))
    expect(sel(wrapper, 'artnet-nodes-empty').text()).toContain('Aucun nœud trouvé')
    expect(sel(wrapper, 'artnet-nodes').exists()).toBe(false)
  })

  it('pont trop ancien : message dédié, bouton grisé, aucune requête', async () => {
    bridge.features = undefined
    const wrapper = await openBridgeStep()
    await click(wrapper, 'assistant-connect')
    await vi.waitFor(() => expect(sel(wrapper, 'artnet-search-old').exists()).toBe(true))
    expect(sel(wrapper, 'artnet-search-old').text()).toContain('trop ancien')
    expect(sel(wrapper, 'artnet-search').attributes('disabled')).toBeDefined()
    expect(bridge.polls).toBe(0)
  })
})
