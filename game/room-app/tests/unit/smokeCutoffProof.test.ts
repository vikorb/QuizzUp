import { flushPromises } from '@vue/test-utils'

import {
  applyRemoteHardwareConfig,
  getLighting,
  getRoomHardwareConfig,
  recordSmokeCutoffResult,
  saveRoomHardwareConfig,
  setHardwareRemoteSaver,
  SMOKE_PROOF_STORAGE_KEY,
  startLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'

import { saveWithSmokeProof } from '../_helpers/smokeProof'

/** Machine sur relais, armée d'office (`requireConfirmation: false`) : seule la garde la refuse. */
function smokeConfig(smoke: Record<string, unknown> = {}, address = 40) {
  return {
    lighting: {
      fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address }],
      smoke: { enabled: true, requireConfirmation: false, ...smoke },
    },
  }
}

/** Même machine, par le pont Art-Net. Adresses de boucle locale seulement : aucune adresse réelle. */
const bridged = (lighting: Record<string, unknown> = {}) => ({
  lighting: { ...smokeConfig().lighting, driver: 'artnet-bridge', ...lighting },
})

const noopSaver = async () => null
const bindRoom = (accountId: number) =>
  setHardwareRemoteSaver(noopSaver, { accountId, tokenTag: `tag${accountId}` })

