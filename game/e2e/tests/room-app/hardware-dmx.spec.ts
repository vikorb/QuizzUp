import { expect, type Page, test } from '@playwright/test'

import { enterDemo } from '../support/roomApp'

/**
 * Écran « Matériel » de la salle en simulation DMX : configuration de la salle (JSON),
 * appareils simulés, scènes de test, arrêt d'urgence et réarmement confirmé.
 */
const RIG = [
  { id: 'par-1', name: 'PAR pupitre 1', profileId: 'par-rgb', address: 1, desk: 1 },
  { id: 'par-2', name: 'PAR pupitre 2', profileId: 'par-rgb', address: 4, desk: 2 },
]

function lamp(page: Page, name: string) {
  return page.locator('[data-test="rig"] .fixture', { hasText: name }).locator('.fixture__lamp')
}

async function lampColor(page: Page, name: string): Promise<string> {
  return lamp(page, name).evaluate((element) =>
    (element as HTMLElement).style.getPropertyValue('--lamp-color')
  )
}

async function lampIntensity(page: Page, name: string): Promise<number> {
  return Number(
    await lamp(page, name).evaluate((element) =>
      (element as HTMLElement).style.getPropertyValue('--lamp-intensity')
    )
  )
}

test.describe('Écran de salle — lumières en simulation DMX', () => {
  test('configure la salle, joue une scène sur un pupitre et coupe tout à l’arrêt d’urgence', async ({
    page,
  }) => {
    await enterDemo(page)
    await page.locator('[data-test="open-hardware"]').click()
    await expect(page).toHaveURL(/\/hardware$/)

    // Configuration de la salle : deux PAR RGB, un par pupitre.
    await page.locator('[data-test="tab-advanced"]').click()
    const editor = page.locator('[data-test="config-json"]')
    const config = JSON.parse(await editor.inputValue()) as {
      lighting: {
        fixtures: unknown[]
        deskColors: Record<string, { r: number; g: number; b: number }>
      }
    }
    config.lighting.fixtures = RIG
    await editor.fill(JSON.stringify(config, null, 2))
    await page.locator('[data-test="config-save"]').click()
    await expect(page.locator('.hw-ok')).toBeVisible()
    await expect(page.locator('[data-test="config-problems"]')).toHaveCount(0)

    // Lumières : sortie simulée et les deux appareils de la salle.
    await page.locator('[data-test="tab-lights"]').click()
    await expect(page.locator('[data-test="lights-status"]')).toContainText(
      'Simulation (aucune interface)'
    )
    await expect(page.locator('[data-test="rig"] .fixture')).toHaveCount(2)

    // Scène « buzz » sur le pupitre 2 : son PAR prend la couleur du pupitre, l'autre baisse.
    const { r, g, b } = config.lighting.deskColors['2']!
    await page.locator('.scene-desk select').selectOption('2')
    await page.locator('[data-test="scene-buzz"]').click()
    await expect.poll(() => lampColor(page, 'PAR pupitre 2')).toBe(`rgb(${r} ${g} ${b})`)
    await expect.poll(() => lampIntensity(page, 'PAR pupitre 2')).toBeGreaterThan(0.5)
    await expect.poll(() => lampIntensity(page, 'PAR pupitre 1')).toBeLessThan(0.3)

    // Arrêt d'urgence : tout s'éteint et les scènes sont bloquées.
    await page.locator('[data-test="emergency-stop"]').click()
    await expect(
      page.getByText('Arrêt d’urgence actif : lumières éteintes, fumée coupée.')
    ).toBeVisible()
    await expect.poll(() => lampIntensity(page, 'PAR pupitre 1')).toBe(0)
    await expect.poll(() => lampIntensity(page, 'PAR pupitre 2')).toBe(0)
    await expect(page.locator('[data-test="scene-buzz"]')).toBeDisabled()

    // Réarmement : demande une confirmation, puis les scènes sont de nouveau possibles.
    await page.locator('[data-test="emergency-reset"]').click()
    await page.getByRole('button', { name: 'Confirmer' }).click()
    await expect(
      page.getByText('Arrêt d’urgence actif : lumières éteintes, fumée coupée.')
    ).toHaveCount(0)
    await expect(page.locator('[data-test="scene-buzz"]')).toBeEnabled()
    await page.locator('[data-test="scene-buzz"]').click()
    await expect.poll(() => lampIntensity(page, 'PAR pupitre 2')).toBeGreaterThan(0.5)
  })
})
