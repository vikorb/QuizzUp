import { writeIntelHex } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import type * as RoomHardware from '@/hardware/roomHardware'
import { getLighting, saveRoomHardwareConfig, startLighting } from '@/hardware/roomHardware'
import { resetSmokeBoard } from '@/hardware/smokeBoard'
import LightingSetup from '@/views/hardware/LightingSetup.vue'

import { createFakeBoardPort, type FakeBoardOptions } from '../_helpers/fakeBoardPort'
import { mountWithApp } from '../_helpers/mount'
import { saveWithSmokeProof } from '../_helpers/smokeProof'

// Même fonction, mais un test peut la faire échouer une fois (`rememberBoard` l'appelle).
vi.mock('@/hardware/roomHardware', async (importOriginal) => {
  const actual = await importOriginal<typeof RoomHardware>()
  return { ...actual, saveRoomHardwareConfig: vi.fn(actual.saveRoomHardwareConfig) }
})

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

/** Fumée activée avec test de coupure fait pour la carte retenue (la retenir changerait l'empreinte). */
async function smokeRoom() {
  await saveWithSmokeProof({
    lighting: {
      fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }],
      smoke: {
        enabled: true,
        requireConfirmation: false,
        board: { kind: 'uno-serial', usbVendorId: 0x2341, usbProductId: 0x0043 },
      },
    },
  })
  await startLighting()
}