describe('fumée : test de coupure réussi sur ce poste', () => {
  describe('sans preuve locale', () => {
    it('refuse tout jet quand la config du compte active la fumée, sans la réécrire', async () => {
      bindRoom(7)
      // Config reçue du compte de la salle : fumée activée, personne n'a fait le test ici.
      await applyRemoteHardwareConfig(smokeConfig(), 3)
      const lights = await startLighting()

      expect(lights.getState().smoke.status).toBe('disabled')
      expect(lights.smoke.arm()).toBe(false)
      expect(lights.smoke.fire(3_000)).toEqual({ ok: false, reason: 'disabled' })
      expect(lights.getState().smoke.level).toBe(0)
      // La config n'est pas réécrite : c'est l'armement local qui est refusé.
      expect(getRoomHardwareConfig().lighting.smoke.enabled).toBe(true)
      expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
    })

    it('relance les lumières sans fumée quand la config qui l’active arrive sur des lumières déjà lancées', async () => {
      bindRoom(7)
      const before = await startLighting()
      await applyRemoteHardwareConfig(smokeConfig(), 3)

      const lights = getLighting()
      expect(lights).not.toBe(before)
      expect(lights?.smoke.fire(3_000)).toEqual({ ok: false, reason: 'disabled' })
    })

    it('ne laisse la fumée active que pendant le test de coupure lui-même', async () => {
      await saveRoomHardwareConfig(smokeConfig(), { persist: false, smokeTest: true })
      const lights = await startLighting()
      expect(useRoomHardware().smokeNeedsTest.value).toBe(false)
      expect(lights.smoke.fire(3_000)).toMatchObject({ ok: true })

      // Config suivante, sans le test : la fumée est refusée de nouveau.
      await saveRoomHardwareConfig(smokeConfig())
      expect(getLighting()?.getState().smoke.status).toBe('disabled')
      expect(getLighting()?.getState().smoke.level).toBe(0)
      expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
    })

    it('n’écrit jamais la preuve hors d’un test de coupure', () => {
      expect(recordSmokeCutoffResult(true)).toBe(false)
      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
    })

    it('ne pose pas la preuve quand la config a changé pendant le test', async () => {
      await saveRoomHardwareConfig(smokeConfig(), { persist: false, smokeTest: true })
      // Config reçue d'un autre poste pendant le test : la config de test n'est plus appliquée.
      await applyRemoteHardwareConfig(smokeConfig({ cooldownMs: 40_000 }), 4)

      expect(recordSmokeCutoffResult(true)).toBe(false)
      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
    })

    it('ne prend pas pour une preuve une valeur illisible dans le stockage', async () => {
      localStorage.setItem(SMOKE_PROOF_STORAGE_KEY, '{oops')
      await saveRoomHardwareConfig(smokeConfig())
      expect((await startLighting()).getState().smoke.status).toBe('disabled')

      localStorage.setItem(SMOKE_PROOF_STORAGE_KEY, JSON.stringify({ accountId: 'x' }))
      await saveRoomHardwareConfig(smokeConfig({ cooldownMs: 40_000 }))
      expect(getLighting()?.getState().smoke.status).toBe('disabled')
    })
  })

  describe('avec une preuve locale', () => {
    it('arme la fumée pour cette salle et ces réglages', async () => {
      bindRoom(7)
      await saveWithSmokeProof(smokeConfig())
      const lights = await startLighting()

      expect(lights.getState().smoke.status).toBe('ready')
      expect(lights.smoke.fire(3_000)).toMatchObject({ ok: true })
      expect(useRoomHardware().smokeNeedsTest.value).toBe(false)
    })

    it('est retenue sur le poste après un rechargement de la page', async () => {
      await saveWithSmokeProof(smokeConfig())
      const { resetRoomHardware } = await import('@/hardware/roomHardware')
      await resetRoomHardware()

      expect((await startLighting()).getState().smoke.status).toBe('ready')
    })

    it('ne remonte pas au serveur : la config envoyée ne la contient pas', async () => {
      const sent: unknown[] = []
      setHardwareRemoteSaver(
        async (config) => {
          sent.push(config)
          return null
        },
        { accountId: 7, tokenTag: 'tag7' }
      )
      await saveWithSmokeProof(smokeConfig())

      expect(sent.length).toBeGreaterThan(0)
      expect(JSON.stringify(sent)).not.toContain('fingerprint')
      expect(JSON.stringify(sent)).not.toContain(SMOKE_PROOF_STORAGE_KEY)
    })

    it('ne vaut pas pour une autre salle, même avec les mêmes réglages', async () => {
      bindRoom(7)
      await saveWithSmokeProof(smokeConfig())
      await startLighting()
      expect(getLighting()?.getState().smoke.status).toBe('ready')

      // Le poste est repris par le compte d'une autre salle : les lumières repartent sans fumée.
      bindRoom(8)
      await vi.waitFor(() => expect(getLighting()?.getState().smoke.status).toBe('disabled'))
      expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
    })

    it('ne vaut plus quand le poste ne sait plus de quelle salle il s’agit', async () => {
      bindRoom(7)
      await saveWithSmokeProof(smokeConfig())
      setHardwareRemoteSaver(null)
      await flushPromises()

      expect((await startLighting()).getState().smoke.status).toBe('disabled')
    })

    it.each([
      ['la durée maximale', smokeConfig({ maxDurationMs: 2_000 })],
      ['la pause entre deux jets', smokeConfig({ cooldownMs: 40_000 })],
      ['le niveau maximal', smokeConfig({ maxLevel: 100 })],
      ['l’adresse de la machine', smokeConfig({}, 41)],
      [
        'l’univers de la machine',
        {
          lighting: {
            fixtures: [
              { id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40, universe: 1 },
            ],
            smoke: { enabled: true, requireConfirmation: false },
          },
        },
      ],
    ])('ne vaut plus quand %s change après le test', async (_label, changed) => {
      await saveWithSmokeProof(smokeConfig())
      await startLighting()
      expect(getLighting()?.getState().smoke.status).toBe('ready')

      await saveRoomHardwareConfig(changed)

      expect(getLighting()?.getState().smoke.status).toBe('disabled')
      expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
    })

    describe('sortie fumée portée par un profil sur mesure d’un autre type', () => {
      // Profil « par » dont un canal a le rôle fumée : le contrôleur le traite comme une sortie fumée.
      const parSmokeProfile = {
        id: 'par-fumee',
        name: 'Par fumée',
        kind: 'par',
        channels: [{ role: 'smoke', binary: true }],
      }
      const withParSmoke = (extra: Record<string, unknown> = {}) => ({
        lighting: {
          ...smokeConfig().lighting,
          customProfiles: [parSmokeProfile],
          fixtures: [
            ...smokeConfig().lighting.fixtures,
            { id: 'par-fumee', name: 'Par fumée', profileId: 'par-fumee', address: 60, ...extra },
          ],
        },
      })

      it('ne vaut plus quand cet appareil est ajouté après le test', async () => {
        await saveWithSmokeProof(smokeConfig())
        await startLighting()
        expect(getLighting()?.getState().smoke.status).toBe('ready')

        await saveRoomHardwareConfig(withParSmoke())

        expect(getLighting()?.getState().smoke.status).toBe('disabled')
        expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
      })

      it.each([
        ['son adresse', { address: 61 }],
        ['son univers', { universe: 1 }],
      ])('ne vaut plus quand %s change après le test', async (_label, moved) => {
        await saveWithSmokeProof(withParSmoke())
        await startLighting()
        expect(getLighting()?.getState().smoke.status).toBe('ready')

        await saveRoomHardwareConfig(withParSmoke(moved))

        expect(getLighting()?.getState().smoke.status).toBe('disabled')
        expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
      })
    })

    describe('cible de la sortie Art-Net', () => {
      it.each([
        ['le nœud Art-Net', { artnet: { target: '127.0.0.3' } }],
        ['l’adresse du pont', { bridgeUrl: 'ws://127.0.0.1:9002' }],
      ])('ne vaut plus quand %s change après le test', async (_label, changed) => {
        const tested = { artnet: { target: '127.0.0.2' }, bridgeUrl: 'ws://127.0.0.1:9001' }
        await saveWithSmokeProof(bridged(tested))
        expect(useRoomHardware().smokeNeedsTest.value).toBe(false)

        await saveRoomHardwareConfig(bridged({ ...tested, ...changed }))

        expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
      })

      it('vaut encore quand la cible ne change pas', async () => {
        const tested = { artnet: { target: '127.0.0.2' }, bridgeUrl: 'ws://127.0.0.1:9001' }
        await saveWithSmokeProof(bridged(tested))
        await saveRoomHardwareConfig(bridged({ ...tested, refreshHz: 20 }))

        expect(useRoomHardware().smokeNeedsTest.value).toBe(false)
      })
    })

    it('vaut encore quand seul le reste des lumières change', async () => {
      await saveWithSmokeProof(smokeConfig())
      await startLighting()

      await saveRoomHardwareConfig({
        lighting: { ...smokeConfig().lighting, refreshHz: 20 },
      })

      // Les lumières repartent (fumée désarmée, comme à chaque relance), mais pas « désactivée ».
      expect(getLighting()?.getState().smoke.status).toBe('unarmed')
      expect(useRoomHardware().smokeNeedsTest.value).toBe(false)
    })
  })

  describe('résultat du test de coupure', () => {
    it('réussi : la preuve est écrite sur ce poste', async () => {
      await saveRoomHardwareConfig(smokeConfig(), { persist: false, smokeTest: true })
      expect(recordSmokeCutoffResult(true)).toBe(true)

      expect(JSON.parse(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY) ?? 'null')).toMatchObject({
        accountId: null,
      })
    })

    it('réussi sur un poste sans compte : la preuve ne vaut pas pour une salle connectée', async () => {
      await saveWithSmokeProof(smokeConfig())

      bindRoom(7)
      await flushPromises()

      expect((await startLighting()).getState().smoke.status).toBe('disabled')
      expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
    })

    it('échoué : pas de preuve, et une preuve précédente est effacée', async () => {
      await saveWithSmokeProof(smokeConfig())
      await startLighting()
      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).not.toBeNull()

      await saveRoomHardwareConfig(smokeConfig(), { persist: false, smokeTest: true })
      expect(recordSmokeCutoffResult(false)).toBe(false)
      await saveRoomHardwareConfig(smokeConfig())

      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
      expect(getLighting()?.getState().smoke.status).toBe('disabled')
    })

    it('abandonné (aucune réponse) : pas de preuve', async () => {
      await saveRoomHardwareConfig(smokeConfig(), { persist: false, smokeTest: true })
      await saveRoomHardwareConfig(smokeConfig())

      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
      expect((await startLighting()).getState().smoke.status).toBe('disabled')
    })

    it('stockage indisponible : pas de preuve, la fumée reste refusée', async () => {
      await saveRoomHardwareConfig(smokeConfig(), { persist: false, smokeTest: true })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      expect(recordSmokeCutoffResult(true)).toBe(false)
      vi.restoreAllMocks()

      await saveRoomHardwareConfig(smokeConfig())
      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
      expect((await startLighting()).getState().smoke.status).toBe('disabled')
    })
  })
})
