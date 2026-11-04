import { parseRoomHardwareConfig } from '@hardware/config'
import type { FixtureConfig, FixtureState, ResolvedFixture } from '@hardware/dmx/fixtures'
import { darkState, parseRig, renderUniverse } from '@hardware/dmx/fixtures'
import type { ChannelSpec, FixtureProfile } from '@hardware/dmx/profiles'
import { defaultColorWheelSlots, findProfile, GENERIC_PROFILES } from '@hardware/dmx/profiles'
import { createSixDeskRoomRig } from '@hardware/presets/sixDeskRoom'

type Slots = NonNullable<ChannelSpec['slots']>

const lit = (state: Partial<FixtureState>): FixtureState => ({
  ...darkState(),
  intensity: 1,
  ...state,
})
const color = (red: number, green: number, blue: number) => ({
  r: red,
  g: green,
  b: blue,
  w: 0,
})

function profileOf(...channels: ChannelSpec[]): FixtureProfile {
  return { id: 'p', name: 'p', kind: 'movingHead', channels }
}

/** Rend un appareil à l'adresse 1 et renvoie ses canaux. */
function render(
  profile: FixtureProfile,
  state: FixtureState,
  extra: Partial<FixtureConfig> = {}
): number[] {
  const fixture: ResolvedFixture = {
    id: 'f',
    name: 'f',
    profileId: 'p',
    address: 1,
    profile,
    ...extra,
  }
  return [
    ...renderUniverse([fixture], new Map([['f', state]]), 0).slice(0, profile.channels.length),
  ]
}

describe('rôle colorWheel', () => {
  const wheel = (slots: Slots | undefined, value?: number) =>
    profileOf({
      role: 'colorWheel',
      ...(slots ? { slots } : {}),
      ...(value === 0 || value ? { value } : {}),
    })

  const slots: Slots = [
    { value: 0, rgb: [255, 255, 255] },
    { value: 10, rgb: [255, 0, 0] },
    { value: 20, rgb: [0, 255, 0] },
    { value: 30, rgb: [0, 0, 255] },
  ]

  it('prend l’emplacement le plus proche en distance RVB', () => {
    expect(render(wheel(slots), lit({ color: color(250, 10, 10) }))).toEqual([10])
    expect(render(wheel(slots), lit({ color: color(0, 200, 30) }))).toEqual([20])
    expect(render(wheel(slots), lit({ color: color(20, 20, 240) }))).toEqual([30])
    expect(render(wheel(slots), lit({ color: color(240, 240, 240) }))).toEqual([0])
  })

  it('ne dépend pas de l’intensité (la roue montre la couleur, le gradateur dose)', () => {
    expect(render(wheel(slots), lit({ color: color(255, 0, 0), intensity: 0.2 }))).toEqual([10])
  })

  it('départage une égalité en faveur du premier emplacement déclaré', () => {
    // (128,128,0) est à égale distance du rouge et du vert.
    expect(render(wheel(slots), lit({ color: color(128, 128, 0) }))).toEqual([10])
    expect(render(wheel([...slots].reverse()), lit({ color: color(128, 128, 0) }))).toEqual([20])
  })

  it('retombe sur la valeur du canal quand la roue est vide ou absente', () => {
    expect(render(wheel([]), lit({ color: color(255, 0, 0) }))).toEqual([0])
    expect(render(wheel(undefined, 77), lit({ color: color(255, 0, 0) }))).toEqual([77])
    expect(render(wheel([], 5), darkState())).toEqual([5])
  })

  it('laisse le gradateur à 0 sans bloquer le rendu de la roue', () => {
    const profile = profileOf({ role: 'dimmer' }, { role: 'colorWheel', slots })
    expect(render(profile, lit({ color: color(0, 0, 255), intensity: 0 }))).toEqual([0, 30])
    expect(render(profile, lit({ color: color(0, 0, 0), intensity: 1 }))[0]).toBe(255)
  })

  it('rend à la fois les canaux RVB et la roue', () => {
    const profile = profileOf(
      { role: 'red' },
      { role: 'green' },
      { role: 'blue' },
      { role: 'colorWheel', slots }
    )
    expect(render(profile, lit({ color: color(0, 250, 0), intensity: 0.5 }))).toEqual([
      0, 125, 0, 20,
    ])
  })
})

