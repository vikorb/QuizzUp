import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame } from '@/game/useRoomGame'
import {
  connectDmxInterface,
  getBuzzerInput,
  getLighting,
  HARDWARE_STORAGE_KEY,
  saveBuzzerKeymap,
  saveRoomHardwareConfig,
  setBuzzerInput,
  startLighting,
  stopLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'

import { REGISTRATIONS } from '../_helpers/fixtures'
import { pressKey } from '../_helpers/keyboard'

const LEARNED_KEYMAP = Object.fromEntries([['KeyP', { desk: 1, button: 'D' } as const]])
const noop = () => undefined
const subscribe = () => noop

const FIXTURE = { id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1, desk: 1 }

describe('matériel de la salle', () => {
  it('joue au clavier de simulation tant qu’aucun buzzer n’est associé', () => {
    const { usesSimulationKeys } = useRoomHardware()
    const listener = vi.fn()
    getBuzzerInput().onPress(listener)

    pressKey('KeyQ')

    expect(usesSimulationKeys.value).toBe(true)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ desk: 2, button: 'A', buttonIndex: 0, code: 'KeyQ' })
    )
  })

  it('applique et garde le mapping appris', async () => {
    const listener = vi.fn()
    getBuzzerInput().onPress(listener)

    await saveBuzzerKeymap(LEARNED_KEYMAP)
    pressKey('KeyQ')
    pressKey('KeyP')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ desk: 1, button: 'D' }))
    expect(JSON.parse(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '{}').buzzers.keymap).toEqual(
      LEARNED_KEYMAP
    )
    expect(useRoomHardware().usesSimulationKeys.value).toBe(false)
  })

  it('remplace l’entrée buzzers et expose son état', () => {
    const dispose = vi.fn()
    const state = {
      focused: true,
      visible: true,
      active: true,
      keyboardLocked: false,
      simulation: true,
      held: [],
    }
    setBuzzerInput({
      onPress: subscribe,
      onKey: subscribe,
      getState: () => state,
      onChange: subscribe,
      dispose,
    })

    expect(useRoomHardware().buzzerState.value).toEqual(state)
    setBuzzerInput(null)
    expect(dispose).toHaveBeenCalled()
  })

  it('démarre un seul contrôleur de lumières et le relie au moteur', async () => {
    configureRoomGame({ storage: createMemorySessionStorage() })
    const [first, second] = await Promise.all([startLighting(), startLighting()])
    expect(first).toBe(second)
    expect(getLighting()).toBe(first)

    const handle = vi.spyOn(first, 'handleGameEvent')
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 3 })

    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ type: 'game_started' }))
    closeGame()
  })

  it('relance les lumières avec la nouvelle config', async () => {
    const before = await startLighting()
    const parsed = await saveRoomHardwareConfig({ lighting: { fixtures: [FIXTURE] } })
    const after = getLighting()

    expect(parsed.fixtures).toHaveLength(1)
    expect(after).not.toBeNull()
    expect(after).not.toBe(before)
    expect(after?.getFixtureViews()).toHaveLength(1)

    await stopLighting()
    expect(getLighting()).toBeNull()
    expect(useRoomHardware().lightingState.value).toBeNull()
  })

  it('refuse de connecter une interface en mode simulation', async () => {
    await expect(connectDmxInterface()).rejects.toThrow('simulation_driver')
  })

  it('ignore une config stockée illisible', async () => {
    localStorage.setItem(HARDWARE_STORAGE_KEY, '{oops')
    const { resetRoomHardware } = await import('@/hardware/roomHardware')
    await resetRoomHardware()
    expect(useRoomHardware().hardware.value.config.lighting.driver).toBe('simulation')
  })
})

describe('sécurité des lumières à l’enregistrement', () => {
  const SMOKE_CONFIG = {
    lighting: {
      fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }],
      smoke: { enabled: true, requireConfirmation: false },
    },
  }

  it('ne relance pas les lumières pour un simple changement de buzzers', async () => {
    const before = await startLighting()
    await saveBuzzerKeymap(LEARNED_KEYMAP)
    expect(getLighting()).toBe(before)
  })

  it('garde l’arrêt d’urgence et désarme la fumée quand la config est relancée', async () => {
    await saveRoomHardwareConfig(SMOKE_CONFIG)
    const first = await startLighting()
    first.emergencyStop('operator')

    await saveRoomHardwareConfig({
      ...SMOKE_CONFIG,
      lighting: { ...SMOKE_CONFIG.lighting, refreshHz: 20 },
    })
    const next = getLighting()

    expect(next).not.toBe(first)
    expect(next?.getState().emergency).toBe(true)
    next?.resetEmergency()
    expect(next?.getState().smoke.armed).toBe(false)
  })

  it('n’ouvre jamais deux contrôleurs en même temps', async () => {
    await startLighting()
    const stopping = stopLighting()
    const restarted = startLighting()
    await stopping
    const controller = await restarted
    expect(getLighting()).toBe(controller)
    expect(controller.getState().running).toBe(true)
  })
})
