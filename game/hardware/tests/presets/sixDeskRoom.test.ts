import { createBuzzerLearning } from '@hardware/buzzers/learning'
import { parseRoomHardwareConfig } from '@hardware/config'
import { renderUniverse } from '@hardware/dmx/fixtures'
import {
  createSixDeskKeyboardKeymap,
  createSixDeskRoomRig,
  parsePanTiltCalibration,
  SIX_DESK_ADDRESSES,
} from '@hardware/presets/sixDeskRoom'
import { DESKS } from '@hardware/types'

describe('salle 6 pupitres déjà équipée', () => {
  it('reprend les touches AZERTY des 24 buzzers', () => {
    const keymap = createSixDeskKeyboardKeymap()
    expect(Object.keys(keymap)).toHaveLength(24)
    expect(keymap.KeyQ).toEqual({ desk: 1, button: 'A' }) // « a » en AZERTY, buzzer bleu
    expect(keymap.KeyR).toEqual({ desk: 1, button: 'D' }) // « r », buzzer rouge
    expect(keymap.KeyA).toEqual({ desk: 3, button: 'A' }) // « q »
    expect(keymap.KeyZ).toEqual({ desk: 5, button: 'A' }) // « w »
    expect(keymap.Semicolon).toEqual({ desk: 6, button: 'D' }) // « m »
    expect(parseRoomHardwareConfig({ buzzers: { keymap } }).problems).toEqual([])
  })

  it('permet l’apprentissage des 6 pupitres', () => {
    const learning = createBuzzerLearning({ desks: DESKS })
    expect(learning.getState().totalSteps).toBe(24)
  })

  it('décrit les lyres et les rubans LED sans chevauchement d’adresses', () => {
    const rig = createSixDeskRoomRig()
    const parsed = parseRoomHardwareConfig({ lighting: { driver: 'usbpro', ...rig } })
    expect(parsed.problems).toEqual([])
    expect(parsed.fixtures).toHaveLength(15)

    const address = (id: string) => parsed.fixtures.find((fixture) => fixture.id === id)?.address
    expect(address('wash-droite')).toBe(1)
    expect(address('spot-pupitre-6')).toBe(10)
    expect(address('spot-pupitre-1')).toBe(55)
    expect(address('wash-gauche')).toBe(64)
    expect(address('led-pupitre-1')).toBe(SIX_DESK_ADDRESSES.ledDecoder)
    expect(address('led-pupitre-6')).toBe(143)
    expect(address('led-ambiance')).toBe(146)
    expect(parsed.fixtures.find((fixture) => fixture.id === 'fumee')).toBeUndefined()
  })

  it('ajoute la fumée seulement avec un relais DMX', () => {
    const rig = createSixDeskRoomRig({ smokeRelayAddress: 200 })
    const parsed = parseRoomHardwareConfig({ lighting: rig })
    expect(parsed.problems).toEqual([])
    expect(parsed.fixtures.at(-1)).toMatchObject({ id: 'fumee', profileId: 'smoke-relay' })
  })

  it('reprend le calage des lyres de l’ancien système', () => {
    const calibration = parsePanTiltCalibration(
      [
        'Langue:FR;',
        'Pupitre1:150-77;',
        '  Pupitre6 : 20-255 ',
        'Head1:0-128;',
        'Head2:255-0;',
        'Pupitre7:1-1;',
        'Head3:1-1;',
        'Pupitre2:300-1;',
      ].join('\r\n')
    )
    expect(calibration.desks).toEqual({
      1: { pan: 150 * 257, tilt: 77 * 257 },
      6: { pan: 20 * 257, tilt: 65_535 },
    })
    expect(calibration.heads).toEqual({
      1: { pan: 0, tilt: 128 * 257 },
      2: { pan: 65_535, tilt: 0 },
    })
    expect(calibration.problems).toHaveLength(3)

    const rig = createSixDeskRoomRig({ calibration })
    const parsed = parseRoomHardwareConfig({ lighting: rig })
    const spot1 = parsed.fixtures.find((fixture) => fixture.id === 'spot-pupitre-1')
    expect(spot1?.deskPositions).toEqual({ 1: { pan: 150 * 257, tilt: 77 * 257 } })
    expect(parsed.fixtures.find((fixture) => fixture.id === 'wash-gauche')?.homePosition).toEqual({
      pan: 65_535,
      tilt: 0,
    })

    // Pan-tilt d'origine (8 bits) retrouvés tels quels dans la trame DMX.
    const universe = renderUniverse(parsed.fixtures, new Map(), 0)
    expect(universe[54]).toBe(150)
    expect(universe[55]).toBe(77)
  })
})