function installSerial(chosen: unknown) {
  Object.defineProperty(navigator, 'serial', {
    value: {
      requestPort: async () => chosen,
      getPorts: async () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    configurable: true,
  })
}

async function mountWithBoard(options: FakeBoardOptions = {}) {
  const fake = createFakeBoardPort(options)
  installSerial(fake.port)
  await smokeRoom()
  const { wrapper } = await mountWithApp(LightingSetup, { route: '/hardware' })
  await flushPromises()
  return { fake, wrapper }
}

async function connect(wrapper: Wrapper) {
  await sel(wrapper, 'board-connect').trigger('click')
  await vi.waitFor(() => expect(sel(wrapper, 'board-status').text()).toContain('Prête'))
}

/** Carte d'abord choisie sans notre programme (aucune bannière) : déclarée « absente » après 3 s simulées. */
async function connectAbsent(wrapper: Wrapper) {
  await sel(wrapper, 'board-connect').trigger('click')
  await vi.advanceTimersByTimeAsync(3500)
  await flushPromises()
  expect(sel(wrapper, 'board-status').text()).toBe('Programme QuizzUp absent sur cette carte.')
}

const OLD_PROGRAM = Uint8Array.from({ length: 600 }, (_value, index) => (index * 7 + 3) & 0xff)

beforeEach(() => {
  vi.useFakeTimers()
  // Le téléchargement de la sauvegarde passe par un lien : jsdom ne sait ni créer l'URL ni naviguer.
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  await resetSmokeBoard()
  Reflect.deleteProperty(navigator, 'serial')
})

describe('section Fumée : carte USB', () => {
  it('sans Web Serial, dit d’utiliser Chrome ou Edge', async () => {
    await smokeRoom()
    const { wrapper } = await mountWithApp(LightingSetup, { route: '/hardware' })
    await flushPromises()

    expect(sel(wrapper, 'board-unsupported').exists()).toBe(true)
    expect(sel(wrapper, 'board-connect').exists()).toBe(false)
  })

  it('état vide : aucune carte, pas d’installation proposée', async () => {
    const { wrapper } = await mountWithBoard()

    expect(sel(wrapper, 'board-status').text()).toBe('Aucune carte connectée.')
    expect(sel(wrapper, 'board-empty').text()).toContain('câble USB')
    expect(sel(wrapper, 'board-install').exists()).toBe(false)
  })

  it('affiche la carte prête avec la version de son programme', async () => {
    const { wrapper } = await mountWithBoard()

    await connect(wrapper)

    expect(sel(wrapper, 'board-status').text()).toBe('Prête (programme 1.0.0).')
  })

  it('dit « programme à mettre à jour » pour une autre version', async () => {
    const { wrapper } = await mountWithBoard({ banner: 'QZF READY 1 0.9.0 10000 5000 500' })

    await sel(wrapper, 'board-connect').trigger('click')

    await vi.waitFor(() =>
      expect(sel(wrapper, 'board-status').text()).toBe('Programme 0.9.0 à mettre à jour.')
    )
  })

  it('dit « programme absent » et propose l’installation pour une carte sans notre programme', async () => {
    const { wrapper } = await mountWithBoard({ banner: null })

    await sel(wrapper, 'board-connect').trigger('click')

    // Sans bannière : la carte est déclarée « sans programme » après 3 s (horloge simulée).
    await vi.advanceTimersByTimeAsync(3500)
    await flushPromises()
    expect(sel(wrapper, 'board-connect-error').text()).toContain('programme QuizzUp')
    expect(sel(wrapper, 'board-status').text()).toBe('Programme QuizzUp absent sur cette carte.')
    expect(sel(wrapper, 'board-install').exists()).toBe(true)
  })

  it('n’installe qu’avec la case « machine éteinte » et la sauvegarde confirmée, puis annonce la fin', async () => {
    // Carte livrée avec un ancien programme : « prête » après l'installation prouve quelque chose.
    const { fake, wrapper } = await mountWithBoard({ flash: OLD_PROGRAM })
    await connectAbsent(wrapper)
    expect(wrapper.find('label.file-btn').exists()).toBe(true)

    expect(sel(wrapper, 'board-install').attributes('disabled')).toBeDefined()
    await sel(wrapper, 'board-off').setValue(true)
    expect(sel(wrapper, 'board-install').attributes('disabled')).toBeUndefined()
    await sel(wrapper, 'board-install').trigger('click')

    // Sauvegarde téléchargée, chargeur tenu : rien n'est écrit tant que l'opérateur n'a pas répondu.
    await vi.waitFor(() => expect(sel(wrapper, 'board-backup-confirm').exists()).toBe(true))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.stats.pagesWritten).toBe(0)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    await sel(wrapper, 'board-backup-yes').trigger('click')

    await vi.waitFor(() => expect(sel(wrapper, 'board-install-done').exists()).toBe(true))
    expect(sel(wrapper, 'board-install-done').text()).toContain('Programme installé')
    expect(fake.stats.pagesWritten).toBeGreaterThan(0)
    expect(fake.fireLines()).toBe(0)
    await vi.waitFor(() => expect(sel(wrapper, 'board-status').text()).toContain('Prête'))
    // La case ne reste pas cochée pour l'installation suivante.
    expect((sel(wrapper, 'board-off').element as HTMLInputElement).checked).toBe(false)
  })

  it('sauvegarde refusée par l’opérateur : message d’erreur, rien d’écrit', async () => {
    const { fake, wrapper } = await mountWithBoard({ flash: OLD_PROGRAM })
    await connectAbsent(wrapper)
    await sel(wrapper, 'board-off').setValue(true)
    await sel(wrapper, 'board-install').trigger('click')
    await vi.waitFor(() => expect(sel(wrapper, 'board-backup-confirm').exists()).toBe(true))

    await sel(wrapper, 'board-backup-no').trigger('click')

    await vi.waitFor(() => expect(sel(wrapper, 'board-install-error').exists()).toBe(true))
    expect(sel(wrapper, 'board-install-error').text()).toContain('rien n’a été écrit')
    expect(fake.stats.pagesWritten).toBe(0)
    expect(sel(wrapper, 'board-backup-confirm').exists()).toBe(false)
  })

  it('mauvaise signature : message d’erreur, rien d’écrit', async () => {
    const { fake, wrapper } = await mountWithBoard({ signature: [1, 2, 3] })
    await connect(wrapper)
    await sel(wrapper, 'board-off').setValue(true)

    await sel(wrapper, 'board-install').trigger('click')

    await vi.waitFor(() => expect(sel(wrapper, 'board-install-error').exists()).toBe(true))
    expect(sel(wrapper, 'board-install-error').text()).toContain('pas une carte Uno')
    expect(fake.stats.pagesWritten).toBe(0)
  })

  it('échec de relecture : l’écran ne dit plus « Prête », le lien étant fermé', async () => {
    const { wrapper } = await mountWithBoard({ corruptFirstWrite: true })
    await connect(wrapper)
    await sel(wrapper, 'board-off').setValue(true)
    await sel(wrapper, 'board-install').trigger('click')
    await vi.waitFor(() => expect(sel(wrapper, 'board-backup-confirm').exists()).toBe(true))
    await sel(wrapper, 'board-backup-yes').trigger('click')

    await vi.waitFor(() => expect(sel(wrapper, 'board-install-error').exists()).toBe(true))

    expect(sel(wrapper, 'board-install-error').text()).toContain('relecture')
    expect(sel(wrapper, 'board-status').text()).not.toContain('Prête')
    expect(sel(wrapper, 'board-status').text()).toBe('Aucune carte connectée.')
    // Le port reste connu : on peut recommencer.
    expect(sel(wrapper, 'board-install').exists()).toBe(true)
  })

  it('pendant l’attente du chargeur : barre de progression, fumée armée mais ni armable ni testable, puis erreur', async () => {
    const { wrapper } = await mountWithBoard({ silentLoader: true })
    await connect(wrapper)
    // Fumée armée avant l'installation : seule la garde de l'écran Matériel peut désactiver l'essai.
    await sel(wrapper, 'smoke-arm').setValue(true)
    expect(sel(wrapper, 'smoke-test').attributes('disabled')).toBeUndefined()
    await sel(wrapper, 'board-off').setValue(true)

    await sel(wrapper, 'board-install').trigger('click')
    await flushPromises()

    expect(sel(wrapper, 'board-progress').exists()).toBe(true)
    expect(sel(wrapper, 'smoke-arm').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'smoke-test').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'board-install').attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()
    expect(sel(wrapper, 'board-install-error').text()).toContain('RESET')
    expect(sel(wrapper, 'board-progress').exists()).toBe(false)
  })

  it('carte qui répond mais configuration non enregistrée : erreur affichée, rien ne remonte du clic', async () => {
    const { wrapper } = await mountWithBoard({ usbProductId: 0x0044 })
    vi.mocked(saveRoomHardwareConfig).mockRejectedValueOnce(new Error('revision_conflict'))

    await sel(wrapper, 'board-connect').trigger('click')

    await vi.waitFor(() =>
      expect(sel(wrapper, 'board-connect-error').text()).toContain('configuration de la salle')
    )
  })

  it('restaure un fichier .hex choisi', async () => {
    const { fake, wrapper } = await mountWithBoard()
    await connect(wrapper)
    const input = sel(wrapper, 'board-restore-file').element as HTMLInputElement
    const content = writeIntelHex(Uint8Array.of(0x12, 0x34))
    const file = new File([content], 'sauvegarde.hex')
    // jsdom n'a pas `Blob.text()` (Chrome, si).
    file.text = async () => content
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await sel(wrapper, 'board-restore-file').trigger('change')
    await flushPromises()
    await sel(wrapper, 'board-off').setValue(true)

    await sel(wrapper, 'board-restore').trigger('click')

    await vi.waitFor(() => expect(sel(wrapper, 'board-install-done').exists()).toBe(true))
    expect(sel(wrapper, 'board-install-done').text()).toContain('Programme restauré')
    // Le programme d'origine ne suit pas les sécurités : le message le dit et demande de rester éteint.
    expect(sel(wrapper, 'board-install-done').text()).toContain('ne suit pas les sécurités')
    expect(sel(wrapper, 'board-install-done').text()).toContain('Laisse la machine à fumée éteinte')
    expect(sel(wrapper, 'board-restore-hint').text()).toContain('ne suit pas les sécurités')
    expect(fake.flash.subarray(0, 2)).toEqual(Uint8Array.of(0x12, 0x34))
  })

  it('l’essai de fumée reste soumis aux gardes : refusé si la carte est perdue, accepté quand elle répond', async () => {
    const { fake, wrapper } = await mountWithBoard()
    await connect(wrapper)

    // Carte arrachée : coupée et désarmée ; même réarmée à la main, aucun jet sans la carte.
    fake.unplug()
    await vi.waitFor(() => expect(sel(wrapper, 'board-status').text()).toContain('débranchée'))
    await sel(wrapper, 'smoke-arm').setValue(true)
    await sel(wrapper, 'smoke-test').trigger('click')
    expect(wrapper.text()).toContain('Carte de la fumée absente')
    expect(fake.fireLines()).toBe(0)
    expect(getLighting()!.getState().smoke.status).not.toBe('firing')
  })

  it('l’essai de fumée part vers la carte quand elle est prête et armée', async () => {
    const { fake, wrapper } = await mountWithBoard()
    await connect(wrapper)
    await sel(wrapper, 'smoke-arm').setValue(true)

    await sel(wrapper, 'smoke-test').trigger('click')

    await vi.waitFor(() => expect(fake.isOutputOn()).toBe(true))
  })
})