describe('rôles à valeur fixe', () => {
  it('shutter : ouvert à 255 par défaut, valeur d’ouverture configurable', () => {
    expect(render(profileOf({ role: 'shutter' }), lit({}))).toEqual([255])
    expect(render(profileOf({ role: 'shutter', open: 8 }), lit({}))).toEqual([8])
  })

  it('shutter : fermé à intensité 0 seulement si le profil fournit closed', () => {
    const closing = profileOf({ role: 'shutter', open: 255, closed: 0 })
    expect(render(closing, lit({ intensity: 0 }))).toEqual([0])
    expect(render(closing, lit({ intensity: 0.1 }))).toEqual([255])
    expect(render(profileOf({ role: 'shutter', closed: 4 }), darkState())).toEqual([4])
    expect(render(profileOf({ role: 'shutter', open: 255 }), darkState())).toEqual([255])
  })

  it('gobo : ouvert (0) par défaut, valeur configurable', () => {
    expect(render(profileOf({ role: 'gobo' }), lit({}))).toEqual([0])
    expect(render(profileOf({ role: 'gobo', open: 12 }), lit({}))).toEqual([12])
  })

  it('speed : valeur fixe du profil, 0 par défaut', () => {
    expect(render(profileOf({ role: 'speed' }), lit({}))).toEqual([0])
    expect(render(profileOf({ role: 'speed', value: 200 }), lit({}))).toEqual([200])
  })
})

describe('inversion et plages pan / tilt', () => {
  const head = profileOf(
    { role: 'pan' },
    { role: 'panFine' },
    { role: 'tilt' },
    { role: 'tiltFine' }
  )
  const at = (pan: number, tilt: number) => lit({ position: { pan, tilt } })

  it('sans option, rend la position telle quelle (16 bits)', () => {
    expect(render(head, at(0x1234, 0xabcd))).toEqual([0x12, 0x34, 0xab, 0xcd])
  })

  it('inverse pan et tilt indépendamment', () => {
    expect(render(head, at(0x1234, 0xabcd), { invertPan: true })).toEqual([0xed, 0xcb, 0xab, 0xcd])
    expect(render(head, at(0x1234, 0xabcd), { invertTilt: true })).toEqual([0x12, 0x34, 0x54, 0x32])
  })

  it('ramène la position dans la plage', () => {
    const range = {
      panRange: [1000, 2000] as [number, number],
      tiltRange: [0, 255] as [number, number],
    }
    expect(render(head, at(0, 60_000), range)).toEqual([0x03, 0xe8, 0x00, 0xff])
    expect(render(head, at(5000, 100), range)).toEqual([0x07, 0xd0, 0x00, 0x64])
  })

  it('inverse à l’intérieur de la plage', () => {
    const options = { panRange: [1000, 2000] as [number, number], invertPan: true }
    expect(render(head, at(1200, 0), options).slice(0, 2)).toEqual([0x07, 0x08]) // 1000 + 2000 - 1200
    expect(render(head, at(0, 0), options).slice(0, 2)).toEqual([0x07, 0xd0]) // 2000
  })

  it('profil 8 bits (sans fine) : octet de poids fort inversé', () => {
    const coarse = profileOf({ role: 'pan' }, { role: 'tilt' })
    expect(render(coarse, at(0x1234, 0x8000), { invertPan: true, invertTilt: true })).toEqual([
      0xed, 0x7f,
    ])
  })
})

describe('profils génériques de lyres', () => {
  it.each([9, 11, 16])('lyre spot %i canaux : roue, gobo et vitesse à leur place', (count) => {
    const profile = findProfile(`moving-head-spot-${count}`)!
    expect(profile.channels).toHaveLength(count)
    expect(profile.channels.map((channel) => channel.role).slice(0, 9)).toEqual([
      'pan',
      'panFine',
      'tilt',
      'tiltFine',
      'speed',
      'dimmer',
      'shutter',
      'colorWheel',
      'gobo',
    ])
    const frame = render(profile, lit({ color: color(0, 0, 255) }))
    expect(frame[5]).toBe(255) // gradateur
    expect(frame[6]).toBe(255) // shutter ouvert
    expect(frame[7]).toBe(30) // roue : bleu
    expect(frame.slice(9).every((value) => value === 0)).toBe(true)
  })

  it('ne partage pas le tableau d’emplacements entre profils', () => {
    const first = findProfile('moving-head-spot-9')!
    const second = findProfile('moving-head-spot-11')!
    expect(first.channels[7]!.slots).not.toBe(second.channels[7]!.slots)
    expect(first.channels[7]!.slots).toEqual(defaultColorWheelSlots())
    expect(GENERIC_PROFILES.some((profile) => profile.id === 'moving-head-spot-16')).toBe(true)
  })
})

describe('preset 6 pupitres', () => {
  it('les spots prennent la couleur du pupitre via la roue', () => {
    const parsed = parseRoomHardwareConfig({ lighting: createSixDeskRoomRig() })
    expect(parsed.problems).toEqual([])
    const spot = parsed.fixtures.find((fixture) => fixture.id === 'spot-pupitre-3')!
    const states = new Map([[spot.id, lit({ color: color(255, 0, 0) })]])
    expect(renderUniverse([spot], states, 0)[spot.address - 1 + 2]).toBe(10) // roue : rouge
  })
})

