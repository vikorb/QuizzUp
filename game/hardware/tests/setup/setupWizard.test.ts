import { createDefaultKeymap } from '@hardware/buzzers/keymap'
import { gamepadMatcher, parseRoomHardwareConfig } from '@hardware/config'
import { parsePanTiltCalibration } from '@hardware/presets/sixDeskRoom'
import {
  checkBrowser,
  createSetupWizard,
  SMOKE_CHECKS,
  TIMED_RELAY_MAX_MS,
} from '@hardware/setup/setupWizard'

const goodBrowser = { webSerial: true, secureContext: true, gamepad: true }

/** Assistant arrivé à l'étape des appareils, buzzers appris, interface USB Pro. */
const atFixtures = () => {
  const wizard = createSetupWizard()
  wizard.setBrowserCheck(goodBrowser)
  wizard.setKeymap(createDefaultKeymap())
  wizard.setDriver('usbpro')
  expect(wizard.goTo('fixtures')).toEqual({ ok: true })
  return wizard
}

describe('assistant d’installation : navigateur', () => {
  it('détecte Web Serial, le contexte sécurisé et l’API Gamepad', () => {
    expect(
      checkBrowser({
        navigator: { serial: {}, getGamepads: () => [] },
        isSecureContext: true,
      })
    ).toEqual(goodBrowser)
    expect(checkBrowser({ navigator: {}, isSecureContext: false })).toEqual({
      webSerial: false,
      secureContext: false,
      gamepad: false,
    })
    expect(checkBrowser({ navigator: null })).toMatchObject({ webSerial: false })
    expect(checkBrowser()).toHaveProperty('webSerial')
  })

  it('ne passe pas l’étape navigateur sans vérification', () => {
    const wizard = createSetupWizard()
    expect(wizard.getState().step).toBe('browser')
    expect(wizard.blockers()).toHaveLength(1)
    expect(wizard.next()).toEqual({ ok: false, reason: 'blocked' })
    expect(wizard.back()).toEqual({ ok: false, reason: 'first_step' })
    wizard.setBrowserCheck(goodBrowser)
    expect(wizard.next()).toEqual({ ok: true })
    expect(wizard.getState().step).toBe('buzzers')
  })
})

describe('assistant d’installation : buzzers et interface', () => {
  it('exige tous les boutons des pupitres équipés', () => {
    const wizard = createSetupWizard()
    wizard.setBrowserCheck(goodBrowser)
    wizard.next()
    expect(wizard.blockers()[0]).toContain('16 bouton(s)')
    wizard.setKeymap(createDefaultKeymap())
    expect(wizard.blockers()).toEqual([])

    // Six pupitres : il manque les pupitres 5 et 6.
    wizard.setDesks([1, 2, 3, 4, 5, 6])
    expect(wizard.blockers()[0]).toContain('8 bouton(s)')
    wizard.setDesks([1, 2])
    expect(wizard.getState().desks).toEqual([1, 2])
    wizard.setDesks([])
    expect(wizard.getState().desks).toEqual([1, 2])
    expect(wizard.next()).toEqual({ ok: true })
  })

  it('enregistre une carte manette choisie par son nom', () => {
    const wizard = createSetupWizard()
    wizard.setBuzzerSource({ kind: 'gamepad', match: 'Leo Bodnar' })
    const { config } = wizard.summary()
    expect(config.buzzers.source).toEqual({ kind: 'gamepad', match: 'Leo Bodnar' })
    const match = gamepadMatcher(config.buzzers.source)
    expect(match?.('Leo Bodnar BU0836X (Vendor: 1dd2)')).toBe(true)
    expect(match?.('Xbox Controller')).toBe(false)

    wizard.setBuzzerSource({ kind: 'gamepad' })
    expect(wizard.summary().config.buzzers.source).toEqual({ kind: 'gamepad' })
    expect(gamepadMatcher({ kind: 'gamepad' })).toBeUndefined()
    wizard.setBuzzerSource({ kind: 'keyboard' })
    expect(wizard.summary().config.buzzers.source).toEqual({ kind: 'keyboard' })
    expect(gamepadMatcher({ kind: 'keyboard' })).toBeUndefined()
  })

  it('refuse une interface USB si le navigateur ne sait pas la piloter', () => {
    const wizard = createSetupWizard()
    wizard.setBrowserCheck({ webSerial: false, secureContext: true, gamepad: true })
    wizard.setKeymap(createDefaultKeymap())
    expect(wizard.setDriver('usbpro')).toEqual({ ok: true })
    expect(wizard.goTo('fixtures')).toEqual({ ok: false, reason: 'blocked' })
    expect(wizard.getState().step).toBe('interface')
    expect(wizard.blockers()[0]).toContain('Chrome ou Edge')
    expect(wizard.setDriver('simulation')).toEqual({ ok: true })
    expect(wizard.next()).toEqual({ ok: true })
    expect(wizard.setDriver('nimporte' as never)).toEqual({ ok: false, reason: 'unknown_driver' })
  })
})

