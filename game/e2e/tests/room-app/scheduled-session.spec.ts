import { expect, test } from '@playwright/test'
import { getDemoThemes } from '@room-app/game/demoContent'

import { mockBackofficeApi } from '../support/fakeApi'
import { expectScreen } from '../support/roomApp'

/**
 * Session programmée (lot 13.8) : la salle affiche la prochaine session de l'agenda, à l'heure de
 * son fuseau, puis « Lancer » l'ouvre au backoffice et enchaîne sur la partie.
 */
const ROOM_ACCOUNT = { id: 7, companyId: 3, role: 'room', username: 'salle-1' }
const PASSWORD = 'Mot-de-passe-salle-1'
/** Un fuseau que ni UTC ni le PC de test n'utilisent : l'heure affichée prouve la conversion. */
const ROOM_ZONE = 'Pacific/Chatham'
const MS_PER_MINUTE = 60_000

test.describe('Écran de salle — session programmée', () => {
  test('la prochaine session s’affiche à l’heure de la salle, « Lancer » ouvre puis démarre la partie', async ({
    page,
  }) => {
    // Début dans 10 min : « Lancer » est déjà actif (ouverture 60 min avant).
    const startsAt = new Date(Date.now() + 10 * MS_PER_MINUTE)
    const api = await mockBackofficeApi(page, {
      password: PASSWORD,
      account: ROOM_ACCOUNT,
      live: {
        game: {
          id: 55,
          seed: 7,
          roundsCount: 3,
          questionsPerRound: 3,
          miniGames: ['flash_blind_test'],
          state: 'scheduled',
          scheduledAt: startsAt.toISOString(),
          scheduledEndAt: new Date(startsAt.getTime() + 60 * MS_PER_MINUTE).toISOString(),
          participants: [
            { id: 1, podium: 1, displayName: 'Alice', score: 0 },
            { id: 2, podium: 2, displayName: 'Bob', score: 0 },
          ],
        },
        themes: getDemoThemes(),
        scheduled: { timezone: ROOM_ZONE },
      },
    })

    await page.goto('/login')
    await page.locator('input[name="identifier"]').fill('salle-1')
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Connecter la salle' }).click()
    await page.getByRole('button', { name: 'Lancer la salle' }).click()

    const session = page.locator('[data-test="next-session"]')
    const expectedTime = new Intl.DateTimeFormat('fr', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: ROOM_ZONE,
    }).format(startsAt)
    await expect(session.locator('h2')).toContainText(`Prochaine session : `)
    await expect(session.locator('h2')).toContainText(expectedTime)
    await expect(session).toContainText('Alice')
    await expect(session).toContainText('Bob')
    await expect(page.locator('[data-test="launch-next"]')).toBeEnabled()

    await page.locator('[data-test="launch-next"]').click()

    await expect(page).toHaveURL(/\/play$/)
    await expectScreen(page, 'intro')
    expect(api.calls).toContain('POST /room/games/55/open')
    expect(api.calls).toContain('POST /room/games/55/start')
    expect(api.calls.indexOf('POST /room/games/55/open')).toBeLessThan(
      api.calls.indexOf('POST /room/games/55/start')
    )
  })
})
