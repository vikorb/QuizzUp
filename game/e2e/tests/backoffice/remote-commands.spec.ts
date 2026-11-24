import { expect, test } from '@playwright/test'

import { type FakeLiveRoom, mockLiveGameApi } from '../support/fakeBackoffice'

/**
 * Commandes à distance vues du backoffice (US-LIVE-01) : depuis la fiche d'une partie en cours, le
 * personnel envoie une commande ; l'accusé et le nouvel état arrivent sur le flux du direct. Le
 * côté salle (elle applique et accuse) est dans `room-app/remote-commands.spec.ts`.
 */
const participant = (id: number, podium: number, displayName: string) => ({
  id,
  podium,
  displayName,
  email: null,
  hasEmail: false,
  consentAt: null,
  marketingConsent: false,
  secondPlayer: null,
  score: 0,
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
  state: 'running',
  startedAt: '2026-11-04T19:00:00.000Z',
  finishedAt: null,
  status: 1,
  createdAt: '2026-11-04T18:00:00.000Z',
  updatedAt: null,
  participants: [participant(1, 1, 'Alice'), participant(2, 2, 'Bob')],
}

const roomPlaying = (paused: boolean): FakeLiveRoom => ({
  roomId: 1,
  presence: 'in_game',
  controllable: true,
  lastSeenAt: '2026-11-04T19:05:00.000Z',
  status: {
    screen: 'play',
    gameId: 42,
    phase: 'question',
    round: 1,
    questionIndex: 0,
    miniGame: null,
    paused,
    scores: [],
    audioReady: true,
  },
})

test.describe('Fiche d’une partie — commandes à distance', () => {
  test('pause : commande envoyée à la salle, accusée, puis partie affichée en pause', async ({
    page,
  }) => {
    const api = await mockLiveGameApi(page, { game: GAME, room: roomPlaying(false) })
    const paused = page.locator('[data-test="game-live-paused"]')
    const toggle = page.locator('[data-test="game-live-toggle-pause"]')
    const feedback = page.locator('[data-test="game-live-command-feedback"]')

    await page.goto('/games/42')
    await expect(page.locator('[data-test="game-live-presence"]')).toContainText('En partie')
    await expect(paused).toHaveCount(0)
    await expect(toggle).toHaveText('Pause')

    await toggle.click()

    // Le corps de la requête vise la salle de la partie et porte l'identifiant à accuser.
    await expect.poll(() => api.commands.length).toBe(1)
    const { path, body } = api.commands[0] ?? { path: null, body: null }
    expect(path).toBe('/companies/3/rooms/1/commands')
    expect(body).toEqual({ commandId: expect.stringMatching(/^[0-9a-f-]{36}$/), command: 'pause' })
    await expect(feedback).toHaveText('Commande envoyée, en attente de la salle…')

    // L'accusé seul ne met pas la partie en pause : l'état affiché est celui que la salle publie.
    await api.push('command_result', {
      commandId: body?.commandId,
      roomId: 1,
      command: 'pause',
      result: 'applied',
    })
    await expect(feedback).toHaveText('Commande appliquée par la salle.')
    await expect(paused).toHaveCount(0)

    await api.push('room_status', roomPlaying(true))
    await expect(paused).toBeVisible()
    await expect(toggle).toHaveText('Reprendre')
  })

  test('reprise : la commande resume est envoyée, la pause disparaît à l’état suivant', async ({
    page,
  }) => {
    const api = await mockLiveGameApi(page, { game: GAME, room: roomPlaying(true) })
    const paused = page.locator('[data-test="game-live-paused"]')
    const toggle = page.locator('[data-test="game-live-toggle-pause"]')

    await page.goto('/games/42')
    await expect(paused).toBeVisible()
    await expect(toggle).toHaveText('Reprendre')

    await toggle.click()

    await expect.poll(() => api.commands.length).toBe(1)
    const body = api.commands[0]?.body
    expect(body?.command).toBe('resume')
    await api.push('command_result', {
      commandId: body?.commandId,
      roomId: 1,
      command: 'resume',
      result: 'applied',
    })
    await expect(paused).toBeVisible()

    await api.push('room_status', roomPlaying(false))
    await expect(paused).toHaveCount(0)
    await expect(toggle).toHaveText('Pause')
  })

  test('salle injoignable : message traduit du code d’erreur, état inchangé', async ({ page }) => {
    const api = await mockLiveGameApi(page, {
      game: GAME,
      room: roomPlaying(false),
      commandReply: { status: 409, body: { error: 'room_not_controllable' } },
    })
    const feedback = page.locator('[data-test="game-live-command-feedback"]')

    await page.goto('/games/42')
    await expect(page.locator('[data-test="game-live-toggle-pause"]')).toHaveText('Pause')

    await page.locator('[data-test="game-live-toggle-pause"]').click()

    await expect(feedback).toHaveText(
      "La salle est hors ligne ou son écran n'est pas connecté : la commande n'a pas été envoyée."
    )
    await expect(feedback).not.toContainText('room_not_controllable')
    expect(api.commands).toHaveLength(1)
    await expect(page.locator('[data-test="game-live-paused"]')).toHaveCount(0)
    await expect(page.locator('[data-test="game-live-toggle-pause"]')).toHaveText('Pause')
  })
})
