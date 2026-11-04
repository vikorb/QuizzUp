import {
  buildOutputPlan,
  defaultMappings,
  describePlan,
  MAX_MAPPINGS,
  parseMappingEntry,
  parseMappingSpec,
  renderOutputs,
} from '@bridge/mapping'

const internalWithChannels = (values: Record<number, number>) => {
  const internal = new Uint8Array(512)
  for (const [channel, value] of Object.entries(values)) {
    internal[Number(channel) - 1] = value
  }
  return internal
}

describe('lecture des mappages', () => {
  it('lit DEBUT-FIN:NET.SUB.UNI@DEPART', () => {
    expect(parseMappingSpec('1-72:0.0.1@1')).toEqual({
      from: 1,
      to: 72,
      output: { net: 0, subnet: 0, universe: 1 },
      start: 1,
    })
    expect(parseMappingSpec(' 128-148:0.0.2@1 ')).toEqual({
      from: 128,
      to: 148,
      output: { net: 0, subnet: 0, universe: 2 },
      start: 1,
    })
  })

  it('accepte un canal seul, une adresse 15 bits et un départ implicite', () => {
    expect(parseMappingSpec('40:17')).toEqual({
      from: 40,
      to: 40,
      output: { net: 0, subnet: 1, universe: 1 },
      start: 40,
    })
  })

  it('explique les mappages illisibles', () => {
    expect(() => parseMappingSpec('1-72')).toThrow('Mappage illisible')
    expect(() => parseMappingSpec('1-72:0.0.1@')).toThrow('Mappage illisible')
    expect(() => parseMappingSpec('1-72:0.0.99@1')).toThrow('univers Art-Net invalide « 0.0.99 »')
  })

  it('lit la forme objet du fichier de configuration', () => {
    expect(parseMappingEntry({ from: 1, to: 72, output: '0.0.1', start: 1 })).toEqual(
      parseMappingSpec('1-72:0.0.1@1')
    )
    expect(parseMappingEntry({ from: 5, output: 3 })).toEqual({
      from: 5,
      to: 5,
      output: { net: 0, subnet: 0, universe: 3 },
      start: 5,
    })
    expect(parseMappingEntry('1-2:0.0.0@1').to).toBe(2)
    for (const bad of [
      null,
      [],
      3,
      { from: 1 },
      { from: '1', output: '0.0.1' },
      { from: 1, output: true },
    ]) {
      expect(() => parseMappingEntry(bad)).toThrow('Mappage invalide')
    }
  })
})

describe('plan d’envoi', () => {
  it('recopie par défaut l’univers interne tel quel', () => {
    const plan = buildOutputPlan(defaultMappings())
    expect(plan.outputs).toHaveLength(1)
    expect(plan.outputs[0]!.address).toEqual({ net: 0, subnet: 0, universe: 0 })
    const internal = internalWithChannels({ 1: 10, 512: 20 })
    expect(renderOutputs(plan, internal)[0]).toEqual(internal)
    expect(describePlan(plan)).toEqual(['canaux internes 1-512 → Art-Net 0.0.0 canaux 1-512'])
  })

  it('répartit la salle Showtec NET-2/3 sur deux univers', () => {
    const plan = buildOutputPlan([
      parseMappingSpec('1-72:0.0.1@1'),
      parseMappingSpec('128-148:0.0.2@1'),
    ])
    expect(plan.outputs.map((output) => output.key)).toEqual([1, 2])
    const internal = internalWithChannels({
      1: 11,
      72: 72,
      73: 99,
      127: 99,
      128: 128,
      148: 148,
      149: 99,
    })
    const [lyres, leds] = renderOutputs(plan, internal)
    expect(lyres![0]).toBe(11)
    expect(lyres![71]).toBe(72)
    expect(lyres![72]).toBe(0)
    expect(lyres!.slice(72).every((value) => value === 0)).toBe(true)
    expect(leds![0]).toBe(128)
    expect(leds![20]).toBe(148)
    expect(leds!.slice(21).every((value) => value === 0)).toBe(true)
    expect(describePlan(plan)).toEqual([
      'canaux internes 1-72 → Art-Net 0.0.1 canaux 1-72',
      'canaux internes 128-148 → Art-Net 0.0.2 canaux 1-21',
    ])
  })

  it('regroupe plusieurs plages vers le même univers, dans l’ordre d’apparition', () => {
    const plan = buildOutputPlan([
      parseMappingSpec('10-12:0.0.3@1'),
      parseMappingSpec('1-2:0.0.1@1'),
      parseMappingSpec('20-21:0.0.3@100'),
    ])
    expect(plan.outputs.map((output) => output.key)).toEqual([3, 1])
    const [third] = renderOutputs(plan, internalWithChannels({ 10: 1, 12: 3, 20: 4, 21: 5 }))
    expect([...third!.subarray(0, 3)]).toEqual([1, 0, 3])
    expect([...third!.subarray(99, 101)]).toEqual([4, 5])
  })

  it('autorise à recopier une même plage vers plusieurs univers', () => {
    const plan = buildOutputPlan([parseMappingSpec('1-3:0.0.1@1'), parseMappingSpec('1-3:0.0.2@1')])
    const outputs = renderOutputs(plan, internalWithChannels({ 1: 9 }))
    expect(outputs.map((output) => output[0])).toEqual([9, 9])
  })

  it('refuse les plages invalides, qui débordent ou se chevauchent', () => {
    expect(() => buildOutputPlan([])).toThrow('Aucun mappage')
    expect(() => buildOutputPlan([parseMappingSpec('0-3:0.0.1@1')])).toThrow(
      'plage interne invalide'
    )
    expect(() => buildOutputPlan([parseMappingSpec('5-3:0.0.1@1')])).toThrow(
      'plage interne invalide'
    )
    expect(() => buildOutputPlan([parseMappingSpec('1-513:0.0.1@1')])).toThrow(
      'plage interne invalide'
    )
    expect(() => buildOutputPlan([parseMappingSpec('1-72:0.0.1@450')])).toThrow(
      "déborde de l'univers de sortie (canaux 450 à 521"
    )
    expect(() => buildOutputPlan([parseMappingSpec('1-2:0.0.1@0')])).toThrow('déborde')
    expect(() =>
      buildOutputPlan([parseMappingSpec('1-72:0.0.1@1'), parseMappingSpec('128-148:0.0.1@72')])
    ).toThrow('Mappages 1-72:0.0.1@1 et 128-148:0.0.1@72 : ils écrivent sur les mêmes canaux')
    expect(() =>
      buildOutputPlan([parseMappingSpec('1-72:0.0.1@1'), parseMappingSpec('128-148:0.0.1@73')])
    ).not.toThrow()
    expect(() =>
      buildOutputPlan(
        Array.from({ length: MAX_MAPPINGS + 1 }, (_unused, index) =>
          parseMappingSpec(`${index + 1}:0.0.${index % 16}`)
        )
      )
    ).toThrow('Trop de mappages')
  })
})
