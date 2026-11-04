import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame } from '@/game/useRoomGame'
import {
  connectDmxInterface,
  EMERGENCY_STORAGE_KEY,
  getBuzzerInput,
  getLighting,
  HARDWARE_STORAGE_KEY,
  isDefaultHardwareConfig,
  resetRoomHardware,
  saveBuzzerKeymap,
  saveLearnedBuzzers,
  saveRoomDesksCount,
  saveRoomHardwareConfig,
  setBuzzerInput,
  setHardwareRemoteSaver,
  stableStringify,
  startLighting,
  stopLighting,
  triggerEmergencyStop,
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

  describe('nombre de pupitres de la salle', () => {
    it('vaut 4 par défaut, avec ou sans le champ dans la config', async () => {
      const { desks } = useRoomHardware()
      expect(desks.value).toEqual([1, 2, 3, 4])

      // Une ancienne config (sans `desksCount`) donne aussi 4 pupitres.
      await saveRoomHardwareConfig({ buzzers: { keymap: LEARNED_KEYMAP } })
      expect(desks.value).toEqual([1, 2, 3, 4])
    })

    it('se règle de 1 à 6, est gardé sur ce PC et envoyé au compte de salle', async () => {
      const sent: unknown[] = []
      setHardwareRemoteSaver(
        async (config) => {
          sent.push(config)
        },
        { accountId: 1, tokenTag: 'tag' }
      )
      const { desks } = useRoomHardware()

      await saveRoomDesksCount(6)

      expect(desks.value).toEqual([1, 2, 3, 4, 5, 6])
      expect(JSON.parse(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '{}').desksCount).toBe(6)
      expect(sent).toEqual([expect.objectContaining({ desksCount: 6 })])

      await saveRoomDesksCount(2)
      expect(desks.value).toEqual([1, 2])
      await saveRoomDesksCount(99)
      expect(desks.value).toHaveLength(6)
      await saveRoomDesksCount(0)
      expect(desks.value).toEqual([1])
    })

    const SIX_DESK_KEYMAP = Object.fromEntries([
      ['KeyP', { desk: 1, button: 'D' } as const],
      ['KeyT', { desk: 5, button: 'A' } as const],
      ['KeyY', { desk: 6, button: 'B' } as const],
    ])

    it('garde en réserve les buzzers des pupitres retirés et les restitue en remontant', async () => {
      await saveRoomDesksCount(6)
      await saveBuzzerKeymap(SIX_DESK_KEYMAP)

      await saveRoomDesksCount(4)

      const { hardware, desks } = useRoomHardware()
      expect(desks.value).toEqual([1, 2, 3, 4])
      // Réserve conservée dans la config (et sur ce PC), sans remonter tout seul.
      expect(hardware.value.config.desksCount).toBe(4)
      expect(hardware.value.config.buzzers.keymap).toEqual(SIX_DESK_KEYMAP)
      expect(JSON.parse(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '{}').buzzers.keymap).toEqual(
        SIX_DESK_KEYMAP
      )

      await saveRoomDesksCount(6)
      expect(useRoomHardware().desks.value).toEqual([1, 2, 3, 4, 5, 6])
      expect(hardware.value.config.buzzers.keymap).toEqual(SIX_DESK_KEYMAP)
    })

    it('ignore le buzzer d’un pupitre en réserve, et le reprend en remontant le nombre', async () => {
      await saveRoomDesksCount(6)
      await saveBuzzerKeymap(SIX_DESK_KEYMAP)
      const listener = vi.fn()
      getBuzzerInput().onPress(listener)

      await saveRoomDesksCount(4)
      pressKey('KeyT') // pupitre 5 : en réserve
      pressKey('KeyP') // pupitre 1 : actif
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ desk: 1, button: 'D' }))

      await saveRoomDesksCount(6)
      listener.mockClear()
      pressKey('KeyT')
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ desk: 5, button: 'A' }))
    })

    it('retire le doublon de réserve quand sa touche est réapprise sur un pupitre actif', async () => {
      await saveRoomDesksCount(6)
      await saveBuzzerKeymap(SIX_DESK_KEYMAP)
      await saveRoomDesksCount(4)

      // KeyT (réserve du pupitre 5) est réapprise sur le pupitre 2.
      await saveLearnedBuzzers(Object.fromEntries([['KeyT', { desk: 2, button: 'B' } as const]]))

      const { hardware } = useRoomHardware()
      expect(hardware.value.config.buzzers.keymap).toEqual(
        Object.fromEntries([
          ['KeyY', { desk: 6, button: 'B' }],
          ['KeyT', { desk: 2, button: 'B' }],
        ])
      )
      await saveRoomDesksCount(6)
      expect(hardware.value.config.buzzers.keymap['KeyT']).toEqual({ desk: 2, button: 'B' })
    })

    it('détache les lumières d’un pupitre retiré et les rattache en remontant le nombre', async () => {
      await saveRoomDesksCount(6)
      await saveRoomHardwareConfig({
        ...useRoomHardware().hardware.value.config,
        lighting: {
          ...useRoomHardware().hardware.value.config.lighting,
          fixtures: [{ ...FIXTURE, id: 'par6', desk: 6 }],
        },
      })
      const controller = await startLighting()

      await saveRoomDesksCount(4)

      // Le contrôleur est relancé (l'appareil est détaché du pupitre 6), puis remonter le rétablit.
      expect(getLighting()).not.toBe(controller)
      expect(getLighting()?.getFixtureViews()[0]?.desk).toBeNull()
      await saveRoomDesksCount(6)
      expect(getLighting()?.getFixtureViews()[0]?.desk).toBe(6)
    })

    it('n’est plus une config de salle neuve dès qu’il change', async () => {
      expect(isDefaultHardwareConfig({ desksCount: 4 })).toBe(true)
      expect(isDefaultHardwareConfig({})).toBe(true)
      expect(isDefaultHardwareConfig({ desksCount: 6 })).toBe(false)
    })

    it('joue au clavier de simulation sur les 6 pupitres, et seulement sur ceux de la salle', async () => {
      const listener = vi.fn()
      getBuzzerInput().onPress(listener)

      pressKey('Digit5')
      expect(listener).not.toHaveBeenCalled()

      await saveRoomDesksCount(6)
      pressKey('Digit5')
      pressKey('KeyI')
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ desk: 5, button: 'A' }))
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ desk: 6, button: 'D' }))

      await saveRoomDesksCount(2)
      listener.mockClear()
      pressKey('KeyA') // pupitre 3 : n'existe plus
      pressKey('KeyQ') // pupitre 2
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ desk: 2, button: 'A' }))
    })
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

  it('ne relance pas les lumières quand seules les clés changent d’ordre (jsonb)', async () => {
    const bindings = Object.fromEntries([
      ['game_started', 'intro'],
      ['round_ended', null],
    ])
    await saveRoomHardwareConfig({ lighting: { fixtures: [FIXTURE], bindings } })
    const before = await startLighting()
    const reordered = Object.fromEntries(Object.entries(bindings).reverse())
    await saveRoomHardwareConfig({ lighting: { bindings: reordered, fixtures: [FIXTURE] } })
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

  it('garde la fumée coupée et désarmée après un rechargement en arrêt d’urgence', async () => {
    await saveRoomHardwareConfig(SMOKE_CONFIG)
    await startLighting()
    triggerEmergencyStop('operator')

    // Rechargement de la page : le stockage du PC reste, la mémoire repart de zéro.
    await resetRoomHardware()
    const controller = await startLighting()
    expect(controller.getState().emergency).toBe(true)
    expect(controller.getState().smoke.status).toBe('emergency')
    expect(controller.smoke.fire(1000)).toMatchObject({ ok: false })
    expect(controller.getState().smoke.level).toBe(0)

    // Réarmement humain : les lumières reviennent, pas la fumée.
    controller.resetEmergency()
    expect(controller.getState().smoke.armed).toBe(false)
    expect(controller.smoke.fire(1000)).toMatchObject({ ok: false, reason: 'not_armed' })
  })

  it('retient l’arrêt d’urgence sur ce PC et l’efface au réarmement seulement', async () => {
    const controller = await startLighting()
    triggerEmergencyStop('freeze_test_failed')
    expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBe('freeze_test_failed')

    // Changer la config (redémarrage des lumières) ne l'efface pas.
    await saveRoomHardwareConfig({ lighting: { refreshHz: 20 } })
    expect(getLighting()).not.toBe(controller)
    expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBe('freeze_test_failed')

    getLighting()?.resetEmergency()
    expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBeNull()
  })

  it('reste utilisable quand le stockage du PC est indisponible', async () => {
    const broken = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage bloqué')
    })
    const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage bloqué')
    })
    try {
      const controller = await startLighting()
      triggerEmergencyStop('operator')
      expect(controller.getState().emergency).toBe(true)
      controller.resetEmergency()
      expect(controller.getState().emergency).toBe(false)
    } finally {
      broken.mockRestore()
      setter.mockRestore()
    }
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

