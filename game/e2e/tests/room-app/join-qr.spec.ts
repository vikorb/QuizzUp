import { devices, expect, test } from '@playwright/test'
import { getDemoThemes } from '@room-app/game/demoContent'

import { type FakeLive, mockBackofficeApi } from '../support/fakeApi'
import { mockJoinApi } from '../support/fakeBackoffice'
import { BACKOFFICE_URL } from '../support/urls'

/**
 * Inscription des joueurs par QR code : le lobby du personnel (écran de salle) affiche le lien et
 * le QR de la partie ; la page téléphone du backoffice, ouverte sur ce lien, lit le jeton dans le
 * fragment et envoie exactement `{ token, displayName }` ; le lobby relit la partie et affiche le
 * compte des demandes puis le prénom au pupitre. Les deux API (salle et page publique) sont des
 * bouchons ; la page téléphone et l'écran de salle sont les vrais.
 *
 * Limite : le bouchon de la salle rend le flux d'un bloc (`hello` puis événements) et le ferme, et
 * chaque `hello` fait relire la partie au lobby. Ce scénario ne prouve donc pas la réception de
 * `game_updated` : elle est couverte par les tests unitaires (`roomLive.test.ts`,
 * `StaffGameLobby.test.ts`, `liveJoinRegistrations.test.ts`).
 */
const ROOM_ACCOUNT = { id: 7, companyId: 3, role: 'room', username: 'salle-1' }
const PASSWORD = 'Mot-de-passe-salle-1'
// Jeton au format du contrat : 32 octets en base64url, soit 43 caractères.
const TOKEN = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kM6nP9rS2u'
/** Le bouchon rend le flux d'un bloc puis le ferme : la salle le rouvre après un délai croissant. */
const AFTER_EVENT = { timeout: 30_000 }
const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1"/><rect x="1" y="1" width="1" height="1"/></svg>'

function liveGame(): FakeLive {
  return {
    themes: getDemoThemes(),
    game: {
      id: 42,
      seed: 7,
      roundsCount: 3,
      questionsPerRound: 3,
      miniGames: ['flash_blind_test'],
      state: 'pending',
      participants: [],
      pendingRegistrationsCount: 0,
      join: {
        url: `${BACKOFFICE_URL}/rejoindre/#${TOKEN}`,
        qrSvg: QR_SVG,
        expiresAt: '2026-11-04T23:00:00.000Z',
      },
    },
  }
}

test.describe('Inscription par QR code', () => {
  test('le lien du lobby inscrit un joueur depuis un téléphone, le lobby relit la partie', async ({
    page,
    browser,
  }) => {
    const live = liveGame()
    const api = await mockBackofficeApi(page, {
      password: PASSWORD,
      account: ROOM_ACCOUNT,
      live,
    })

    await page.goto('/login')
    await page.locator('input[name="identifier"]').fill('salle-1')
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Connecter la salle' }).click()
    await page.getByRole('button', { name: 'Lancer la salle' }).click()

    // Lobby du personnel : le QR est une vraie image, le lien est écrit en toutes lettres.
    const qr = page.locator('[data-test="join-qr"]')
    await expect(qr).toBeVisible()
    await expect
      .poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
    const joinUrl = (await page.locator('[data-test="join-url"]').innerText()).trim()
    expect(joinUrl).toBe(`${BACKOFFICE_URL}/rejoindre/#${TOKEN}`)
    const pending = page.locator('[data-test="pending-registrations"]')
    await expect(pending).toHaveText('')

    // Téléphone : un contexte mobile ouvre le lien du lobby.
    const phoneContext = await browser.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' })
    try {
      const phone = await phoneContext.newPage()
      const join = await mockJoinApi(phone, {
        token: TOKEN,
        onRegistration: () => {
          // Le serveur compte la demande ; le lobby la relira à la prochaine ouverture du flux.
          live.game = { ...live.game, pendingRegistrationsCount: 1 }
          api.sendEvent('game_updated')
        },
      })

      await phone.goto(joinUrl)
      await expect(phone.getByRole('heading', { name: 'Rejoindre la partie' })).toBeVisible()
      await expect(phone.getByText('Centre Démo · Salle 1')).toBeVisible()

      await phone.getByLabel('Prénom').fill('Léa')
      await phone.getByRole('button', { name: 'Envoyer ma demande' }).click()
      await expect(phone.getByRole('heading', { name: 'C’est noté.' })).toBeVisible()

      // Le jeton et le prénom voyagent dans le corps ; pas d'e-mail saisi, donc aucun consentement.
      expect(join.registrations).toEqual([{ token: TOKEN, displayName: 'Léa' }])
    } finally {
      await phoneContext.close()
    }

    // Le lobby affiche la demande (le nombre seulement : les noms restent au backoffice).
    await expect(pending).toHaveText('1 inscription en attente de validation', AFTER_EVENT)
    await expect(page.locator('[data-test="player-1"]')).toHaveCount(0)

    // Le personnel valide la demande au backoffice (simulé) : le lobby relit la partie et montre
    // le joueur à son pupitre.
    live.game = {
      ...live.game,
      participants: [{ id: 1, podium: 1, displayName: 'Léa', score: 0 }],
      pendingRegistrationsCount: 0,
    }
    api.sendEvent('game_updated')
    await expect(page.locator('[data-test="player-1"]')).toContainText('Léa', AFTER_EVENT)
    await expect(pending).toHaveText('')
  })
})