describe('assistant d’installation : appareils', () => {
  it('propose la première adresse libre et refuse les chevauchements', () => {
    const wizard = atFixtures()
    expect(wizard.suggestAddress(3)).toBe(1)
    const par = wizard.addFixture({ profileId: 'par-rgb', name: 'PAR pupitre 1', desk: 1 })
    expect(par).toMatchObject({ ok: true, fixture: { id: 'par-pupitre-1', address: 1, desk: 1 } })
    const second = wizard.addFixture({ profileId: 'par-rgb', name: 'PAR pupitre 1' })
    expect(second).toMatchObject({ ok: true, fixture: { id: 'par-pupitre-1-2', address: 4 } })

    expect(wizard.addFixture({ profileId: 'par-rgb', address: 2 })).toEqual({
      ok: false,
      reason: 'conflict',
      detail: 'canal 2 déjà utilisé par « PAR pupitre 1 »',
    })
    expect(wizard.addFixture({ profileId: 'par-rgb', address: 511 })).toEqual({
      ok: false,
      reason: 'invalid_address',
    })
    expect(wizard.addFixture({ profileId: 'inconnu' })).toEqual({
      ok: false,
      reason: 'unknown_profile',
    })
    // Un trou entre deux appareils est réutilisé.
    wizard.addFixture({ profileId: 'par-rgb', address: 10 })
    expect(wizard.suggestAddress(3)).toBe(7)
    expect(wizard.suggestAddress(4)).toBe(13)
    expect(wizard.suggestAddress(0)).toBeNull()
    expect(wizard.suggestAddress(600)).toBeNull()
    expect(wizard.addFixture({ profileId: 'dimmer', name: '  ' })).toMatchObject({
      ok: true,
      fixture: { name: 'Gradateur simple (1 canal)' },
    })
  })

  it('signale un univers plein', () => {
    const wizard = atFixtures()
    for (let index = 0; index < 512; index += 1) {
      wizard.addFixture({ profileId: 'dimmer' })
    }
    expect(wizard.suggestAddress(1)).toBeNull()
    expect(wizard.addFixture({ profileId: 'dimmer' })).toEqual({ ok: false, reason: 'no_room' })
  })

  it('modifie et retire un appareil', () => {
    const wizard = atFixtures()
    wizard.addFixture({ profileId: 'par-rgb', name: 'A' })
    wizard.addFixture({ profileId: 'par-rgb', name: 'B', address: 10 })
    expect(wizard.updateFixture('a', { address: 9 })).toEqual({
      ok: false,
      reason: 'canal 10 déjà utilisé par « B »',
    })
    expect(wizard.updateFixture('a', { address: 0 })).toEqual({
      ok: false,
      reason: 'invalid_address',
    })
    expect(wizard.updateFixture('a', { profileId: 'inconnu' })).toEqual({
      ok: false,
      reason: 'unknown_profile',
    })
    expect(wizard.updateFixture('zzz', { address: 5 })).toEqual({
      ok: false,
      reason: 'unknown_fixture',
    })
    // Déplacer un appareil sur sa propre plage est permis.
    expect(wizard.updateFixture('a', { address: 2 })).toEqual({ ok: true })
    wizard.removeFixture('b')
    expect(wizard.getState().config.lighting.fixtures.map((fixture) => fixture.id)).toEqual(['a'])
  })

  it('importe la salle 6 pupitres avec les positions reprises', () => {
    const wizard = atFixtures()
    wizard.addFixture({ profileId: 'par-rgb' })
    const calibration = parsePanTiltCalibration('Pupitre1:150-77;\nHead1:10-20;')
    wizard.importSixDeskPreset({ calibration })
    const state = wizard.getState()
    expect(state.desks).toEqual([1, 2, 3, 4, 5, 6])
    expect(state.config.lighting.fixtures.some((fixture) => fixture.id === 'par-rgb')).toBe(false)
    expect(state.config.lighting.customProfiles.length).toBeGreaterThan(0)
    expect(state.steps).toContain('positions')
    expect(wizard.blockers()).toEqual([])

    // Importer deux fois ne duplique pas les profils.
    const profiles = state.config.lighting.customProfiles.length
    wizard.importSixDeskPreset()
    expect(wizard.getState().config.lighting.customProfiles).toHaveLength(profiles)
  })
})

