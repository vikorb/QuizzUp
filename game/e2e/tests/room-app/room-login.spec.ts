import { expect, test } from '@playwright/test'

import { mockBackofficeApi } from '../support/fakeApi'
import { API_URL } from '../support/urls'

/** Connexion du PC de la salle avec le compte de salle créé dans le backoffice (US-ROOM-02). */
const ROOM_ACCOUNT = { id: 7, companyId: 3, role: 'room', username: 'salle-1' }
const PASSWORD = 'Mot-de-passe-salle-1'

test.describe('Écran de salle — connexion du compte de salle', () => {
  test('connecte la salle, garde la session au rechargement puis la déconnecte', async ({
    page,
  }) => {
    const api = await mockBackofficeApi(page, { password: PASSWORD, account: ROOM_ACCOUNT })

    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await page.locator('input[name="identifier"]').fill('salle-1')
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Connecter la salle' }).click()

    await expect(page.getByRole('heading', { name: 'Prêt à jouer' })).toBeVisible()
    await expect(page.locator('.topbar__room')).toHaveText('salle-1')
    await expect(page.locator('.topbar__badge')).toHaveCount(0)

    // Rechargement : le jeton est revalidé auprès de l'API, la salle reste connectée.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Prêt à jouer' })).toBeVisible()
    await expect(page.locator('.topbar__room')).toHaveText('salle-1')

    await page.getByRole('button', { name: 'Déconnecter la salle' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(api.calls).toEqual(['POST /login', 'GET /me', 'GET /me', 'POST /logout'])
    expect(await page.evaluate(() => localStorage.getItem('quizzup_room_token'))).toBeNull()
  })

  test('refuse de mauvais identifiants', async ({ page }) => {
    await mockBackofficeApi(page, { password: PASSWORD, account: ROOM_ACCOUNT })
    await page.goto('/login')
    await page.locator('input[name="identifier"]').fill('salle-1')
    await page.locator('input[name="password"]').fill('mauvais')
    await page.getByRole('button', { name: 'Connecter la salle' }).click()

    await expect(page.getByRole('alert')).toHaveText('Identifiants invalides.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('refuse un compte du staff et ne le laisse pas connecté', async ({ page }) => {
    const api = await mockBackofficeApi(page, {
      password: PASSWORD,
      account: { ...ROOM_ACCOUNT, role: 'user', username: 'staff' },
    })
    await page.goto('/login')
    await page.locator('input[name="identifier"]').fill('staff')
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Connecter la salle' }).click()

    await expect(page.getByRole('alert')).toContainText('Ce compte n’est pas un compte de salle.')
    expect(api.calls).toEqual(['POST /login', 'GET /me', 'POST /logout'])
  })

  test('signale une API injoignable', async ({ page }) => {
    await page.route(`${API_URL}/**`, (route) => route.abort('connectionrefused'))
    await page.goto('/login')
    await page.locator('input[name="identifier"]').fill('salle-1')
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Connecter la salle' }).click()

    await expect(page.getByRole('alert')).toHaveText('Impossible de joindre l’API.')
  })
})