describe('arrêt d’urgence pendant un redémarrage', () => {
  it('applique au prochain contrôleur un arrêt pressé sans contrôleur actif', async () => {
    triggerEmergencyStop('operator')
    const controller = await startLighting()
    expect(controller.getState().emergency).toBe(true)
  })

  it('arrête aussi le contrôleur actif', async () => {
    const controller = await startLighting()
    triggerEmergencyStop()
    expect(controller.getState().emergency).toBe(true)
  })
})

describe('outils de comparaison de config', () => {
  it('sérialise sans tenir compte de l’ordre des clés', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      stableStringify({ a: [{ c: 3, d: 2 }], b: 1 })
    )
  })

  it('reconnaît une config de salle neuve', () => {
    expect(isDefaultHardwareConfig({})).toBe(true)
    expect(isDefaultHardwareConfig({ autre: 'réglage du backoffice' })).toBe(true)
    expect(isDefaultHardwareConfig({ buzzers: { keymap: LEARNED_KEYMAP } })).toBe(false)
    expect(isDefaultHardwareConfig({ lighting: { fixtures: [FIXTURE] } })).toBe(false)
  })
})

describe('buzzers sur une carte USB vue comme une manette', () => {
  const pad = {
    index: 0,
    id: 'Generic USB Joystick (Vendor: 0079)',
    connected: true,
    timestamp: 0,
    buttons: [{ pressed: false }, { pressed: false }],
  }

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    })
  })

  afterEach(async () => {
    await resetRoomHardware()
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'getGamepads')
    pad.buttons[0] = { pressed: false }
  })

  it('lit la carte choisie dans la config, sans perdre les abonnés au changement de source', async () => {
    const listener = vi.fn()
    getBuzzerInput().onPress(listener)
    expect(useRoomHardware().usesGamepad.value).toBe(false)

    await saveRoomHardwareConfig({
      buzzers: {
        keymap: Object.fromEntries([['GamepadButton0', { desk: 2, button: 'C' } as const]]),
        source: { kind: 'gamepad', match: 'joystick' },
      },
    })
    expect(useRoomHardware().usesGamepad.value).toBe(true)
    expect(useRoomHardware().usesSimulationKeys.value).toBe(false)

    await vi.advanceTimersByTimeAsync(10)
    pad.buttons[0] = { pressed: true }
    await vi.advanceTimersByTimeAsync(10)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ desk: 2, button: 'C', code: 'GamepadButton0' })
    )
    expect(useRoomHardware().buzzerState.value?.active).toBe(true)
  })

  it('verrouille les touches système aussi avec la carte manette, et les garde au changement de source', async () => {
    const keyboard = { lock: vi.fn().mockResolvedValue(undefined), unlock: vi.fn() }
    Object.defineProperty(navigator, 'keyboard', { value: keyboard, configurable: true })

    try {
      const { lockBuzzerSystemKeys } = await import('@/hardware/roomHardware')
      await saveRoomHardwareConfig({
        buzzers: {
          keymap: Object.fromEntries([['GamepadButton0', { desk: 2, button: 'C' } as const]]),
          source: { kind: 'gamepad', match: 'joystick' },
        },
      })
      expect(useRoomHardware().usesGamepad.value).toBe(true)

      expect(await lockBuzzerSystemKeys()).toBe(true)
      expect(keyboard.lock).toHaveBeenCalledTimes(1)
      expect(useRoomHardware().buzzerState.value?.keyboardLocked).toBe(true)

      // Retour au clavier : le verrou est repris par le nouveau lecteur.
      await saveRoomHardwareConfig({
        buzzers: { keymap: LEARNED_KEYMAP, source: { kind: 'keyboard' } },
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(useRoomHardware().usesGamepad.value).toBe(false)
      expect(keyboard.lock).toHaveBeenCalledTimes(2)
      expect(useRoomHardware().buzzerState.value?.keyboardLocked).toBe(true)
    } finally {
      Reflect.deleteProperty(navigator, 'keyboard')
    }
  })

  it('n’annonce pas les touches de simulation avec une carte manette', async () => {
    const { saveBuzzerSource } = await import('@/hardware/roomHardware')
    expect(useRoomHardware().usesSimulationKeys.value).toBe(true)
    await saveBuzzerSource({ kind: 'gamepad' })
    expect(useRoomHardware().usesSimulationKeys.value).toBe(false)
    expect(useRoomHardware().usesGamepad.value).toBe(true)
  })

  it('ignore une carte qui ne correspond pas au filtre', async () => {
    const listener = vi.fn()
    await saveRoomHardwareConfig({
      buzzers: {
        keymap: Object.fromEntries([['GamepadButton0', { desk: 1, button: 'A' } as const]]),
        source: { kind: 'gamepad', match: 'autre carte' },
      },
    })
    getBuzzerInput().onPress(listener)
    await vi.advanceTimersByTimeAsync(10)
    pad.buttons[0] = { pressed: true }
    await vi.advanceTimersByTimeAsync(10)

    expect(listener).not.toHaveBeenCalled()
    expect(useRoomHardware().buzzerState.value?.active).toBe(false)
  })
})
