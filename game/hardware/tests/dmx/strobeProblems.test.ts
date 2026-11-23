import { parseRoomHardwareConfig } from '@hardware/config'
import { parseRig } from '@hardware/dmx/fixtures'
import { createSetupWizard } from '@hardware/setup/setupWizard'

type Channel = Record<string, unknown>

/** Un appareil « Spot maison » dont le profil a ces canaux, adresse 10 (le canal testé est le 2e). */
const lighting = (channels: Channel[]) => ({
  fixtures: [{ id: 'spot', name: 'Spot maison', profileId: 'maison', address: 10 }],
  customProfiles: [{ id: 'maison', name: 'Maison', kind: 'par', channels }],
})

const problemsOf = (channels: Channel[]) =>
  parseRoomHardwareConfig({ lighting: lighting(channels) }).problems

describe('avertissement : appareil qui clignote tout seul', () => {
  it('signale un canal shutter dans la plage stroboscope, en fr et en, avec appareil et canal', () => {
    const problems = problemsOf([
      { role: 'dimmer' },
      { role: 'shutter', open: 100, strobeRange: [10, 200] },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(
      'Appareil « Spot maison » : le canal 11 (shutter) est réglé sur 100'
    )
    expect(problems[0]).toContain('plage stroboscope 10-200')
    expect(problems[0]).toContain('Fixture "Spot maison": channel 11 (shutter) is set to 100')
    expect(problems[0]).toContain('strobe range 10-200')
  })

  it('signale la valeur de fermeture d’un shutter si elle tombe dans la plage', () => {
    const problems = problemsOf([
      { role: 'shutter', open: 255, closed: 20, strobeRange: [10, 200] },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('réglé sur 20')
  })

  it('signale un canal fixed dans la plage stroboscope', () => {
    const problems = problemsOf([
      { role: 'dimmer' },
      { role: 'fixed', value: 50, strobeRange: [40, 60] },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('le canal 11 (fixed) est réglé sur 50')
    expect(problems[0]).toContain('plage stroboscope 40-60')
  })

  it('ne dit rien pour une valeur hors de la plage (bornes comprises dans la plage)', () => {
    expect(problemsOf([{ role: 'fixed', value: 39, strobeRange: [40, 60] }])).toEqual([])
    expect(problemsOf([{ role: 'fixed', value: 61, strobeRange: [40, 60] }])).toEqual([])
    expect(problemsOf([{ role: 'fixed', value: 0, strobeRange: [40, 60] }])).toEqual([])
    expect(problemsOf([{ role: 'shutter', open: 255, closed: 0, strobeRange: [10, 200] }])).toEqual(
      []
    )
    expect(problemsOf([{ role: 'fixed', value: 40, strobeRange: [40, 60] }])).toHaveLength(1)
    expect(problemsOf([{ role: 'fixed', value: 60, strobeRange: [40, 60] }])).toHaveLength(1)
  })

  it('sans plage connue : avertissement générique pour un shutter ni ouvert ni fermé', () => {
    const problems = problemsOf([{ role: 'dimmer' }, { role: 'shutter', open: 128 }])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('« Spot maison »')
    expect(problems[0]).toContain('canal 11 (shutter)')
    expect(problems[0]).toContain('plage stroboscope du profil est inconnue')
    expect(problems[0]).toContain('strobe range is unknown')
  })

  it('sans plage connue : rien pour un shutter ouvert à 255 ou fermé à 0, ni pour un fixed', () => {
    expect(problemsOf([{ role: 'shutter' }])).toEqual([])
    expect(problemsOf([{ role: 'shutter', open: 255, closed: 0 }])).toEqual([])
    expect(problemsOf([{ role: 'fixed', value: 128 }])).toEqual([])
  })

  it('ne dit rien pour les profils livrés (lyres génériques comprises)', () => {
    const result = parseRoomHardwareConfig({
      lighting: {
        fixtures: [
          { id: 'a', name: 'Lyre 9', profileId: 'moving-head-spot-9', address: 1 },
          { id: 'b', name: 'Lyre 16', profileId: 'moving-head-spot-16', address: 20 },
          { id: 'c', name: 'PAR', profileId: 'par-drgbws', address: 50 },
        ],
      },
    })
    expect(result.problems).toEqual([])
  })

  it('ignore une plage invalide et le dit, sans écarter le profil', () => {
    const channels = [
      { role: 'fixed', value: 5, strobeRange: [200, 10] },
      { role: 'fixed', value: 5, strobeRange: [0, 300] },
      { role: 'fixed', value: 5, strobeRange: 'x' },
    ]
    const result = parseRig(lighting(channels).fixtures, lighting(channels).customProfiles)
    expect(result.customProfiles[0]?.channels).toEqual([
      { role: 'fixed', value: 5 },
      { role: 'fixed', value: 5 },
      { role: 'fixed', value: 5 },
    ])
    expect(result.problems).toEqual([
      'Profil sur mesure maison : 3 strobeRange invalide(s) ignorée(s) ([min, max] de 0 à 255, min ≤ max)',
    ])
  })

  it('garde la plage valide dans le profil relu', () => {
    const { config } = parseRoomHardwareConfig({
      lighting: lighting([{ role: 'shutter', strobeRange: [10, 200] }]),
    })
    expect(config.lighting.customProfiles[0]?.channels).toEqual([
      { role: 'shutter', strobeRange: [10, 200] },
    ])
  })

  it('reste un avertissement : l’appareil est conservé et la config enregistrable', () => {
    const { config, fixtures, problems } = parseRoomHardwareConfig({
      lighting: lighting([{ role: 'fixed', value: 50, strobeRange: [40, 60] }]),
    })
    expect(problems).toHaveLength(1)
    expect(fixtures.map((fixture) => fixture.id)).toEqual(['spot'])
    expect(config.lighting.fixtures).toHaveLength(1)
  })

  it('l’assistant le range parmi les avertissements, pas parmi les points bloquants', () => {
    const { config } = parseRoomHardwareConfig({
      lighting: lighting([{ role: 'fixed', value: 50, strobeRange: [40, 60] }]),
    })
    const summary = createSetupWizard(config).summary()
    expect(summary.warnings.some((warning) => warning.includes('plage stroboscope 40-60'))).toBe(
      true
    )
    expect(summary.problems.some((problem) => problem.includes('plage stroboscope'))).toBe(false)
  })
})
