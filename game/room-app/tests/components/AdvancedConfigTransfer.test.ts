import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import type * as RoomHardware from '@/hardware/roomHardware'
import { resetRoomHardware, saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'
import { saveWithSmokeProof } from '../_helpers/smokeProof'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

// Même comportement que le vrai module, mais un test peut faire échouer un enregistrement.
vi.mock('@/hardware/roomHardware', async (importOriginal) => {
  const actual = await importOriginal<typeof RoomHardware>()
  return { ...actual, saveRoomHardwareConfig: vi.fn(actual.saveRoomHardwareConfig) }
})

const SMOKE_FIXTURE = { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }
const BOUNDED_SMOKE = {
  enabled: true,
  maxDurationMs: 2_000,
  cooldownMs: 60_000,
  maxLevel: 200,
  requireConfirmation: true,
}
/** Fichier écrit à la main : la fumée y est armée, plus longue, plus fréquente, plus forte. */
const PERMISSIVE_SMOKE = {
  enabled: true,
  maxDurationMs: 9_000,
  cooldownMs: 5_000,
  maxLevel: 255,
  requireConfirmation: false,
  cutsOnSignalLoss: true,
  board: { kind: 'usb' },
}

const config = () => useRoomHardware().hardware.value.config
const smokeConfig = () => config().lighting.smoke

const fileText = (content: Record<string, unknown>) =>
  JSON.stringify({
    format: 'quizzup-room-config',
    schema: 1,
    exportedAt: '2026-11-24T10:00:00.000Z',
    ...content,
  })

const jsonFile = (content: string, name = 'salle.json') =>
  new File([content], name, { type: 'application/json' })

async function openAdvanced() {
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await wrapper.find('[data-test="tab-advanced"]').trigger('click')
  await flushPromises()
  const pick = async (file: File) => {
    const input = wrapper.find<HTMLInputElement>('[data-test="config-import"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
  }
  /** Répond à la confirmation d'import et rend le message qui était affiché. */
  const answer = async (accepted: boolean) => {
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    const message = useConfirm().state.message
    if (accepted) {
      useConfirm().accept()
    } else {
      useConfirm().cancel()
    }
    await flushPromises()
    return message
  }
  const text = (selector: string) => wrapper.find(`[data-test="${selector}"]`).text()
  return { wrapper, pick, answer, text }
}

describe('configuration avancée : boutons Exporter et Importer', () => {
  beforeEach(async () => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    await resetRoomHardware()
  })
  afterEach(() => {
    useConfirm().cancel()
    vi.restoreAllMocks()
  })

  it('exporte : télécharge un fichier JSON sans nom de compagnie, fumée désactivée', async () => {
    await saveWithSmokeProof({
      desksCount: 5,
      lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE },
    })
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:test'
    })
    URL.revokeObjectURL = vi.fn()
    let downloaded = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloaded = this.download
    })
    const { wrapper, text } = await openAdvanced()

    await wrapper.find('[data-test="config-export"]').trigger('click')

    expect(downloaded).toMatch(/^quizzup-salle-salle-\d{4}-\d{2}-\d{2}\.json$/)
    const file = JSON.parse(await (blobs[0] as Blob).text())
    expect(file.config.desksCount).toBe(5)
    expect(file.config.lighting.smoke.enabled).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
    expect(text('transfer-done')).toContain(downloaded)
  })

  it('signale un téléchargement impossible', async () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error('boom')
    })
    const { wrapper, text } = await openAdvanced()

    await wrapper.find('[data-test="config-export"]').trigger('click')

    expect(wrapper.find('[data-test="transfer-error"]').attributes('role')).toBe('alert')
    expect(text('transfer-error')).toContain('téléchargement a échoué')
  })

  it('importe après confirmation et résumé, assistant à refaire', async () => {
    await saveWithSmokeProof({ setupDone: true, lighting: { fixtures: [SMOKE_FIXTURE] } })
    const { pick, answer, text } = await openAdvanced()

    await pick(jsonFile(fileText({ config: { desksCount: 3 } })))
    const message = await answer(true)

    expect(message).toContain('3 pupitres')
    expect(config().desksCount).toBe(3)
    expect(config().setupDone).not.toBe(true)
    expect(text('transfer-done')).toContain('importée')
    expect(text('transfer-safety')).toContain('test de coupure')
  })

  it('n’applique rien si l’opérateur annule', async () => {
    await saveWithSmokeProof({ desksCount: 5 })
    const { pick, answer, wrapper } = await openAdvanced()

    await pick(jsonFile(fileText({ config: { desksCount: 3 } })))
    await answer(false)

    expect(config().desksCount).toBe(5)
    expect(wrapper.find('[data-test="transfer-done"]').exists()).toBe(false)
  })

  it('ne desserre jamais la fumée de la salle, et le dit', async () => {
    await saveWithSmokeProof({ lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE } })
    const { pick, answer, text } = await openAdvanced()

    await pick(
      jsonFile(
        fileText({
          config: {
            desksCount: 3,
            lighting: { fixtures: [SMOKE_FIXTURE], smoke: PERMISSIVE_SMOKE },
          },
        })
      )
    )
    const message = await answer(true)

    expect(message).toContain('ignorée')
    expect(config().desksCount).toBe(3)
    expect(smokeConfig()).toEqual({ ...BOUNDED_SMOKE, enabled: false })
    expect(smokeConfig()).not.toHaveProperty('board')
    expect(text('transfer-safety')).toContain('armement')
  })

  it('désactive la fumée armée de la salle, et le dit avant de demander confirmation', async () => {
    await saveWithSmokeProof({ lighting: { fixtures: [SMOKE_FIXTURE], smoke: BOUNDED_SMOKE } })
    expect(smokeConfig().enabled).toBe(true)
    const { pick, answer } = await openAdvanced()

    await pick(jsonFile(fileText({ config: { desksCount: 3 } })))
    const message = await answer(true)

    expect(message).toContain('sera désactivée')
    expect(message).toContain('test de coupure')
    expect(config().desksCount).toBe(3)
    expect(smokeConfig().enabled).toBe(false)
  })

  it('refuse un second import tant que le premier est en cours', async () => {
    const { pick, answer, wrapper } = await openAdvanced()
    const input = () => wrapper.find<HTMLInputElement>('[data-test="config-import"]')

    await pick(jsonFile(fileText({ config: { desksCount: 3 } })))
    expect(input().element.disabled).toBe(true)
    expect(wrapper.find('[data-test="config-export"]').attributes('disabled')).toBeDefined()
    await pick(jsonFile(fileText({ config: { desksCount: 4 } })))
    await answer(true)

    expect(config().desksCount).toBe(3)
    expect(input().element.disabled).toBe(false)
  })

  it('distingue une config appliquée dont les lumières n’ont pas redémarré', async () => {
    const actual = await vi.importActual<typeof RoomHardware>('@/hardware/roomHardware')
    const { pick, answer, wrapper, text } = await openAdvanced()
    vi.mocked(saveRoomHardwareConfig).mockImplementationOnce(async (input, options) => {
      await actual.saveRoomHardwareConfig(input, options)
      throw new Error('restart_lighting')
    })

    await pick(jsonFile(fileText({ config: { desksCount: 3 } })))
    await answer(true)

    expect(text('transfer-error')).toContain('lumières n’ont pas redémarré')
    expect(text('transfer-error')).not.toContain('Rien n’a été importé')
    expect(config().desksCount).toBe(3)
    const draft = wrapper.find<HTMLTextAreaElement>('[data-test="config-json"]').element.value
    expect(JSON.parse(draft).desksCount).toBe(3)
  })

  it('n’active pas la fumée d’une salle qui ne l’avait pas', async () => {
    await saveWithSmokeProof({ lighting: { fixtures: [SMOKE_FIXTURE] } })
    const before = { ...smokeConfig() }
    const { pick, answer } = await openAdvanced()

    await pick(
      jsonFile(
        fileText({ config: { lighting: { fixtures: [SMOKE_FIXTURE], smoke: PERMISSIVE_SMOKE } } })
      )
    )
    await answer(true)

    expect(smokeConfig().enabled).toBe(false)
    expect(smokeConfig().maxLevel).toBeLessThanOrEqual(before.maxLevel)
    expect(smokeConfig().maxDurationMs).toBeLessThanOrEqual(before.maxDurationMs)
    expect(smokeConfig().cooldownMs).toBeGreaterThanOrEqual(before.cooldownMs)
    expect(smokeConfig().requireConfirmation).toBe(true)
  })

  it.each([
    ['JSON invalide', jsonFile('{ pas du json'), 'pas du JSON valide'],
    ['mauvais format', jsonFile(JSON.stringify({ format: 'autre', schema: 1 })), 'pas une config'],
    ['version plus récente', jsonFile(fileText({ schema: 999, config: {} })), 'plus récente'],
    ['version invalide', jsonFile(fileText({ schema: 'x', config: {} })), 'version du fichier'],
    ['config absente', jsonFile(fileText({ config: 'oui' })), 'pas de configuration'],
    [
      'fichier trop gros',
      jsonFile(fileText({ config: { pad: 'x'.repeat(70 * 1024) } })),
      'trop gros',
    ],
    ['type inattendu', new File(['{}'], 'photo.png', { type: 'image/png' }), 'pas un fichier JSON'],
  ])('refuse proprement : %s', async (_name, file, expected) => {
    await saveWithSmokeProof({ desksCount: 5 })
    const { pick, wrapper, text } = await openAdvanced()

    await pick(file)

    expect(wrapper.find('[data-test="transfer-error"]').attributes('role')).toBe('alert')
    expect(text('transfer-error').toLowerCase()).toContain(expected.toLowerCase())
    expect(useConfirm().state.open).toBe(false)
    expect(config().desksCount).toBe(5)
    expect(wrapper.find('[data-test="transfer-done"]').exists()).toBe(false)
  })

  it('ne lit pas un fichier trop gros', async () => {
    const big = jsonFile('x'.repeat(70 * 1024))
    const read = vi.spyOn(big, 'text')
    const { pick } = await openAdvanced()

    await pick(big)

    expect(read).not.toHaveBeenCalled()
  })

  it('signale un fichier illisible sans rien appliquer', async () => {
    await saveWithSmokeProof({ desksCount: 5 })
    const broken = jsonFile('{}')
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('lecture'))
    const { pick, text } = await openAdvanced()

    await pick(broken)

    expect(text('transfer-error')).toContain('Rien n’a été importé')
    expect(config().desksCount).toBe(5)
  })
})