describe('parse des profils sur mesure', () => {
  const parse = (channels: unknown[]) =>
    parseRig([], [{ id: 'mine', name: 'Mine', kind: 'movingHead', channels }])

  it('accepte les nouveaux rôles et conserve leurs réglages', () => {
    const channels = [
      { role: 'colorWheel', slots: [{ value: 5, rgb: [1, 2, 3] }] },
      { role: 'shutter', open: 200, closed: 3 },
      { role: 'gobo', open: 9 },
      { role: 'speed', value: 50 },
    ]
    const { customProfiles, problems } = parse(channels)
    expect(problems).toEqual([])
    expect(customProfiles[0]?.channels).toEqual(channels)
  })

  it.each([
    ['valeur hors 0-255', [{ value: 256, rgb: [0, 0, 0] }]],
    ['valeur négative', [{ value: -1, rgb: [0, 0, 0] }]],
    ['valeur non entière', [{ value: 1.5, rgb: [0, 0, 0] }]],
    ['rgb trop court', [{ value: 1, rgb: [0, 0] }]],
    ['rgb hors 0-255', [{ value: 1, rgb: [0, 0, 300] }]],
    ['rgb non numérique', [{ value: 1, rgb: ['a', 0, 0] }]],
    ['rgb absent', [{ value: 1 }]],
    ['emplacements pas une liste', 'rouge'],
  ])('rejette le profil : %s', (_name, slots) => {
    const { customProfiles, problems } = parse([{ role: 'colorWheel', slots }])
    expect(customProfiles).toEqual([])
    expect(problems).toEqual([expect.stringContaining('emplacement de roue invalide')])
  })

  it('rejette toujours un rôle inconnu', () => {
    expect(parse([{ role: 'prisme' }]).problems).toEqual([
      expect.stringContaining('rôle de canal inconnu'),
    ])
  })

  it('relit inversions et plages de l’appareil, écarte une plage invalide', () => {
    const fixtures = [
      {
        id: 'a',
        name: 'A',
        profileId: 'moving-head-8',
        address: 1,
        invertPan: true,
        invertTilt: false,
        panRange: [10, 20],
        tiltRange: [30, 5],
      },
    ]
    const { fixtures: parsed, problems } = parseRig(fixtures, [])
    expect(parsed[0]).toMatchObject({ invertPan: true, panRange: [10, 20] })
    expect(parsed[0]).not.toHaveProperty('invertTilt')
    expect(parsed[0]).not.toHaveProperty('tiltRange')
    expect(problems).toEqual([expect.stringContaining('tiltRange invalide')])
  })
})

describe('non-régression', () => {
  it('une config existante sans nouveaux champs donne la même trame, octet par octet', () => {
    const config = {
      version: 1,
      lighting: {
        driver: 'usbpro',
        fixtures: [
          { id: 'par', name: 'PAR', profileId: 'par-drgbws', address: 1, desk: 1 },
          {
            id: 'head',
            name: 'Lyre',
            profileId: 'moving-head-8',
            address: 20,
            homePosition: { pan: 4660, tilt: 43_981 },
            deskPositions: { 1: { pan: 65_535, tilt: 1 } },
          },
          { id: 'old', name: 'Vieille lyre', profileId: 'old-spot', address: 40 },
        ],
        customProfiles: [
          {
            id: 'old-spot',
            name: 'Vieille lyre',
            kind: 'movingHead',
            channels: [
              { role: 'pan' },
              { role: 'tilt' },
              { role: 'fixed', value: 12 },
              { role: 'dimmer' },
              { role: 'strobe' },
            ],
          },
        ],
      },
    }
    const parsed = parseRoomHardwareConfig(config)
    expect(parsed.problems).toEqual([])
    // Aller-retour stable : aucun champ nouveau n'apparaît dans la config normalisée.
    const again = parseRoomHardwareConfig(JSON.parse(JSON.stringify(parsed.config)))
    expect(again.config).toEqual(parsed.config)
    expect(JSON.stringify(parsed.config.lighting)).not.toMatch(/invert|Range|slots/)

    const states = new Map<string, FixtureState>([
      ['par', lit({ color: { r: 200, g: 100, b: 50, w: 20 }, intensity: 0.5, strobe: 9 })],
      ['head', lit({ color: color(10, 20, 30), position: { pan: 0xabcd, tilt: 0x0102 } })],
      ['old', lit({ intensity: 0.25, strobe: 3, position: { pan: 300, tilt: 40_000 } })],
    ])
    const frame = renderUniverse(parsed.fixtures, states, 0)
    // Valeurs calculées à la main avec l'ancien rendu.
    expect([...frame.slice(0, 6)]).toEqual([128, 200, 100, 50, 20, 9])
    expect([...frame.slice(19, 27)]).toEqual([0xab, 0xcd, 0x01, 0x02, 255, 10, 20, 30])
    expect([...frame.slice(39, 44)]).toEqual([1, 156, 12, 64, 3])
    // Tout le reste de la trame est à zéro.
    const used = new Set([
      ...Array.from({ length: 6 }, (_value, index) => index),
      ...Array.from({ length: 8 }, (_value, index) => 19 + index),
      ...Array.from({ length: 5 }, (_value, index) => 39 + index),
    ])
    expect([...frame].every((value, index) => used.has(index) || value === 0)).toBe(true)
  })
})
