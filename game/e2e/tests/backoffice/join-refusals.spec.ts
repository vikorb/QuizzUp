import { devices, expect, test } from '@playwright/test'

import { mockJoinApi } from '../support/fakeBackoffice'

/**
 * Page téléphone d'inscription (`/rejoindre/#<jeton>`) : refus du serveur, avec le message traduit
 * (jamais le code brut). Le jeton est dans le fragment de l'adresse, comme dans le QR code.
 */
const TOKEN = 'jeton-inscription-demo'

test.use({ ...devices['Pixel 7'], locale: 'fr-FR' })

test.describe('Page téléphone — refus', () => {
  test('code de partie inconnu : « Lien invalide »', async ({ page }) => {
    await mockJoinApi(page, { token: TOKEN })

    await page.goto('/rejoindre/#autre-partie')

    await expect(page.getByRole('heading', { name: 'Lien invalide' })).toBeVisible()
    await expect(
      page.getByText('Scannez de nouveau le QR code affiché dans la salle.')
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toHaveCount(0)
  })

  test('adresse sans code : « Lien invalide » sans appel au serveur', async ({ page }) => {
    const join = await mockJoinApi(page, { token: TOKEN })

    await page.goto('/rejoindre/')

    await expect(page.getByRole('heading', { name: 'Lien invalide' })).toBeVisible()
    expect(join.registrations).toEqual([])
  })

  test('inscriptions fermées : « Inscriptions closes »', async ({ page }) => {
    await mockJoinApi(page, { token: TOKEN, closed: true })

    await page.goto(`/rejoindre/#${TOKEN}`)

    await expect(page.getByRole('heading', { name: 'Inscriptions closes' })).toBeVisible()
    await expect(page.getByText('Demandez au personnel un nouveau QR code.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toHaveCount(0)
  })

  test('inscriptions complètes à l’envoi : message traduit, formulaire gardé', async ({ page }) => {
    const join = await mockJoinApi(page, { token: TOKEN, full: true })

    await page.goto(`/rejoindre/#${TOKEN}`)
    await page.getByLabel('Prénom').fill('Léa')
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click()

    await expect(
      page.getByText('Les inscriptions sont complètes pour le moment. Prévenez le personnel')
    ).toBeVisible()
    await expect(page.getByLabel('Prénom')).toHaveValue('Léa')
    expect(join.registrations).toEqual([])
  })
})
