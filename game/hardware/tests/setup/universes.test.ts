import { createDefaultKeymap } from '@hardware/buzzers/keymap'
import { createSetupWizard } from '@hardware/setup/setupWizard'

const goodBrowser = { webSerial: true, secureContext: true, gamepad: true }

const atFixtures = (driver: 'usbpro' | 'artnet-bridge') => {
  const wizard = createSetupWizard()
  wizard.setBrowserCheck(goodBrowser)
  wizard.setKeymap(createDefaultKeymap())
  wizard.setDriver(driver)
  expect(wizard.goTo('fixtures')).toEqual({ ok: true })
  return wizard
}

describe('assistant d’installation : univers DMX', () => {
  it('propose la première adresse libre univers par univers', () => {
    const wizard = atFixtures('artnet-bridge')
    const first = wizard.addFixture({ profileId: 'par-rgb', address: 1 })
    expect(first).toMatchObject({ ok: true })
    // Même adresse, autre univers : libre.
    expect(wizard.suggestAddress(3)).toBe(4)
    expect(wizard.suggestAddress(3, 1)).toBe(1)
    expect(wizard.suggestAddress(3, 16)).toBeNull()
    const second = wizard.addFixture({ profileId: 'par-rgb', address: 1, universe: 1 })
    expect(second).toMatchObject({ ok: true, fixture: { address: 1, universe: 1 } })
    expect(wizard.addFixture({ profileId: 'par-rgb', address: 2, universe: 1 })).toMatchObject({
      ok: false,
      reason: 'conflict',
    })
  })

  it('n’enregistre pas l’univers 0 : la config reste celle d’avant', () => {
    const wizard = atFixtures('artnet-bridge')
    const added = wizard.addFixture({ profileId: 'par-rgb', universe: 0 })
    expect(added.ok && added.fixture).not.toHaveProperty('universe')
  })

  it('refuse un univers hors 0-15, à l’ajout comme à la modification', () => {
    const wizard = atFixtures('artnet-bridge')
    expect(wizard.addFixture({ profileId: 'par-rgb', universe: 16 })).toEqual({
      ok: false,
      reason: 'invalid_universe',
    })
    expect(wizard.addFixture({ profileId: 'par-rgb', universe: -1 })).toMatchObject({
      reason: 'invalid_universe',
    })
    const added = wizard.addFixture({ profileId: 'par-rgb' })
    const id = added.ok ? added.fixture.id : ''
    expect(wizard.updateFixture(id, { universe: 99 })).toEqual({
      ok: false,
      reason: 'invalid_universe',
    })
    expect(wizard.updateFixture(id, { universe: 3 })).toEqual({ ok: true })
    expect(wizard.getState().config.lighting.fixtures[0]!.universe).toBe(3)
  })

  it('déplacer un appareil vers un univers déjà occupé à cette adresse est un conflit', () => {
    const wizard = atFixtures('artnet-bridge')
    wizard.addFixture({ profileId: 'par-rgb', address: 1 })
    const other = wizard.addFixture({ profileId: 'par-rgb', address: 1, universe: 1 })
    const id = other.ok ? other.fixture.id : ''
    const moved = wizard.updateFixture(id, { universe: 0 })
    expect(moved.ok).toBe(false)
  })

  it('bloque l’étape et signale au récapitulatif un appareil hors de l’univers 0 sur USB', () => {
    const wizard = atFixtures('usbpro')
    wizard.addFixture({ profileId: 'par-rgb', address: 1, universe: 1, name: 'PAR haut' })
    expect(wizard.blockers()).toEqual([
      expect.stringContaining('« PAR haut » : univers 1 non pris'),
    ])
    expect(wizard.summary().problems).toEqual(
      expect.arrayContaining([expect.stringContaining('« PAR haut » : univers 1 non pris')])
    )
    // Passer au pont Art-Net règle le problème, sans toucher à l'appareil.
    wizard.setDriver('artnet-bridge')
    expect(wizard.blockers()).toEqual([])
    expect(wizard.summary().problems.some((problem) => problem.includes('univers 1'))).toBe(false)
  })
})
