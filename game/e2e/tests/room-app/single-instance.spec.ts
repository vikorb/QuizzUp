import { expect, test } from '@playwright/test'

import { enterDemo } from '../support/roomApp'

/** Un seul onglet par poste : un second onglet ne démarre ni moteur, ni buzzers, ni lumières. */
test.describe('Écran de salle — instance unique', () => {
  test('le second onglet du même navigateur est bloqué, le premier reste utilisable', async ({
    context,
    page,
  }) => {
    await enterDemo(page)

    const second = await context.newPage()
    await second.goto('/')
    await expect(
      second.getByRole('heading', { name: 'QuizzUp est déjà ouvert sur ce PC' })
    ).toBeVisible()
    // Pas de routeur ni d'écran de salle dans le second onglet : rien n'est démarré.
    await expect(second.getByRole('button', { name: 'Lancer la salle' })).toHaveCount(0)
    await expect(second).toHaveURL(/\/$/)

    // Le premier onglet n'est pas gêné.
    await expect(page.getByRole('heading', { name: 'Prêt à jouer' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'QuizzUp est déjà ouvert sur ce PC' })
    ).toHaveCount(0)
  })

  test('un onglet seul se recharge sans jamais se croire bloqué', async ({ page }) => {
    await page.goto('/login')
    for (let reload = 0; reload < 5; reload += 1) {
      await expect(
        page.getByRole('button', { name: 'Essayer en mode démo (sans compte)' })
      ).toBeVisible()
      await page.reload()
    }
    await expect(
      page.getByRole('heading', { name: 'QuizzUp est déjà ouvert sur ce PC' })
    ).toHaveCount(0)
  })

  test('fermer le premier onglet : le second démarre tout seul', async ({ context, page }) => {
    const demoButton = (target: typeof page) =>
      target.getByRole('button', { name: 'Essayer en mode démo (sans compte)' })
    await page.goto('/login')
    await expect(demoButton(page)).toBeVisible()

    const second = await context.newPage()
    await second.goto('/login')
    await expect(
      second.getByRole('heading', { name: 'QuizzUp est déjà ouvert sur ce PC' })
    ).toBeVisible()
    await expect(demoButton(second)).toHaveCount(0)

    // Le verrou est rendu : le second onglet se recharge et démarre sans intervention.
    await page.close()
    await expect(demoButton(second)).toBeVisible()
    await expect(
      second.getByRole('heading', { name: 'QuizzUp est déjà ouvert sur ce PC' })
    ).toHaveCount(0)
  })
})