describe('assistant d’installation : tests et positions', () => {
  it('exige un test réussi par appareil lumière, et le perd quand l’adresse change', () => {
    const wizard = atFixtures()
    wizard.addFixture({ profileId: 'par-rgb', name: 'A' })
    wizard.addFixture({ profileId: 'smoke-dmx', name: 'Fumée' })
    expect(wizard.next()).toEqual({ ok: true })
    expect(wizard.getState().step).toBe('fixtureTest')
    expect(wizard.blockers()).toEqual(['« A » pas encore testé'])
    wizard.markFixtureTest('a', 'ko')
    expect(wizard.blockers()[0]).toContain('ne répond pas')
    expect(wizard.markFixtureTest('zzz', 'ok')).toEqual({ ok: false, reason: 'unknown_fixture' })
    wizard.markFixtureTest('a', 'ok')
    expect(wizard.blockers()).toEqual([])

    wizard.updateFixture('a', { name: 'A bis' })
    expect(wizard.blockers()).toEqual([])
    wizard.updateFixture('a', { address: 100 })
    expect(wizard.blockers()).toHaveLength(1)
    wizard.markFixtureTest('a', 'ok')
    // Changer d'interface invalide tous les tests.
    wizard.setDriver('opendmx')
    expect(wizard.getState().fixtureTests).toEqual({})
  })

  it('saute les étapes lyres et fumée sans appareil concerné', () => {
    const wizard = atFixtures()
    expect(wizard.getState().steps).toEqual([
      'browser',
      'buzzers',
      'interface',
      'fixtures',
      'summary',
    ])
    expect(wizard.goTo('smoke')).toEqual({ ok: false, reason: 'step_hidden' })
    expect(wizard.next()).toEqual({ ok: true })
    expect(wizard.getState().step).toBe('summary')
    expect(wizard.next()).toEqual({ ok: false, reason: 'last_step' })
    expect(wizard.back()).toEqual({ ok: true })
  })

  it('enregistre les positions des lyres par pupitre', () => {
    const wizard = atFixtures()
    wizard.setDesks([1, 2])
    wizard.addFixture({ profileId: 'moving-head-8', name: 'Lyre' })
    wizard.addFixture({ profileId: 'moving-head-8', name: 'Lyre pupitre 1', desk: 1 })
    wizard.addFixture({ profileId: 'par-rgb', name: 'PAR' })
    for (const id of ['lyre', 'lyre-pupitre-1', 'par']) {
      wizard.markFixtureTest(id, 'ok')
    }
    expect(wizard.goTo('positions')).toEqual({ ok: true })
    expect(wizard.blockers()).toEqual(['« Lyre » : position manquante pour certains pupitres'])
    expect(wizard.setDeskPosition('par', 1, { pan: 0, tilt: 0 })).toEqual({
      ok: false,
      reason: 'not_a_moving_head',
    })
    wizard.setDeskPosition('lyre', 1, { pan: 70_000, tilt: -5 })
    wizard.setDeskPosition('lyre', 2, { pan: 1000.4, tilt: 2000 })
    expect(wizard.blockers()).toEqual([])
    const lyre = wizard.getState().config.lighting.fixtures.find((item) => item.id === 'lyre')
    expect(lyre?.deskPositions).toEqual({
      1: { pan: 65_535, tilt: 0 },
      2: { pan: 1000, tilt: 2000 },
    })

    const calibration = parsePanTiltCalibration('Pupitre1:255-0;\nPupitre2:1-1;')
    expect(wizard.applyCalibration(calibration)).toBe(1)
    const desk1 = wizard
      .getState()
      .config.lighting.fixtures.find((item) => item.id === 'lyre-pupitre-1')
    expect(desk1?.deskPositions?.[1]).toEqual({ pan: 65_535, tilt: 0 })
    expect(desk1?.homePosition).toEqual({ pan: 65_535, tilt: 0 })

    // Retirer la dernière lyre fait disparaître l'étape : on revient à la précédente.
    wizard.removeFixture('lyre')
    wizard.removeFixture('lyre-pupitre-1')
    expect(wizard.getState().step).toBe('fixtureTest')
  })
})

