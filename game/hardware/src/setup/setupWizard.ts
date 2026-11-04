import type { BuzzerKeymap } from '../buzzers/keymap'
import { missingSlots } from '../buzzers/keymap'
import type { BuzzerSource, RoomHardwareConfig } from '../config'
import { parseRoomHardwareConfig } from '../config'
import type { FixtureConfig, PanTilt } from '../dmx/fixtures'
import { parseRig } from '../dmx/fixtures'
import type { DmxDriver } from '../dmx/output'
import type { FixtureProfile } from '../dmx/profiles'
import { findProfile } from '../dmx/profiles'
import { DMX_CHANNELS } from '../dmx/universe'
import type { SmokeSafetyConfig } from '../lighting/smoke'
import { normalizeSmokeSafety } from '../lighting/smoke'
import type { PanTiltCalibration, SixDeskRigOptions } from '../presets/sixDeskRoom'
import { createSixDeskRoomRig } from '../presets/sixDeskRoom'
import type { Desk } from '../types'
import { DEFAULT_DESKS, DESKS } from '../types'

/**
 * Assistant d'installation pas à pas, pensé pour un centre qui n'a aucune connaissance DMX.
 * Modèle **pur** : aucune dépendance au navigateur ni au contrôleur. L'écran de salle affiche
 * l'étape courante, appelle les méthodes au fil des clics et enregistre `summary().config`.
 * Les tests réels (allumer un appareil, déplacer une lyre, geler les trames) passent par
 * `controller.diagnostics` ; l'assistant ne fait que noter les résultats.
 */
export const SETUP_STEPS = [
  'browser',
  'buzzers',
  'interface',
  'fixtures',
  'fixtureTest',
  'positions',
  'smoke',
  'summary',
] as const
export type SetupStepId = (typeof SETUP_STEPS)[number]

export type BrowserCheck = {
  /** Web Serial disponible (Chrome / Edge sur ordinateur). */
  webSerial: boolean
  /** Page servie en HTTPS ou sur localhost : obligatoire pour Web Serial. */
  secureContext: boolean
  /** API Gamepad disponible (cartes d'entrées USB vues comme une manette). */
  gamepad: boolean
}

type BrowserEnvironment = {
  navigator?: { serial?: unknown; getGamepads?: unknown } | null
  isSecureContext?: boolean
}

/** Lit ce que le navigateur sait faire. `globalThis` par défaut. */
export function checkBrowser(environment: BrowserEnvironment = globalThis): BrowserCheck {
  const nav = environment.navigator ?? null
  return {
    webSerial: Boolean(nav && 'serial' in nav && nav.serial),
    secureContext: environment.isSecureContext === true,
    gamepad: Boolean(nav && typeof nav.getGamepads === 'function'),
  }
}

/** Interfaces proposées, dans l'ordre d'affichage. */
export type InterfaceChoice = {
  driver: DmxDriver
  /** Recommandée pour un centre qui achète son matériel. */
  recommended: boolean
  /** Fonctionne, mais sans garantie de stabilité (avertissement à afficher). */
  experimental: boolean
  /** A besoin de Web Serial dans le navigateur. */
  needsWebSerial: boolean
  /** A besoin du pont local `quizzup-artnet-bridge` lancé sur le PC de la salle. */
  needsBridge: boolean
}

export const INTERFACE_CHOICES: readonly InterfaceChoice[] = [
  {
    driver: 'simulation',
    recommended: false,
    experimental: false,
    needsWebSerial: false,
    needsBridge: false,
  },
  {
    driver: 'usbpro',
    recommended: true,
    experimental: false,
    needsWebSerial: true,
    needsBridge: false,
  },
  {
    driver: 'opendmx',
    recommended: false,
    experimental: true,
    needsWebSerial: true,
    needsBridge: false,
  },
  {
    driver: 'artnet-bridge',
    recommended: false,
    experimental: false,
    needsWebSerial: false,
    needsBridge: true,
  },
]

/**
 * Points de sécurité fumée à cocher par un humain avant que la fumée puisse être activée.
 * Montage retenu : relais DMX sur la télécommande de la machine + relais temporisé physique
 * (10 s maximum) qui coupe tout seul si le jeu plante ou si le câble est débranché.
 */
