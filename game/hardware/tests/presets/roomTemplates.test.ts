import { parseRoomHardwareConfig } from '@hardware/config'
import { parseRig } from '@hardware/dmx/fixtures'
import type { RoomTemplate } from '@hardware/presets/roomTemplates'
import {
  createRigFromTemplate,
  proposeUniverses,
  ROOM_TEMPLATES,
} from '@hardware/presets/roomTemplates'

/** Nombre d'appareils et de canaux attendus de chaque modèle. */
const EXPECTED: Record<string, { fixtures: number; channels: number; desks: number }> = {
  'six-desks-eight-heads': { fixtures: 15, channels: 93, desks: 6 },
  'four-desks-four-par-rgbw': { fixtures: 4, channels: 16, desks: 4 },
  'four-desks-four-par-two-heads': { fixtures: 6, channels: 32, desks: 4 },
  'six-desks-six-par-two-heads': { fixtures: 8, channels: 34, desks: 6 },
}

const build = (template: RoomTemplate, startAddress?: number) => {
  const result = createRigFromTemplate(template, startAddress === undefined ? {} : { startAddress })
  if (!result.ok) {
    throw new Error(`modèle refusé : ${result.reason}`)
  }
  return result
}

describe('modèles de salle', () => {
  it('propose les quatre modèles de la conception, sous des identifiants distincts', () => {
    expect(ROOM_TEMPLATES.map((template) => template.name)).toEqual([
      '6 pupitres, 8 lyres',
      '4 pupitres, 4 PAR RVBW',
      '4 pupitres, 4 PAR + 2 lyres',
      '6 pupitres, 6 PAR RVB + 2 lyres',
    ])
    expect(new Set(ROOM_TEMPLATES.map((template) => template.id)).size).toBe(4)
    expect(Object.keys(EXPECTED).sort()).toEqual(
      ROOM_TEMPLATES.map((template) => template.id).sort()
    )
  })

  describe.each(ROOM_TEMPLATES.map((template) => [template.name, template] as const))(
    '%s',
    (_name, template) => {
      const expected = EXPECTED[template.id]!

      it('passe parseRig sans problème, avec le nombre d’appareils attendu', () => {
        const { fixtures, customProfiles } = build(template)
        const rig = parseRig(fixtures, customProfiles)
        expect(rig.problems).toEqual([])
        expect(rig.fixtures).toHaveLength(expected.fixtures)
      })

      it('met les appareils sur des adresses consécutives, sans chevauchement', () => {
        const { fixtures, customProfiles } = build(template)
        const rig = parseRig(fixtures, customProfiles)
        let next = 1
        for (const fixture of rig.fixtures) {
          expect(fixture.address).toBe(next)
          next += fixture.profile.channels.length
        }
        expect(next - 1).toBe(expected.channels)
      })

      it('ne contient aucun appareil de fumée', () => {
        const { fixtures, customProfiles } = build(template)
        for (const fixture of parseRig(fixtures, customProfiles).fixtures) {
          expect(fixture.profile.kind).not.toBe('smoke')
          expect(fixture.profile.channels.some((channel) => channel.role === 'smoke')).toBe(false)
        }
      })

      it('tient sous 20 000 caractères une fois enregistré, et la fumée y reste désactivée', () => {
        const { fixtures, customProfiles } = build(template)
        const { config, problems } = parseRoomHardwareConfig({
          desksCount: template.desksCount,
          lighting: { fixtures, customProfiles },
        })
        expect(problems).toEqual([])
        expect(config.lighting.smoke.enabled).toBe(false)
        expect(JSON.stringify(config).length).toBeLessThan(20_000)
      })

      it('rattache des appareils à des pupitres de la salle seulement', () => {
        for (const fixture of build(template).fixtures) {
          expect(fixture.desk === undefined || fixture.desk <= expected.desks).toBe(true)
        }
        expect(template.desksCount).toBe(expected.desks)
      })

      it('donne une copie neuve à chaque appel', () => {
        const first = build(template)
        first.fixtures[0]!.name = 'modifié'
        first.customProfiles.pop()
        const second = build(template)
        expect(second.fixtures[0]!.name).not.toBe('modifié')
        expect(second.customProfiles).toHaveLength(template.customProfiles.length)
      })
    }
  )

  it('reprend le préréglage 6 pupitres : mêmes appareils, mêmes profils', () => {
    const { fixtures, customProfiles } = build(ROOM_TEMPLATES[0]!)
    expect(fixtures.filter((fixture) => fixture.profileId.startsWith('six-desk-'))).toHaveLength(8)
    expect(customProfiles.map((profile) => profile.id)).toEqual([
      'six-desk-spot-9',
      'six-desk-wash-9',
    ])
  })

  it('décale toutes les adresses à partir de l’adresse de départ', () => {
    const { fixtures } = build(ROOM_TEMPLATES[1]!, 101)
    expect(fixtures.map((fixture) => fixture.address)).toEqual([101, 105, 109, 113])
    expect(parseRig(fixtures, []).problems).toEqual([])
  })

  it('tient pile jusqu’au canal 512, pas au-delà', () => {
    const template = ROOM_TEMPLATES[0]!
    expect(createRigFromTemplate(template, { startAddress: 420 }).ok).toBe(true)
    expect(createRigFromTemplate(template, { startAddress: 421 })).toEqual({
      ok: false,
      reason: 'does_not_fit',
    })
  })

  it('refuse une adresse de départ qui n’est pas un entier de 1 à 512', () => {
    for (const startAddress of [0, -1, 513, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(createRigFromTemplate(ROOM_TEMPLATES[1]!, { startAddress })).toEqual({
        ok: false,
        reason: 'invalid_start_address',
      })
    }
  })

  describe('jamais de fumée', () => {
    const base: RoomTemplate = {
      id: 'test',
      name: 'Test',
      desksCount: 1,
      customProfiles: [],
      fixtures: [{ id: 'par', name: 'PAR', profileId: 'par-rgb' }],
    }

    it('refuse un modèle qui contient une machine à fumée', () => {
      for (const profileId of ['smoke-relay', 'smoke-dmx']) {
        const template = {
          ...base,
          fixtures: [...base.fixtures, { id: 'fumee', name: 'Fumée', profileId }],
        }
        expect(createRigFromTemplate(template)).toEqual({ ok: false, reason: 'smoke_forbidden' })
      }
    })

    it('refuse aussi un profil sur mesure qui porte un canal de fumée', () => {
      const template: RoomTemplate = {
        ...base,
        customProfiles: [
          {
            id: 'mixte',
            name: 'PAR + fumée',
            kind: 'par',
            channels: [{ role: 'red' }, { role: 'smoke' }],
          },
        ],
        fixtures: [{ id: 'x', name: 'X', profileId: 'mixte' }],
      }
      expect(createRigFromTemplate(template)).toEqual({ ok: false, reason: 'smoke_forbidden' })
    })

    it('refuse un profil inconnu', () => {
      const template = { ...base, fixtures: [{ id: 'x', name: 'X', profileId: 'nulle-part' }] }
      expect(createRigFromTemplate(template)).toEqual({ ok: false, reason: 'unknown_profile' })
    })
  })
})

describe('proposeUniverses', () => {
  const fixtures = [{ id: 'a' }, { id: 'b' }, { id: 'c', universe: 0 }]

  it('nœud en 0.0.1 : tous les appareils passent sur l’univers interne 1', () => {
    expect(proposeUniverses({ universes: ['0.0.1'] }, fixtures)).toEqual([
      { fixtureId: 'a', universe: 1 },
      { fixtureId: 'b', universe: 1 },
      { fixtureId: 'c', universe: 1 },
    ])
  })

  it('nœud en 0.0.2 : tous les appareils passent sur l’univers interne 2', () => {
    expect(proposeUniverses({ universes: ['0.0.2'] }, fixtures)).toEqual([
      { fixtureId: 'a', universe: 2 },
      { fixtureId: 'b', universe: 2 },
      { fixtureId: 'c', universe: 2 },
    ])
  })

  it('deux sorties : les groupes d’appareils gardent leur regroupement, dans l’ordre', () => {
    const grouped = [
      { id: 'lyre', universe: 0 },
      { id: 'led', universe: 1 },
      { id: 'fond', universe: 0 },
    ]
    const expected = [
      { fixtureId: 'lyre', universe: 1 },
      { fixtureId: 'led', universe: 2 },
      { fixtureId: 'fond', universe: 1 },
    ]
    expect(proposeUniverses({ universes: ['0.0.1', '0.0.2'] }, grouped)).toEqual(expected)
    expect(proposeUniverses({ universes: ['0.0.2', '0.0.1', '0.0.2'] }, grouped)).toEqual(expected)
  })

  it('ne liste que les appareils qui changent d’univers', () => {
    const placed = [
      { id: 'bon', universe: 1 },
      { id: 'autre', universe: 0 },
    ]
    // Univers utilisés 0 et 1, une seule sortie : pas de proposition.
    expect(proposeUniverses({ universes: ['0.0.1'] }, placed)).toBeNull()
    expect(proposeUniverses({ universes: ['0.0.1', '0.0.2'] }, placed)).toEqual([
      { fixtureId: 'bon', universe: 2 },
      { fixtureId: 'autre', universe: 1 },
    ])
    expect(proposeUniverses({ universes: ['0.0.0', '0.0.1'] }, placed)).toBeNull()
    // Le groupe déjà sur l'univers 1 y reste, seul l'autre bouge.
    expect(
      proposeUniverses({ universes: ['0.0.1', '0.0.3'] }, [
        { id: 'reste', universe: 1 },
        { id: 'bouge', universe: 2 },
      ])
    ).toEqual([{ fixtureId: 'bouge', universe: 3 }])
  })

  it('accepte la sortie 0.0.15, refuse 0.0.16', () => {
    expect(proposeUniverses({ universes: ['0.0.15'] }, fixtures)).toHaveLength(3)
    expect(proposeUniverses({ universes: ['0.0.16'] }, fixtures)).toBeNull()
  })

  it('aucune proposition : sortie hors de 0..15, autre net ou sub-net, texte illisible', () => {
    for (const universes of [
      ['0.0.20'],
      ['0.1.0'],
      ['1.0.1'],
      ['1'],
      ['0.0.-1'],
      ['x'],
      ['0.0.1.2'],
    ]) {
      expect(proposeUniverses({ universes }, fixtures)).toBeNull()
    }
  })

  it('une sortie inaccessible ne gêne pas celles qui le sont', () => {
    expect(proposeUniverses({ universes: ['0.1.0', '0.0.3'] }, fixtures)).toEqual([
      { fixtureId: 'a', universe: 3 },
      { fixtureId: 'b', universe: 3 },
      { fixtureId: 'c', universe: 3 },
    ])
  })

  it('aucune proposition pour un nœud sans univers annoncés', () => {
    expect(proposeUniverses({}, fixtures)).toBeNull()
    expect(proposeUniverses({ universes: [] }, fixtures)).toBeNull()
  })

  it('aucune proposition sans appareil, ou avec plus d’univers utilisés que de sorties', () => {
    expect(proposeUniverses({ universes: ['0.0.1'] }, [])).toBeNull()
    expect(
      proposeUniverses({ universes: ['0.0.1'] }, [
        { id: 'a', universe: 0 },
        { id: 'b', universe: 1 },
      ])
    ).toBeNull()
  })

  it('aucune proposition quand les appareils sont déjà placés', () => {
    expect(proposeUniverses({ universes: ['0.0.1'] }, [{ id: 'a', universe: 1 }])).toBeNull()
    expect(proposeUniverses({ universes: ['0.0.0'] }, fixtures)).toBeNull()
  })

  it('ne modifie pas les appareils reçus', () => {
    const input = [{ id: 'a', universe: 0 }]
    proposeUniverses({ universes: ['0.0.1'] }, input)
    expect(input).toEqual([{ id: 'a', universe: 0 }])
  })

  it('les univers proposés pour un modèle de salle passent parseRig une fois appliqués', () => {
    const { fixtures: rigFixtures, customProfiles } = build(ROOM_TEMPLATES[0]!)
    const proposal = proposeUniverses({ universes: ['0.0.1'] }, rigFixtures) ?? []
    const placed = rigFixtures.map((fixture) => ({
      ...fixture,
      universe: proposal.find((change) => change.fixtureId === fixture.id)?.universe,
    }))
    expect(placed.every((fixture) => fixture.universe === 1)).toBe(true)
    expect(parseRig(placed, customProfiles).problems).toEqual([])
  })
})
