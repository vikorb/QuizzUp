import { expect, test } from '@playwright/test'
import { getDemoThemes } from '@room-app/game/demoContent'

import { mockBackofficeApi } from '../support/fakeApi'
import { chooseFirstTheme, expectScreen } from '../support/roomApp'

/**
 * Arrêt d'une partie du backoffice depuis l'écran de salle : l'opérateur confirme, la partie
 * s'arrête en salle et le backoffice est prévenu (`POST /room/games/:id/finish` avec `aborted`),
 * avec les scores des pupitres, pour ne plus la voir « en cours ».
 */
const ROOM_ACCOUNT = { id: 7, companyId: 3, role: 'room', username: 'salle-1' }
const PASSWORD = 'Mot-de-passe-salle-1'
const GAME = {
  id: 42,
  seed: 7,
  roundsCount: 3,
  questionsPerRound: 3,
  miniGames: ['flash_blind_test'],
  state: 'pending',
  participants: [
    { id: 1, podium: 1, displayName: 'Alice', score: 0 },
    { id: 2, podium: 2, displayName: 'Bob', score: 0 },
  ],
}

test.describe('Écran de salle — arrêt de la partie signalé au backoffice', () => {
  test('« Arrêter la partie » envoie l’arrêt et les scores, une seule fois', async ({ page }) => {
    const api = await mockBackofficeApi(page, {
      password: PASSWORD,
      account: ROOM_ACCOUNT,
      live: { game: GAME, themes: getDemoThemes() },
    })

    await page.goto('/login')
    await page.locator('input[name="identifier"]').fill('salle-1')
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Connecter la salle' }).click()
    await page.getByRole('button', { name: 'Lancer la salle' }).click()
    await page.locator('[data-test="start-game"]').click()
    await expect(page).toHaveURL(/\/play$/)

    await expectScreen(page, 'intro')
    await chooseFirstTheme(page)
    expect(api.finishes).toEqual([])

    await page.getByRole('button', { name: 'Arrêter la partie' }).click()
    await page.getByRole('button', { name: 'Confirmer' }).click()

    await expectScreen(page, 'finished')
    await expect(page.locator('.finished__title')).toHaveText('Partie arrêtée')
    await expect.poll(() => api.finishes).toHaveLength(1)
    expect(api.finishes[0]).toMatchObject({
      gameId: GAME.id,
      body: {
        aborted: true,
        scores: [
          { podium: 1, score: 0 },
          { podium: 2, score: 0 },
        ],
      },
    })
    await expect(page.locator('[data-test="finish-sync"]')).toHaveText('Résultats enregistrés')
  })
})
