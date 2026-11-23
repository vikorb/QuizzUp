import { expect, type Page, test } from '@playwright/test'

import { enterDemo } from '../support/roomApp'

/**
 * Le parcours de configuration plein écran doit tenir sans défiler sur les écrans de salle
 * courants (1280x800 et 1366x768), et la consigne d'association tenir sur une ligne.
 *
 * L'assistant a une hauteur fixe (100vh) et fait défiler son contenu dans `wizard-body` : on
 * mesure donc le débordement de ce conteneur à chaque étape, pas celui de la page.
 */
const SCREENS = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
]

/** Tolérance d'arrondi des mesures, en pixels. */
const TOLERANCE_PX = 1

async function expectFits(page: Page): Promise<void> {
  const overflow = await page
    .locator('[data-test="wizard-body"]')
    .evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(TOLERANCE_PX)
}

for (const viewport of SCREENS) {
  test(`Configuration de la salle — tient sans défiler en ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    // Sans animation : les pulsations ne gonflent pas la zone défilable pendant la mesure.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterDemo(page)
    await page.goto('/setup')

    await expect(page.locator('[data-test="setup-start"]')).toBeVisible()
    await expectFits(page)

    await page.locator('[data-test="setup-start"]').click()
    await expect(page.getByRole('heading', { name: 'Choisis les couleurs' })).toBeVisible()
    await expectFits(page)

    await page.locator('[data-test="setup-layout-ok"]').click()
    await expect(page.locator('[data-test="setup-desks-4"]')).toBeVisible()
    await expectFits(page)

    await page.locator('[data-test="setup-desks-ok"]').click()
    const prompt = page.locator('[data-test="setup-prompt"]')
    await expect(prompt).toContainText('Appuie sur le buzzer bleu (A)')
    await expectFits(page)

    const lines = await prompt.evaluate(
      (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)
    )
    expect(Math.round(lines)).toBe(1)

    // Récapitulatif de 4 pupitres : l'étape la plus chargée. On passe les 16 buzzers.
    for (let buzzer = 0; buzzer < 16; buzzer += 1) {
      await page.locator('[data-test="setup-skip"]').click()
    }
    await expect(page.locator('[data-test="setup-done"]')).toBeVisible()
    await expectFits(page)
  })

  test(`Configuration des lumières — tient sans défiler en ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterDemo(page)
    await page.goto('/setup/lights')
    await expect(page.getByRole('heading', { name: 'Passons aux lumières !' })).toBeVisible()
    await expectFits(page)

    await page.locator('[data-test="lights-scan-next"]').click()
    await expect(page.locator('[data-test="lights-six-desk"]')).toBeVisible()
    await expectFits(page)

    await page.locator('[data-test="lights-six-desk"]').click()
    // Si la démo a déjà des lumières, la confirmation de remplacement s'ouvre.
    const dialog = page.getByRole('dialog')
    if (
      await dialog.waitFor({ state: 'visible', timeout: 1000 }).then(
        () => true,
        () => false
      )
    ) {
      await dialog.getByRole('button').last().click()
    }
    await expect(page.locator('[data-test="lights-fixture"]')).toBeVisible()
    await expectFits(page)

    // Fin du test d'appareils : on répond « oui » jusqu'au récapitulatif.
    const done = page.locator('[data-test="lights-done"]')
    const yes = page.locator('[data-test="lights-yes"]')
    const smokeNext = page.locator('[data-test="lights-smoke-next"]')
    while (!(await done.isVisible())) {
      if (await yes.isVisible()) {
        await yes.click()
      } else if (await smokeNext.isVisible()) {
        await smokeNext.click()
      }
    }
    await expectFits(page)
  })
}
