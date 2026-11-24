import { writeIntelHex } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { getLighting, startLighting } from '@/hardware/roomHardware'
import { resetSmokeBoard } from '@/hardware/smokeBoard'
import LightingSetup from '@/views/hardware/LightingSetup.vue'

import { createFakeBoardPort, type FakeBoardOptions } from '../_helpers/fakeBoardPort'
import { mountWithApp } from '../_helpers/mount'
import { saveWithSmokeProof } from '../_helpers/smokeProof'

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

beforeEach(() => {
  // Le téléchargement de la sauvegarde passe par un lien : jsdom ne sait ni créer l'URL ni naviguer.
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
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

    // Sans bannière : la carte est déclarée « sans programme » après 3 s.
    await vi.waitFor(
      () => expect(sel(wrapper, 'board-connect-error').text()).toContain('programme QuizzUp'),
      { timeout: 5000 }
    )
    expect(sel(wrapper, 'board-status').text()).toBe('Programme QuizzUp absent sur cette carte.')
    expect(sel(wrapper, 'board-install').exists()).toBe(true)
  })

  it('n’installe qu’avec la case « machine éteinte », puis annonce la fin', async () => {
    const { fake, wrapper } = await mountWithBoard()
    await connect(wrapper)

    expect(sel(wrapper, 'board-install').attributes('disabled')).toBeDefined()
    await sel(wrapper, 'board-off').setValue(true)
    expect(sel(wrapper, 'board-install').attributes('disabled')).toBeUndefined()
    await sel(wrapper, 'board-install').trigger('click')

    await vi.waitFor(() => expect(sel(wrapper, 'board-install-done').exists()).toBe(true))
    expect(sel(wrapper, 'board-install-done').text()).toContain('Programme installé')
    expect(fake.fireLines()).toBe(0)
    // La case ne reste pas cochée pour l'installation suivante.
    expect((sel(wrapper, 'board-off').element as HTMLInputElement).checked).toBe(false)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
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

  it('pendant l’attente du chargeur : barre de progression, fumée ni armable ni testable, puis erreur', async () => {
    const { wrapper } = await mountWithBoard({ silentLoader: true })
    await connect(wrapper)
    await sel(wrapper, 'board-off').setValue(true)

    await sel(wrapper, 'board-install').trigger('click')
    await flushPromises()

    expect(sel(wrapper, 'board-progress').exists()).toBe(true)
    expect(sel(wrapper, 'smoke-arm').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'smoke-test').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'board-install').attributes('disabled')).toBeDefined()
    await vi.waitFor(() => expect(sel(wrapper, 'board-install-error').exists()).toBe(true), {
      timeout: 8000,
    })
    expect(sel(wrapper, 'board-install-error').text()).toContain('RESET')
    expect(sel(wrapper, 'board-progress').exists()).toBe(false)
  }, 12_000)

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