export const SMOKE_CHECKS = [
  /** Arrêt d'urgence physique (coupure secteur de la machine) présent et accessible au staff. */
  'physicalStop',
  /** Relais temporisé réglé à 10 s maximum, câblé entre le relais DMX et la machine. */
  'timedRelay',
  /** Test de gel réussi : trames figées pendant une émission, la fumée s'arrête toute seule. */
  'freezeTest',
  /** Détection incendie de la salle et consignes du site vérifiées avec le responsable. */
  'siteRules',
] as const
export type SmokeCheckId = (typeof SMOKE_CHECKS)[number]

/** Libellés affichés dans l'assistant (et dans les points bloquants). */
export const SMOKE_CHECK_LABELS: Readonly<Record<SmokeCheckId, string>> = {
  physicalStop: "Arrêt d'urgence physique de la machine présent et accessible",
  timedRelay: 'Relais temporisé réglé à 10 secondes maximum',
  freezeTest: 'Test de gel réussi : la fumée se coupe seule quand les trames s’arrêtent',
  siteRules: 'Détection incendie et consignes du site vérifiées avec le responsable',
}

/** Durée maximale acceptée pour le relais temporisé. */
export const TIMED_RELAY_MAX_MS = 10_000

export type FixtureTestResult = 'ok' | 'ko'

export type SetupWizardState = {
  step: SetupStepId
  /** Étapes affichées (les lyres et la fumée sont sautées sans appareil concerné). */
  steps: SetupStepId[]
  browser: BrowserCheck | null
  config: RoomHardwareConfig
  /** Pupitres équipés dans cette salle. */
  desks: Desk[]
  fixtureTests: Record<string, FixtureTestResult>
  smokeChecks: Record<SmokeCheckId, boolean>
}

export type WizardResult = { ok: true } | { ok: false; reason: string }

export type AddFixtureInput = {
  profileId: string
  name?: string
  /** Adresse imposée ; sinon la première plage libre est proposée. */
  address?: number
  desk?: Desk
}

export type AddFixtureResult =
  | { ok: true; fixture: FixtureConfig }
  | {
      ok: false
      reason: 'unknown_profile' | 'no_room' | 'invalid_address' | 'conflict'
      detail?: string
    }

export type SetupSummary = {
  config: RoomHardwareConfig
  /** Points qui empêchent une installation correcte (à corriger). */
  problems: string[]
  /** Points à connaître, non bloquants. */
  warnings: string[]
}

export type SetupWizard = {
  getState: () => SetupWizardState
  /** Ce qui empêche de passer à l'étape suivante (liste vide = on peut avancer). */
  blockers: () => string[]
  next: () => WizardResult
  back: () => WizardResult
  goTo: (step: SetupStepId) => WizardResult

  setBrowserCheck: (check: BrowserCheck) => void
  setDesks: (desks: readonly Desk[]) => void
  setBuzzerSource: (source: BuzzerSource) => void
  setKeymap: (keymap: BuzzerKeymap) => void

  setDriver: (driver: DmxDriver) => WizardResult

  addFixture: (input: AddFixtureInput) => AddFixtureResult
  updateFixture: (id: string, patch: Partial<Omit<FixtureConfig, 'id'>>) => WizardResult
  removeFixture: (id: string) => void
  /** Remplace les appareils par ceux d'une salle 6 pupitres (positions reprises si fournies). */
  importSixDeskPreset: (options?: SixDeskRigOptions) => void
  /** Première adresse libre pour un appareil de `footprint` canaux, `null` si l'univers est plein. */
  suggestAddress: (footprint: number) => number | null

  markFixtureTest: (id: string, result: FixtureTestResult) => WizardResult

  setDeskPosition: (fixtureId: string, desk: Desk, position: PanTilt) => WizardResult
  /** Reprend les positions des lyres spot de chaque pupitre depuis un fichier de calibration. */
  applyCalibration: (calibration: Pick<PanTiltCalibration, 'desks'>) => number

  setSmoke: (patch: Partial<SmokeSafetyConfig>) => void
  checkSmoke: (check: SmokeCheckId, done: boolean) => void

  /**
   * Config à enregistrer. Avec `forFreezeTest`, la fumée reste active dès que l'arrêt
   * d'urgence physique et le relais temporisé sont cochés : c'est ce qu'il faut pour faire le
   * test de gel. Ne jamais garder cette config si le test n'est pas fait : réenregistrer
   * `summary()` en quittant.
   */
  summary: (options?: { forFreezeTest?: boolean }) => SetupSummary
}

