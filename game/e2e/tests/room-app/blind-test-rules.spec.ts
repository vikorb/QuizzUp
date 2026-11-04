import { expect, type Page, test } from '@playwright/test'

import {
  advance,
  answerButtons,
  chooseFirstTheme,
  currentStage,
  type Desk,
  enterDemo,
  expectScreen,
  freezeClock,
  lockOf,
  pressBuzzer,
  scoreOf,
  startShortGame,
  TICK_MARGIN_MS,
} from '../support/roomApp'

/**
 * Règles du blind test éclair validées par Enzo : tout le monde joue en même temps ;
 * une erreur ne bloque que pour le palier en cours ; on ne passe au palier suivant que si
 * personne n'a trouvé (tout le monde s'est trompé, ou la fenêtre de buzz est écoulée).
 */
const PLAYERS = [
  { desk: 1 as const, name: 'Alice' },
  { desk: 2 as const, name: 'Bob' },
]
const NAMES: Record<Desk, string> = { 1: 'Alice', 2: 'Bob', 3: '', 4: '' }

async function buzzAndAnswer(page: Page, desk: Desk, outcome: 'correct' | 'wrong'): Promise<void> {
  await pressBuzzer(page, desk, 0)
  await expect(page.locator('.blind__status--answering')).toContainText(`${NAMES[desk]} répond !`)
  const { correct, wrong } = await answerButtons(page)
  await pressBuzzer(page, desk, outcome === 'correct' ? correct : (wrong[0] ?? 0))
}

async function openFirstQuestion(page: Page): Promise<void> {
  await freezeClock(page)
  await enterDemo(page)
  await startShortGame(page, PLAYERS)
  await expectScreen(page, 'intro')
  await advance(page, 4000 + TICK_MARGIN_MS)
  await chooseFirstTheme(page)
  expect(await currentStage(page)).toBe(1)
}

test.describe('Blind test éclair — règles des paliers', () => {
  test('une erreur ne bloque que pour le palier en cours', async ({ page }) => {
    await openFirstQuestion(page)

    await buzzAndAnswer(page, 2, 'wrong')
    await expect(lockOf(page, 'Bob')).toBeVisible()

    // Alice ne buzze pas : palier 2 au bout de l'écoute (1 s) + la fenêtre de buzz (3 s).
    await advance(page, 4000 + TICK_MARGIN_MS)
    expect(await currentStage(page)).toBe(2)
    await expect(lockOf(page, 'Bob')).toHaveCount(0)

    // Bob peut de nouveau buzzer au palier 2, et trouve.
    await buzzAndAnswer(page, 2, 'correct')
    await expectScreen(page, 'reveal')
    await expect(page.locator('.reveal__title')).toContainText('Bob trouve au palier 2')
    await expect(scoreOf(page, 'Bob')).toHaveText('50')
  })

  test('si tout le monde se trompe, on passe aussitôt au palier suivant', async ({ page }) => {
    await openFirstQuestion(page)

    await buzzAndAnswer(page, 1, 'wrong')
    await buzzAndAnswer(page, 2, 'wrong')

    // Personne n'a trouvé : palier 2 tout de suite, sans attendre la fin de la fenêtre.
    await expectScreen(page, 'blind')
    expect(await currentStage(page)).toBe(2)
    await expect(page.locator('.score__locked')).toHaveCount(0)

    await buzzAndAnswer(page, 1, 'correct')
    await expect(page.locator('.reveal__title')).toContainText('Alice trouve au palier 2')
    await expect(scoreOf(page, 'Alice')).toHaveText('50')
    await expect(scoreOf(page, 'Bob')).toHaveText('0')
  })
})
