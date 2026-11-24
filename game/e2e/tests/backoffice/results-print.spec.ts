import { expect, test } from '@playwright/test'

import { mockResultsApi } from '../support/fakeBackoffice'

/**
 * Feuille de résultats imprimable d'une partie terminée (`/games/:gameId/results`). Le test ne
 * lance pas l'impression du navigateur : il bascule le média en `print` (`emulateMedia`), qui est
 * ce que l'aperçu avant impression applique, et lit ce qui reste visible.
 */
const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1"/><rect x="1" y="1" width="1" height="1"/></svg>'

const participant = (id: number, podium: number, displayName: string, score: number) => ({
  id,
  podium,
  displayName,
  email: null,
  hasEmail: false,
  consentAt: null,
  marketingConsent: false,
  secondPlayer: null,
  score,
})

const GAME = {
  id: 42,
  companyId: 3,
  roomId: 1,
  roomName: 'Salle 1',
  adminId: 1,
  roundsCount: 3,
  questionsPerRound: 3,
  seed: 7,
  state: 'finished',
  startedAt: '2026-11-04T19:00:00.000Z',
  finishedAt: '2026-11-04T19:30:00.000Z',
  status: 1,
  createdAt: '2026-11-04T18:00:00.000Z',
  updatedAt: null,
  participants: [participant(1, 1, 'Alice', 120), participant(2, 2, 'Bob', 80)],
}

const voucher = (id: number, state: string, label: string, code: string) => ({
  id,
  gameId: 42,
  participantId: 1,
  podium: 1,
  displayName: 'Alice',
  secondDisplayName: null,
  code,
  label,
  state,
  expiresAt: '2027-02-04T00:00:00.000Z',
  redeemedAt: null,
  redeemedBy: null,
  createdAt: '2026-11-04T19:31:00.000Z',
  url: `https://example.test/bon/#${code}`,
  qrSvg: QR_SVG,
})

test.describe('Feuille de résultats — impression', () => {
  test.beforeEach(async ({ page }) => {
    await mockResultsApi(page, {
      game: GAME,
      vouchers: [
        voucher(1, 'valid', 'Une partie offerte', 'K7QM-4XD9'),
        voucher(2, 'redeemed', 'Un bon déjà utilisé', 'R3TW-9BZ2'),
      ],
    })
    // `window.print` ouvrirait la fenêtre d'impression du navigateur : on compte les appels.
    await page.addInitScript(() => {
      const counter = { calls: 0 }
      Object.defineProperty(window, '__printCalls', { value: counter })
      window.print = () => {
        counter.calls += 1
      }
    })
    await page.goto('/games/42/results')
    await expect(page.locator('[data-test="results-row"]')).toHaveCount(2)
  })

  test('à l’écran : barre d’actions visible, le bouton lance l’impression', async ({ page }) => {
    await expect(page.locator('[data-test="results-back"]')).toBeVisible()

    await page.locator('[data-test="results-print"]').click()

    expect(
      await page.evaluate(
        () => (window as never as { __printCalls: { calls: number } }).__printCalls.calls
      )
    ).toBe(1)
  })

  test('en média print : la feuille reste, les boutons disparaissent, un bon valable figure', async ({
    page,
  }) => {
    await page.emulateMedia({ media: 'print' })

    // Contenu imprimable.
    await expect(page.getByRole('heading', { name: 'Feuille de résultats' })).toBeVisible()
    await expect(page.locator('[data-test="results-company"]')).toHaveText('Centre Démo')
    await expect(page.locator('[data-test="results-room"]')).toHaveText('Salle 1')
    const rows = page.locator('[data-test="results-row"]')
    await expect(rows.nth(0)).toContainText('Alice')
    await expect(rows.nth(0).locator('[data-test="results-score"]')).toHaveText('120')
    await expect(rows.nth(1)).toContainText('Bob')

    // Navigation et boutons masqués.
    await expect(page.locator('[data-test="results-back"]')).toBeHidden()
    await expect(page.locator('[data-test="results-print"]')).toBeHidden()

    // Le bon encore valable est sur la feuille, avec son QR et son code ; le bon utilisé n'y est pas.
    const vouchers = page.locator('[data-test="results-voucher"]')
    await expect(vouchers).toHaveCount(1)
    await expect(vouchers.locator('[data-test="results-voucher-label"]')).toHaveText(
      'Une partie offerte'
    )
    await expect(vouchers.locator('[data-test="results-voucher-code"]')).toHaveText('K7QM-4XD9')
    const qr = vouchers.locator('[data-test="results-voucher-qr"]')
    await expect(qr).toBeVisible()
    await expect
      .poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
    await expect(page.getByText('R3TW-9BZ2')).toHaveCount(0)
  })
})
