import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import { getDemoThemes } from '@room-app/game/demoContent'

import { mockBackofficeApi } from '../support/fakeApi'
import { chooseFirstTheme, expectScreen } from '../support/roomApp'

/**
 * Commandes à distance (US-LIVE-01) : le personnel envoie une commande, la salle l'applique à la
 * partie en cours (jugée en local) et l'accuse au serveur. Ici le bouchon de l'API joue le serveur :
 * il pousse la commande sur le flux `GET /room/stream` et relève les accusés.
 */
const ROOM_ACCOUNT = { id: 7, companyId: 3, role: 'room', username: 'salle-1' }
const PASSWORD = 'Mot-de-passe-salle-1'
/**
 * Le bouchon rend le flux d'un bloc puis le ferme : chaque commande force une reconnexion de la
 * salle, dont le délai grandit (1, 2, 5, 10 s...). Les attentes qui suivent un envoi sont donc plus
 * larges que le délai par défaut de Playwright.
 */
const AFTER_COMMAND = { timeout: 30_000 }
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

test.describe('Écran de salle — commandes à distance', () => {
  test('pause puis reprise à distance pendant une question, accusées au serveur', async ({
    page,
  }) => {
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
    const overlay = page.locator('[data-test="paused-overlay"]')

    const pause = randomUUID()
    api.sendCommand({ commandId: pause, command: 'pause' })
    await expect(overlay).toBeVisible(AFTER_COMMAND)
    await expect
      .poll(() => api.commandResults, AFTER_COMMAND)
      .toEqual([{ commandId: pause, body: { result: 'applied' } }])

    // Une question périmée (la 2e de la 1re manche, alors que la 1re est en cours) n'est pas
    // passée : la partie reste en pause, refus accusé.
    const stale = randomUUID()
    api.sendCommand({ commandId: stale, command: 'skip', round: 1, questionIndex: 1 })
    await expect
      .poll(() => api.commandResults.at(-1), AFTER_COMMAND)
      .toEqual({
        commandId: stale,
        body: { result: 'refused', reason: 'not_in_question' },
      })
    await expect(overlay).toBeVisible()

    const resume = randomUUID()
    api.sendCommand({ commandId: resume, command: 'resume' })
    await expect(overlay).toBeHidden(AFTER_COMMAND)
    await expect
      .poll(() => api.commandResults.at(-1), AFTER_COMMAND)
      .toEqual({
        commandId: resume,
        body: { result: 'applied' },
      })
    await expectScreen(page, 'blind')
  })
})
