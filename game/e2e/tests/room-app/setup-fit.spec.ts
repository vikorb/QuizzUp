import { expect, test } from '@playwright/test'

import { enterDemo } from '../support/roomApp'

/**
 * Le parcours de configuration plein écran doit tenir sans défiler sur les écrans de salle
 * courants (1280x800 et 1366x768), et la consigne d'association tenir sur une ligne.
 */
const SCREENS = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
]

for (const viewport of SCREENS) {
  test(`Configuration de la salle — tient sans défiler en ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await enterDemo(page)
    await page.goto('/setup')

    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

    await page.locator('[data-test="setup-start"]').click()
    await expect(page.getByRole('heading', { name: 'Choisis les couleurs' })).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)

    await page.locator('[data-test="setup-layout-ok"]').click()
    await page.locator('[data-test="setup-desks-ok"]').click()
    const prompt = page.locator('[data-test="setup-prompt"]')
    await expect(prompt).toContainText('Appuie sur le buzzer bleu (A)')
    expect(await overflow()).toBeLessThanOrEqual(0)

    const lines = await prompt.evaluate(
      (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)
    )
    expect(Math.round(lines)).toBe(1)
  })

  test(`Configuration des lumières — tient sans défiler en ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await enterDemo(page)
    await page.goto('/setup/lights')
    await expect(page.getByRole('heading', { name: 'Passons aux lumières !' })).toBeVisible()
    await page.locator('[data-test="lights-scan-next"]').click()
    await page.locator('[data-test="lights-six-desk"]').click()
    await expect(page.locator('[data-test="lights-fixture"]')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