const allChecks = (value: boolean) =>
  Object.fromEntries(SMOKE_CHECKS.map((check) => [check, value])) as Record<SmokeCheckId, boolean>

const clampWord = (value: number) => Math.min(65_535, Math.max(0, Math.round(value)))

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || 'appareil'

export function createSetupWizard(initial?: RoomHardwareConfig): SetupWizard {
  const parsed = parseRoomHardwareConfig(initial ?? {})
  let config = parsed.config
  let step: SetupStepId = 'browser'
  let browser: BrowserCheck | null = null
  let desks: Desk[] = [...DEFAULT_DESKS]
  let fixtureTests: Record<string, FixtureTestResult> = {}
  let smokeChecks = allChecks(false)
  const highestDesk = Math.max(
    ...Object.values(config.buzzers.keymap).map((slot) => slot.desk),
    ...config.lighting.fixtures.map((fixture) => fixture.desk ?? 0),
    0
  )
  if (highestDesk > DEFAULT_DESKS.length) {
    desks = DESKS.filter((desk) => desk <= highestDesk)
  }

  const profileOf = (fixture: FixtureConfig): FixtureProfile | null =>
    findProfile(fixture.profileId, config.lighting.customProfiles)
  const kindOf = (fixture: FixtureConfig) => profileOf(fixture)?.kind ?? null
  const hasKind = (kind: FixtureProfile['kind']) =>
    config.lighting.fixtures.some((fixture) => kindOf(fixture) === kind)

  const visibleSteps = (): SetupStepId[] =>
    SETUP_STEPS.filter((id) => {
      if (id === 'positions') {
        return hasKind('movingHead')
      }
      if (id === 'smoke') {
        return hasKind('smoke')
      }
      if (id === 'fixtureTest') {
        return config.lighting.fixtures.some((fixture) => kindOf(fixture) !== 'smoke')
      }
      return true
    })

  const setFixtures = (fixtures: FixtureConfig[]) => {
    config = { ...config, lighting: { ...config.lighting, fixtures } }
  }

  const usedChannels = (exceptId?: string) => {
    const used = new Map<number, string>()
    for (const fixture of config.lighting.fixtures) {
      if (fixture.id === exceptId) {
        continue
      }
      const footprint = profileOf(fixture)?.channels.length ?? 0
      for (let offset = 0; offset < footprint; offset += 1) {
        used.set(fixture.address + offset, fixture.name)
      }
    }
    return used
  }

  const findConflict = (address: number, footprint: number, exceptId?: string) => {
    const used = usedChannels(exceptId)
    for (let offset = 0; offset < footprint; offset += 1) {
      const owner = used.get(address + offset)
      if (owner !== undefined) {
        return `canal ${address + offset} déjà utilisé par « ${owner} »`
      }
    }
    return null
  }

  const suggestAddress = (footprint: number): number | null => {
    if (footprint < 1 || footprint > DMX_CHANNELS) {
      return null
    }
    const used = usedChannels()
    for (let address = 1; address + footprint - 1 <= DMX_CHANNELS; address += 1) {
      let free = true
      for (let offset = 0; offset < footprint; offset += 1) {
        if (used.has(address + offset)) {
          free = false
          address += offset
          break
        }
      }
      if (free) {
        return address
      }
    }
    return null
  }

  const uniqueId = (base: string) => {
    const ids = new Set(config.lighting.fixtures.map((fixture) => fixture.id))
    let id = base
    let index = 2
    while (ids.has(id)) {
      id = `${base}-${index}`
      index += 1
    }
    return id
  }

  /** Toucher à la machine à fumée (ajout, adresse, retrait) oblige à refaire le test de gel. */
  const resetFreezeTestIf = (...touched: (FixtureConfig | undefined)[]) => {
    if (touched.some((fixture) => fixture && kindOf(fixture) === 'smoke')) {
      smokeChecks = { ...smokeChecks, freezeTest: false }
    }
  }

  const smokeReady = () => SMOKE_CHECKS.every((check) => smokeChecks[check])

  const stepBlockers = (id: SetupStepId): string[] => {
    switch (id) {
      case 'browser': {
        if (!browser) {
          return ['Vérification du navigateur pas encore faite']
        }
        return []
      }
      case 'buzzers': {
        const missing = missingSlots(config.buzzers.keymap, desks)
        return missing.length > 0 ? [`${missing.length} bouton(s) de buzzer pas encore appris`] : []
      }
      case 'interface': {
        const choice = INTERFACE_CHOICES.find((item) => item.driver === config.lighting.driver)
        if (choice?.needsWebSerial && browser && !(browser.webSerial && browser.secureContext)) {
          return ['Ce navigateur ne peut pas piloter une interface USB DMX (Chrome ou Edge requis)']
        }
        return []
      }
      case 'fixtures': {
        return parseRig(config.lighting.fixtures, config.lighting.customProfiles).problems
      }
      case 'fixtureTest': {
        const untested = config.lighting.fixtures.filter(
          (fixture) => kindOf(fixture) !== 'smoke' && fixtureTests[fixture.id] !== 'ok'
        )
        return untested.map((fixture) =>
          fixtureTests[fixture.id] === 'ko'
            ? `« ${fixture.name} » ne répond pas : vérifier l'adresse et le câble`
            : `« ${fixture.name} » pas encore testé`
        )
      }
      case 'positions': {
        return config.lighting.fixtures
          .filter((fixture) => kindOf(fixture) === 'movingHead' && fixture.desk === undefined)
          .filter((fixture) => desks.some((desk) => !fixture.deskPositions?.[desk]))
          .map((fixture) => `« ${fixture.name} » : position manquante pour certains pupitres`)
      }
      case 'smoke': {
        if (!config.lighting.smoke.enabled || smokeReady()) {
          return []
        }
        return SMOKE_CHECKS.filter((check) => !smokeChecks[check]).map(
          (check) => `Sécurité fumée à valider : ${SMOKE_CHECK_LABELS[check]}`
        )
      }
      case 'summary': {
        break
      }
    }
    return []
  }

  const move = (target: SetupStepId): WizardResult => {
    const steps = visibleSteps()
    if (!steps.includes(target)) {
      return { ok: false, reason: 'step_hidden' }
    }
    const from = steps.indexOf(step)
    const to = steps.indexOf(target)
    if (to > from) {
      for (const id of steps.slice(Math.max(0, from), to)) {
        if (stepBlockers(id).length > 0) {
          step = id
          return { ok: false, reason: 'blocked' }
        }
      }
    }
    step = target
    return { ok: true }
  }

  const currentStep = (): SetupStepId => {
    const steps = visibleSteps()
    if (steps.includes(step)) {
      return step
    }
    // L'étape courante a disparu (dernière lyre retirée…) : on recule à la précédente visible.
    const index = SETUP_STEPS.indexOf(step)
    return [...steps].reverse().find((id) => SETUP_STEPS.indexOf(id) < index) ?? 'browser'
  }

  return {
    getState: () => {
      step = currentStep()
      return {
        step,
        steps: visibleSteps(),
        browser,
        config: structuredClone(config),
        desks: [...desks],
        fixtureTests: { ...fixtureTests },
        smokeChecks: { ...smokeChecks },
      }
    },
    blockers: () => stepBlockers(currentStep()),
    next: () => {
      step = currentStep()
      const steps = visibleSteps()
      const target = steps[steps.indexOf(step) + 1]
      return target ? move(target) : { ok: false, reason: 'last_step' }
    },
    back: () => {
      step = currentStep()
      const steps = visibleSteps()
      const target = steps[steps.indexOf(step) - 1]
      return target ? move(target) : { ok: false, reason: 'first_step' }
    },
    goTo: (target) => {
      step = currentStep()
      return move(target)
    },

    setBrowserCheck: (check) => {
      browser = { ...check }
    },
    setDesks: (list) => {
      const valid = DESKS.filter((desk) => list.includes(desk))
      if (valid.length > 0) {
        desks = valid
      }
    },
    setBuzzerSource: (source) => {
      config = {
        ...config,
        buzzers: {
          ...config.buzzers,
          source:
            source.kind === 'gamepad' && source.match
              ? { kind: 'gamepad', match: source.match }
              : { kind: source.kind },
        },
      }
    },
    setKeymap: (keymap) => {
      config = { ...config, buzzers: { ...config.buzzers, keymap: { ...keymap } } }
    },

    setDriver: (driver) => {
      if (!INTERFACE_CHOICES.some((choice) => choice.driver === driver)) {
        return { ok: false, reason: 'unknown_driver' }
      }
      config = { ...config, lighting: { ...config.lighting, driver } }
      // Changer d'interface invalide les tests faits sur l'ancienne.
      fixtureTests = {}
      smokeChecks = { ...smokeChecks, freezeTest: false }
      return { ok: true }
    },

    addFixture: (input) => {
      const profile = findProfile(input.profileId, config.lighting.customProfiles)
      if (!profile) {
        return { ok: false, reason: 'unknown_profile' }
      }
      const footprint = profile.channels.length
      let address = input.address
      if (address === undefined) {
        const suggested = suggestAddress(footprint)
        if (suggested === null) {
          return { ok: false, reason: 'no_room' }
        }
        address = suggested
      }
      if (!Number.isInteger(address) || address < 1 || address + footprint - 1 > DMX_CHANNELS) {
        return { ok: false, reason: 'invalid_address' }
      }
      const conflict = findConflict(address, footprint)
      if (conflict) {
        return { ok: false, reason: 'conflict', detail: conflict }
      }
      const name = input.name?.trim() || profile.name
      const fixture: FixtureConfig = {
        id: uniqueId(slug(name)),
        name,
        profileId: profile.id,
        address,
        ...(input.desk === undefined ? {} : { desk: input.desk }),
      }
      setFixtures([...config.lighting.fixtures, fixture])
      resetFreezeTestIf(fixture)
      return { ok: true, fixture: { ...fixture } }
    },
    updateFixture: (id, patch) => {
      const current = config.lighting.fixtures.find((fixture) => fixture.id === id)
      if (!current) {
        return { ok: false, reason: 'unknown_fixture' }
      }
      const next: FixtureConfig = { ...current, ...patch, id }
      const profile = profileOf(next)
      if (!profile) {
        return { ok: false, reason: 'unknown_profile' }
      }
      const footprint = profile.channels.length
      if (
        !Number.isInteger(next.address) ||
        next.address < 1 ||
        next.address + footprint - 1 > DMX_CHANNELS
      ) {
        return { ok: false, reason: 'invalid_address' }
      }
      const conflict = findConflict(next.address, footprint, id)
      if (conflict) {
        return { ok: false, reason: conflict }
      }
      setFixtures(config.lighting.fixtures.map((fixture) => (fixture.id === id ? next : fixture)))
      if (next.address !== current.address || next.profileId !== current.profileId) {
        resetFreezeTestIf(current, next)
        const { [id]: _dropped, ...rest } = fixtureTests
        fixtureTests = rest
      }
      return { ok: true }
    },
    removeFixture: (id) => {
      resetFreezeTestIf(config.lighting.fixtures.find((fixture) => fixture.id === id))
      setFixtures(config.lighting.fixtures.filter((fixture) => fixture.id !== id))
      const { [id]: _dropped, ...rest } = fixtureTests
      fixtureTests = rest
    },
    importSixDeskPreset: (options) => {
      const rig = createSixDeskRoomRig(options)
      const presetIds = new Set(rig.customProfiles.map((profile) => profile.id))
      config = {
        ...config,
        lighting: {
          ...config.lighting,
          fixtures: rig.fixtures,
          customProfiles: [
            ...config.lighting.customProfiles.filter((profile) => !presetIds.has(profile.id)),
            ...rig.customProfiles,
          ],
        },
      }
      desks = [...DESKS]
      fixtureTests = {}
      smokeChecks = { ...smokeChecks, freezeTest: false }
    },
    suggestAddress,

    markFixtureTest: (id, result) => {
      if (!config.lighting.fixtures.some((fixture) => fixture.id === id)) {
        return { ok: false, reason: 'unknown_fixture' }
      }
      fixtureTests = { ...fixtureTests, [id]: result }
      return { ok: true }
    },

    setDeskPosition: (fixtureId, desk, position) => {
      const fixture = config.lighting.fixtures.find((item) => item.id === fixtureId)
      if (!fixture || kindOf(fixture) !== 'movingHead') {
        return { ok: false, reason: 'not_a_moving_head' }
      }
      const value = { pan: clampWord(position.pan), tilt: clampWord(position.tilt) }
      setFixtures(
        config.lighting.fixtures.map((item) =>
          item.id === fixtureId
            ? { ...item, deskPositions: { ...item.deskPositions, [desk]: value } }
            : item
        )
      )
      return { ok: true }
    },
    applyCalibration: (calibration) => {
      let applied = 0
      setFixtures(
        config.lighting.fixtures.map((fixture) => {
          if (kindOf(fixture) !== 'movingHead' || fixture.desk === undefined) {
            return fixture
          }
          const position = calibration.desks[fixture.desk]
          if (!position) {
            return fixture
          }
          applied += 1
          return {
            ...fixture,
            deskPositions: { ...fixture.deskPositions, [fixture.desk]: { ...position } },
            homePosition: { ...position },
          }
        })
      )
      return applied
    },

    setSmoke: (patch) => {
      config = {
        ...config,
        lighting: {
          ...config.lighting,
          smoke: normalizeSmokeSafety({ ...config.lighting.smoke, ...patch }),
        },
      }
    },
    checkSmoke: (check, done) => {
      smokeChecks = { ...smokeChecks, [check]: done }
    },

    summary: (options = {}) => {
      const problems: string[] = []
      const warnings: string[] = []
      const rig = parseRig(config.lighting.fixtures, config.lighting.customProfiles)
      problems.push(...rig.problems)
      const missing = missingSlots(config.buzzers.keymap, desks)
      if (missing.length > 0) {
        problems.push(`${missing.length} bouton(s) de buzzer pas encore appris`)
      }
      const choice = INTERFACE_CHOICES.find((item) => item.driver === config.lighting.driver)
      if (config.lighting.driver === 'simulation') {
        warnings.push('Lumières en simulation : aucune interface DMX ne sera pilotée')
      } else if (choice?.needsBridge) {
        warnings.push(
          'Pont Art-Net : le programme quizzup-artnet-bridge doit tourner sur le PC de la salle'
        )
      } else if (choice?.experimental) {
        warnings.push(
          'Interface Open DMX : expérimentale, des scintillements sont possibles selon le PC'
        )
      }
      for (const fixture of rig.fixtures) {
        if (fixture.profile.kind !== 'smoke' && fixtureTests[fixture.id] !== 'ok') {
          warnings.push(`« ${fixture.name} » n'a pas été validé au test`)
        }
      }

      let smoke = config.lighting.smoke
      const testReady = smokeChecks.physicalStop && smokeChecks.timedRelay
      const allowed = smokeReady() || (options.forFreezeTest === true && testReady)
      if (smoke.enabled && (!hasKind('smoke') || !allowed)) {
        // Jamais de fumée active sans les vérifications humaines : on l'enregistre désactivée.
        smoke = { ...smoke, enabled: false }
        warnings.push(
          hasKind('smoke')
            ? 'Fumée enregistrée désactivée : les vérifications de sécurité ne sont pas toutes faites'
            : 'Fumée enregistrée désactivée : aucune machine à fumée configurée'
        )
      }
      if (smoke.enabled && smoke.maxDurationMs > TIMED_RELAY_MAX_MS) {
        warnings.push('La durée d’émission dépasse le réglage du relais temporisé (10 s)')
      }

      return {
        config: structuredClone({ ...config, lighting: { ...config.lighting, smoke } }),
        problems,
        warnings,
      }
    },
  }
}
