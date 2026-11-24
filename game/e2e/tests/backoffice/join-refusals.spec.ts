import { devices, expect, test } from '@playwright/test'

import { mockJoinApi } from '../support/fakeBackoffice'

/**
 * Page téléphone d'inscription (`/rejoindre/#<jeton>`) : refus du serveur, avec le message traduit
 * (jamais le code brut). Le jeton est dans le fragment de l'adresse, comme dans le QR code.
 */
// Jetons au format du contrat : 32 octets en base64url, soit 43 caractères.
const TOKEN = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kM6nP9rS2u'
const OTHER_TOKEN = 'Zy8xW5vU2tS9rQ6pN3mL0kJ7hG4fE1dC8bA5zY2xW9v'

test.use({ ...devices['Pixel 7'], locale: 'fr-FR' })

test.describe('Page téléphone — refus', () => {
  test('code de partie inconnu : « Lien invalide »', async ({ page }) => {
    await mockJoinApi(page, { token: TOKEN })

    await page.goto(`/rejoindre/#${OTHER_TOKEN}`)

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
    expect(join.requests).toBe(0)
  })

  test('inscriptions fermées : « Inscriptions closes »', async ({ page }) => {
    await mockJoinApi(page, { token: TOKEN, closed: true })

    await page.goto(`/rejoindre/#${TOKEN}`)

    await expect(page.getByRole('heading', { name: 'Inscriptions closes' })).toBeVisible()
    await expect(page.getByText('Demandez au personnel un nouveau QR code.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toHaveCount(0)
  })

  test('inscriptions complètes à l’envoi : message traduit, formulaire gardé', async ({ page }) => {
    await mockJoinApi(page, { token: TOKEN, full: true })

    await page.goto(`/rejoindre/#${TOKEN}`)
    await page.getByLabel('Prénom').fill('Léa')
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click()

    await expect(
      page.getByText('Les inscriptions sont complètes pour le moment. Prévenez le personnel')
    ).toBeVisible()
    await expect(page.getByLabel('Prénom')).toHaveValue('Léa')
  })
})
