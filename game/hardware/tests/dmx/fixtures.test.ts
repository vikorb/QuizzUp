import type { FixtureState, ResolvedFixture } from '@hardware/dmx/fixtures'
import { darkState, parseRig, renderUniverse } from '@hardware/dmx/fixtures'
import { findProfile, GENERIC_PROFILES, hasRole } from '@hardware/dmx/profiles'

const resolved = (id: string, profileId: string, address: number, extra = {}): ResolvedFixture => {
  const profile = findProfile(profileId)
  if (!profile) {
    throw new Error(profileId)
  }
  return { id, name: id, profileId, address, profile, ...extra }
}

const lit = (state: Partial<FixtureState>): FixtureState => ({ ...darkState(), ...state })

describe('profils génériques', () => {
  it('ont des identifiants uniques et au moins un canal', () => {
    const ids = GENERIC_PROFILES.map((profile) => profile.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const profile of GENERIC_PROFILES) {
      expect(profile.channels.length).toBeGreaterThan(0)
    }
  })

  it('privilégient un profil sur mesure de même identifiant', () => {
    const custom = { id: 'par-rgb', name: 'Mon PAR', kind: 'par' as const, channels: [] }
    expect(findProfile('par-rgb', [custom])).toBe(custom)
    expect(findProfile('inconnu')).toBeNull()
    expect(hasRole(GENERIC_PROFILES[0]!, 'red')).toBe(true)
    expect(hasRole(GENERIC_PROFILES[0]!, 'pan')).toBe(false)
  })
})

describe('renderUniverse', () => {
  it('applique l’intensité aux couleurs sans canal gradateur', () => {
    const par = resolved('par', 'par-rgbw', 1)
    const universe = renderUniverse(
      [par],
      new Map([['par', lit({ color: { r: 200, g: 100, b: 50, w: 20 }, intensity: 0.5 })]]),
      0
    )
    expect([...universe.subarray(0, 4)]).toEqual([100, 50, 25, 10])
  })

  it('utilise le canal gradateur quand il existe', () => {
    const par = resolved('par', 'par-drgbws', 10)
    const universe = renderUniverse(
      [par],
      new Map([['par', lit({ color: { r: 200, g: 100, b: 50 }, intensity: 0.5, strobe: 30 })]]),
      0
    )
    expect([...universe.subarray(9, 15)]).toEqual([128, 200, 100, 50, 0, 30])
  })

  it('positionne une lyre sur 16 bits, repos par défaut au centre', () => {
    const head = resolved('head', 'moving-head-8', 20)
    const aimed = renderUniverse(
      [head],
      new Map([['head', lit({ position: { pan: 0x1234, tilt: 0xabcd }, intensity: 1 })]]),
      0
    )
    expect([...aimed.subarray(19, 24)]).toEqual([0x12, 0x34, 0xab, 0xcd, 255])

    const home = renderUniverse([head], new Map(), 0)
    expect([...home.subarray(19, 23)]).toEqual([0x80, 0x00, 0x80, 0x00])

    const custom = renderUniverse(
      [resolved('head', 'moving-head-8', 20, { homePosition: { pan: 0, tilt: 65_535 } })],
      new Map(),
      0
    )
    expect([...custom.subarray(19, 23)]).toEqual([0, 0, 255, 255])
  })

  it('ne pilote la fumée que par le niveau du contrôleur sécurisé', () => {
    const smoke = resolved('smoke', 'smoke-dmx', 100)
    const relay = resolved('relay', 'smoke-relay', 101)
    expect(renderUniverse([smoke, relay], new Map(), 0)[99]).toBe(0)
    const universe = renderUniverse([smoke, relay], new Map(), 120)
    expect(universe[99]).toBe(120)
    expect(universe[100]).toBe(255)
  })

  it('envoie les canaux fixes et ignore les canaux non pilotés', () => {
    const custom = {
      id: 'custom',
      name: 'Custom',
      profileId: 'x',
      address: 1,
      profile: {
        id: 'x',
        name: 'x',
        kind: 'par' as const,
        channels: [
          { role: 'fixed' as const, value: 200 },
          { role: 'amber' as const },
          { role: 'uv' as const, value: 7 },
          { role: 'fixed' as const },
        ],
      },
    }
    expect([...renderUniverse([custom], new Map(), 0).subarray(0, 4)]).toEqual([200, 0, 7, 0])
  })
})