describe('assistant d’installation : fumée', () => {
  const withSmoke = () => {
    const wizard = atFixtures()
    wizard.addFixture({ profileId: 'smoke-relay', name: 'Fumée' })
    expect(wizard.goTo('smoke')).toEqual({ ok: true })
    return wizard
  }

  it('n’active jamais la fumée sans les vérifications humaines', () => {
    const wizard = withSmoke()
    expect(wizard.blockers()).toEqual([])
    wizard.setSmoke({ enabled: true, maxDurationMs: 4000 })
    expect(wizard.blockers()).toHaveLength(SMOKE_CHECKS.length)
    expect(wizard.blockers()[0]).toContain("Arrêt d'urgence physique")
    expect(wizard.next()).toEqual({ ok: false, reason: 'blocked' })

    const blocked = wizard.summary()
    expect(blocked.config.lighting.smoke.enabled).toBe(false)
    expect(blocked.warnings.join(' ')).toContain('vérifications de sécurité')

    for (const check of SMOKE_CHECKS) {
      wizard.checkSmoke(check, true)
    }
    expect(wizard.blockers()).toEqual([])
    expect(wizard.next()).toEqual({ ok: true })
    const ready = wizard.summary()
    expect(ready.config.lighting.smoke).toMatchObject({ enabled: true, maxDurationMs: 4000 })

    // Changer d'interface oblige à refaire le test de gel.
    wizard.setDriver('usbpro')
    expect(wizard.getState().smokeChecks.freezeTest).toBe(false)
    expect(wizard.summary().config.lighting.smoke.enabled).toBe(false)
  })

  it('borne les réglages et prévient si l’émission dépasse le relais temporisé', () => {
    const wizard = withSmoke()
    for (const check of SMOKE_CHECKS) {
      wizard.checkSmoke(check, true)
    }
    wizard.setSmoke({ enabled: true, maxDurationMs: 60_000 })
    const summary = wizard.summary()
    expect(summary.config.lighting.smoke.maxDurationMs).toBeLessThanOrEqual(TIMED_RELAY_MAX_MS)
    expect(summary.warnings.join(' ')).not.toContain('relais temporisé')
  })

  it('désactive la fumée sans machine configurée', () => {
    const wizard = withSmoke()
    for (const check of SMOKE_CHECKS) {
      wizard.checkSmoke(check, true)
    }
    wizard.setSmoke({ enabled: true })
    wizard.removeFixture('fumee')
    const summary = wizard.summary()
    expect(summary.config.lighting.smoke.enabled).toBe(false)
    expect(summary.warnings.join(' ')).toContain('aucune machine à fumée')
  })
})

describe('assistant d’installation : récapitulatif', () => {
  it('produit une config relisible et liste les points à corriger', () => {
    const wizard = createSetupWizard()
    wizard.setDriver('opendmx')
    wizard.addFixture({ profileId: 'par-rgb', name: 'A' })
    const summary = wizard.summary()
    expect(summary.problems.join(' ')).toContain('buzzer')
    expect(summary.warnings.join(' ')).toContain('expérimentale')
    expect(summary.warnings.join(' ')).toContain("« A » n'a pas été validé")
    const reparsed = parseRoomHardwareConfig(JSON.parse(JSON.stringify(summary.config)))
    expect(reparsed.problems).toEqual([])
    expect(reparsed.config).toEqual(summary.config)

    wizard.setDriver('simulation')
    expect(wizard.summary().warnings.join(' ')).toContain('simulation')
  })

  it('reprend une config existante (6 pupitres déjà appris)', () => {
    const source = createSetupWizard()
    source.importSixDeskPreset()
    source.setKeymap({ GamepadButton23: { desk: 6, button: 'D' } })
    const wizard = createSetupWizard(source.summary().config)
    expect(wizard.getState().desks).toEqual([1, 2, 3, 4, 5, 6])
    expect(wizard.getState().step).toBe('browser')

    // L'état renvoyé est une copie : le modifier ne change pas l'assistant.
    const state = wizard.getState()
    state.config.lighting.fixtures.length = 0
    expect(wizard.getState().config.lighting.fixtures.length).toBeGreaterThan(0)
  })

  it('relit une origine de buzzers invalide sans planter', () => {
    const parsed = parseRoomHardwareConfig({ buzzers: { source: { kind: 'fax' } } })
    expect(parsed.config.buzzers.source).toBeUndefined()
    expect(parsed.problems).toContain('Origine des buzzers inconnue (clavier utilisé)')
    expect(
      parseRoomHardwareConfig({ buzzers: { source: { kind: 'gamepad', match: '  ' } } }).config
        .buzzers.source
    ).toEqual({ kind: 'gamepad' })
  })
})
