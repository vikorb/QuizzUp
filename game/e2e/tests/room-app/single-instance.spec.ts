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

    // Le premier onglet n'est pas gêné, y compris après un rechargement (verrou rendu puis repris).
    await expect(page.getByRole('heading', { name: 'Prêt à jouer' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Prêt à jouer' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'QuizzUp est déjà ouvert sur ce PC' })
    ).toHaveCount(0)
  })

  test('fermer le premier onglet libère le poste pour le suivant', async ({ context, page }) => {
    await page.goto('/login')
    await expect(
      page.getByRole('button', { name: 'Essayer en mode démo (sans compte)' })
    ).toBeVisible()
    await page.close()

    const next = await context.newPage()
    await next.goto('/login')
    await expect(
      next.getByRole('button', { name: 'Essayer en mode démo (sans compte)' })
    ).toBeVisible()
  })
})