describe('parseRig', () => {
  it('accepte une liste vide ou absente', () => {
    expect(parseRig(undefined, undefined)).toEqual({
      fixtures: [],
      customProfiles: [],
      problems: [],
    })
    expect(parseRig('x', undefined).problems).toEqual(['lighting.fixtures doit être une liste'])
  })

  it('résout les profils et garde les positions par pupitre', () => {
    const result = parseRig(
      [
        { id: 'par1', name: 'PAR pupitre 1', profileId: 'par-rgb', address: 1, desk: 1 },
        {
          id: 'head',
          name: 'Lyre',
          profileId: 'moving-head-8',
          address: 10,
          deskPositions: { 1: { pan: 1000, tilt: 2000 }, 3: { pan: 70_000, tilt: -5 }, 9: {} },
          homePosition: { pan: 5, tilt: 6 },
        },
      ],
      undefined
    )
    expect(result.problems).toEqual([])
    expect(result.fixtures[0]).toMatchObject({ desk: 1, profile: { id: 'par-rgb' } })
    expect(result.fixtures[1]?.deskPositions).toEqual({
      1: { pan: 1000, tilt: 2000 },
      3: { pan: 65_535, tilt: 0 },
    })
    expect(result.fixtures[1]?.homePosition).toEqual({ pan: 5, tilt: 6 })
  })

  it('signale les appareils invalides sans bloquer les autres', () => {
    const result = parseRig(
      [
        { id: 'ok', name: 'OK', profileId: 'par-rgb', address: 1 },
        { id: 'ok', name: 'Doublon', profileId: 'par-rgb', address: 50 },
        { name: 'Sans id', profileId: 'par-rgb', address: 60 },
        { id: 'p', name: 'Profil', profileId: 'nope', address: 70 },
        { id: 'a', name: 'Adresse', profileId: 'par-rgb', address: 0 },
        { id: 'f', name: 'Flottante', profileId: 'par-rgb', address: 1.5 },
        { id: 'o', name: 'Débord', profileId: 'par-rgbw', address: 510 },
        { id: 'c', name: 'Chevauche', profileId: 'par-rgb', address: 3 },
        null,
      ],
      undefined
    )
    expect(result.fixtures.map((fixture) => fixture.id)).toEqual(['ok'])
    expect(result.problems).toHaveLength(8)
    expect(result.problems.join('\n')).toContain('canal 3 déjà utilisé par « OK »')
    expect(result.problems.join('\n')).toContain("hors de l'univers")
  })

  it('accepte des profils sur mesure valides', () => {
    const result = parseRig(
      [{ id: 'spot', name: 'Spot maison', profileId: 'maison', address: 1 }],
      [
        {
          id: 'maison',
          name: 'Spot maison',
          kind: 'par',
          channels: [
            { role: 'fixed', value: 300 },
            { role: 'red' },
            { role: 'smoke', binary: true },
          ],
        },
        { id: 'vide', name: 'Vide', kind: 'par', channels: [] },
        { id: 'role', name: 'Rôle', kind: 'par', channels: [{ role: 'laser' }] },
        { id: 'kind', name: 'Type', kind: 'laser', channels: [{ role: 'red' }] },
        null,
      ]
    )
    expect(result.fixtures).toHaveLength(1)
    expect(result.customProfiles).toHaveLength(1)
    expect(result.customProfiles[0]?.channels).toEqual([
      { role: 'fixed', value: 255 },
      { role: 'red' },
      { role: 'smoke', binary: true },
    ])
    expect(result.problems).toHaveLength(4)
  })
})
