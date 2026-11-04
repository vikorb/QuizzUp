import { expect, type Page, test } from '@playwright/test'

import { freePort, isBlackPacket, startBridge, startFakeNode } from '../support/artnetBridge'
import { enterDemo } from '../support/roomApp'

/**
 * Écran de salle + **vrai pont Art-Net** (sources de `game/artnet-bridge`, lancées par le test)
 * + faux nœud UDP : reprise du pont sans clic après un rechargement, bandeau « Connecter le
 * pont » quand il est absent, arrêt d'urgence maintenu après un rechargement.
 * L'écran « Matériel » démarre les lumières comme le fait « Lancer la salle ».
 */
const HARDWARE_KEY = 'quizzup_room_hardware'

async function useBridgeAt(page: Page, bridgeUrl: string): Promise<void> {
  const config = {
    lighting: {
      driver: 'artnet-bridge',
      bridgeUrl,
      fixtures: [{ id: 'par-1', name: 'PAR 1', profileId: 'par-rgb', address: 1, desk: 1 }],
    },
  }
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: HARDWARE_KEY, value: JSON.stringify(config) }
  )
}

/** Ouvre l'onglet Lumières de l'écran Matériel (les lumières y démarrent). */
async function openLights(page: Page): Promise<void> {
  await page.locator('[data-test="open-hardware"]').click()
  await expect(page).toHaveURL(/\/hardware$/)
  await page.locator('[data-test="tab-lights"]').click()
}

const emergencyBanner = (page: Page) => page.getByText('Arrêt d’urgence actif', { exact: false })

test.describe('Écran de salle — pont Art-Net réel', () => {
  test('reprend le pont sans clic, y compris après un rechargement', async ({ page }) => {
    const node = await startFakeNode()
    const bridge = await startBridge(node)
    try {
      await useBridgeAt(page, bridge.url)
      await enterDemo(page)
      await openLights(page)

      // Aucun clic sur « Connecter » : le pont est repris au démarrage des lumières.
      await expect(page.locator('[data-test="lights-status"]')).toContainText('connectée')
      await expect(page.locator('[data-test="bridge-banner"]')).toHaveCount(0)
      await expect
        .poll(() => node.packets.some((packet) => !isBlackPacket(packet)), { timeout: 15_000 })
        .toBe(true)

      // Redémarrage du poste (rechargement) : même chose, toujours sans clic.
      await page.reload()
      await page.locator('[data-test="tab-lights"]').click()
      const before = node.packets.length
      await expect(page.locator('[data-test="lights-status"]')).toContainText('connectée', {
        timeout: 15_000,
      })
      await expect(page.locator('[data-test="bridge-banner"]')).toHaveCount(0)
      await expect.poll(() => node.packets.length).toBeGreaterThan(before + 5)
    } finally {
      await bridge.stop()
      await node.close()
    }
  })

  test('affiche « Connecter le pont » quand il est absent, puis le reprend au clic', async ({
    page,
  }) => {
    const node = await startFakeNode()
    const port = await freePort()
    let bridge: Awaited<ReturnType<typeof startBridge>> | null = null
    try {
      await useBridgeAt(page, `ws://127.0.0.1:${port}`)
      await enterDemo(page)
      // L'absence du pont ne bloque pas la salle : l'écran Matériel s'ouvre, lumières simulées.
      await openLights(page)

      const banner = page.locator('[data-test="bridge-banner"]')
      await expect(banner).toBeVisible({ timeout: 15_000 })
      await expect(banner).toContainText('Pont Art-Net non connecté')
      await expect(page.locator('[data-test="rig"] .fixture')).toHaveCount(1)
      expect(node.packets).toHaveLength(0)

      // Le pont est lancé : un clic suffit.
      bridge = await startBridge(node, port)
      await page.locator('[data-test="bridge-connect"]').click()
      await expect(banner).toHaveCount(0)
      await expect(page.locator('[data-test="lights-status"]')).toContainText('connectée')
      await expect.poll(() => node.packets.length).toBeGreaterThan(0)
    } finally {
      await bridge?.stop()
      await node.close()
    }
  })

  test('garde l’arrêt d’urgence après un rechargement : seul du noir sort, jusqu’au réarmement', async ({
    page,
  }) => {
    const node = await startFakeNode()
    const bridge = await startBridge(node)
    try {
      await useBridgeAt(page, bridge.url)
      await enterDemo(page)
      await openLights(page)
      await expect(page.locator('[data-test="lights-status"]')).toContainText('connectée')
      await expect
        .poll(() => node.packets.some((packet) => !isBlackPacket(packet)), { timeout: 15_000 })
        .toBe(true)

      await page.locator('[data-test="emergency-stop"]').click()
      await expect(emergencyBanner(page)).toBeVisible()

      // Rechargement : la salle repart, l'arrêt d'urgence est toujours là.
      await page.reload()
      await page.locator('[data-test="tab-lights"]').click()
      await expect(emergencyBanner(page)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-test="lights-status"]')).toContainText('connectée')
      const marker = node.packets.length
      await expect.poll(() => node.packets.length).toBeGreaterThan(marker + 10)

      // Depuis la reconnexion, rien n'est parti d'autre que du noir (pas même la salle au repos).
      expect(node.packets.slice(marker).every((packet) => isBlackPacket(packet))).toBe(true)
      await expect(page.locator('[data-test="scene-buzz"]')).toBeDisabled()

      // Réarmement humain confirmé : les lumières reviennent.
      await page.locator('[data-test="emergency-reset"]').click()
      await page.getByRole('button', { name: 'Confirmer' }).click()
      await expect(emergencyBanner(page)).toHaveCount(0)
      await expect
        .poll(() => node.packets.slice(marker).some((packet) => !isBlackPacket(packet)))
        .toBe(true)
    } finally {
      await bridge.stop()
      await node.close()
    }
  })
})
