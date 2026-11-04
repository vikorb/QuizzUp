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
  GAME_STORAGE_KEY,
  lockOf,
  pressBuzzer,
  scoreOf,
  startShortGame,
  TICK_MARGIN_MS,
} from '../support/roomApp'

/**
 * Partie complète de blind test éclair sur l'écran de salle, en mode démo : lobby RGPD,
 * 3 manches × 3 questions, buzzers simulés au clavier, podium final. L'horloge de la page
 * est figée : le temps de jeu n'avance qu'à la demande, les paliers sont donc exacts.
 */
const PLAYERS = [
  { desk: 1 as const, name: 'Alice', email: 'alice@exemple.fr' },
  { desk: 2 as const, name: 'Bob' },
  { desk: 3 as const, name: 'Chloé' },
]
const NAMES: Record<Desk, string> = { 1: 'Alice', 2: 'Bob', 3: 'Chloé', 4: '' }

/** Écoute + fenêtre de buzz de chaque palier (1 + 3 s, 5 + 3 s, 20 + 3 s). */
const STAGE_TOTAL_MS = [4000, 8000, 23_000]

async function buzzAndAnswer(page: Page, desk: Desk, outcome: 'correct' | 'wrong'): Promise<void> {
  await pressBuzzer(page, desk, 0)
  await expect(page.locator('.blind__status--answering')).toContainText(`${NAMES[desk]} répond !`)
  const { correct, wrong } = await answerButtons(page)
  await pressBuzzer(page, desk, outcome === 'correct' ? correct : (wrong[0] ?? 0))
}

/** Laisse filer les paliers sans buzz jusqu'au palier voulu. */
async function skipToStage(page: Page, stage: number): Promise<void> {
  for (let index = 0; index < stage - 1; index += 1) {
    await advance(page, (STAGE_TOTAL_MS[index] ?? 0) + TICK_MARGIN_MS)
  }
  expect(await currentStage(page)).toBe(stage)
}

async function expectWinner(page: Page, desk: Desk, stage: number, points: number): Promise<void> {
  await expectScreen(page, 'reveal')
  await expect(page.locator('.reveal__title')).toContainText(
    `${NAMES[desk]} trouve au palier ${stage}`
  )
  await expect(page.locator('.reveal__points')).toHaveText(`+${points}`)
  await expect(page.locator('.reveal .answer--correct')).toHaveCount(1)
}

/** Révélation (5 s) → question suivante. */
async function nextQuestion(page: Page): Promise<void> {
  await advance(page, 5000)
  await expectScreen(page, 'blind')
  expect(await currentStage(page)).toBe(1)
}

async function expectScores(page: Page, scores: Record<string, number>): Promise<void> {
  for (const [name, score] of Object.entries(scores)) {
    await expect(scoreOf(page, name)).toHaveText(String(score))
  }
}

async function startRound(page: Page, position: number): Promise<void> {
  await expectScreen(page, 'intro')
  await expect(page.locator('.intro__round')).toHaveText(`Manche ${position} / 3`)
  await expect(page.locator('.intro__name')).toHaveText('Blind test éclair')
  await advance(page, 4000 + TICK_MARGIN_MS)
  await chooseFirstTheme(page)
  await expect(page.locator('.topbar')).toContainText(`Question 1 / 3`)
}

async function endRound(page: Page, position: number): Promise<void> {
  await advance(page, 5000)
  await expectScreen(page, 'summary')
  await expect(page.locator('.summary__title')).toHaveText(`Fin de la manche ${position}`)
  await advance(page, 8000)
}

test.describe('Écran de salle — partie complète', () => {
  test('lobby RGPD, 3 manches de blind test éclair au clavier et podium final', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await freezeClock(page)
    await enterDemo(page)
    await expect(page.locator('.topbar__badge')).toHaveText('Mode démo')

    // Lobby : un appui sur un buzzer fait briller son pupitre.
    await page.getByRole('button', { name: 'Lancer la salle' }).click()
    await expect(page.getByText('Inscription des joueurs')).toBeVisible()
    await pressBuzzer(page, 2, 3)
    await expect(page.locator('.desk--2 .desk__ping')).toHaveText('Buzzer OK')
    await advance(page, 1300)
    await expect(page.locator('.desk--2 .desk__ping')).toHaveCount(0)

    // Email sans consentement : refusé tant que la case n'est pas cochée.
    await page.locator('input[name="desk-1-name"]').fill('Alice')
    await page.locator('input[name="desk-1-email"]').fill('alice@exemple.fr')
    await page.getByRole('button', { name: 'Démarrer la partie' }).click()
    await expect(page.locator('.desk--1')).toContainText(
      'Coche la case de consentement, ou laisse l’email vide.'
    )
    await expect(page).toHaveURL(/\/lobby$/)
    await page.goto('/')
    await startShortGame(page, PLAYERS)

    // L'email est conservé pour l'envoi des résultats, mais jamais affiché à l'écran.
    await expect(page.locator('body')).not.toContainText('alice@exemple.fr')
    const saved = await page.evaluate((key) => localStorage.getItem(key), GAME_STORAGE_KEY)
    expect(saved).toContain('alice@exemple.fr')

    // ——— Manche 1 ———
    await startRound(page, 1)

    // Q1 — tout le monde joue en même temps : Bob se trompe et n'est bloqué que lui ;
    // Alice peut encore buzzer sur le même palier et trouve.
    await buzzAndAnswer(page, 2, 'wrong')
    await expect(lockOf(page, 'Bob')).toBeVisible()
    expect(await currentStage(page)).toBe(1)
    await pressBuzzer(page, 2, 0)
    await expect(page.locator('.blind__status--answering')).toHaveCount(0)
    await buzzAndAnswer(page, 1, 'correct')
    await expectWinner(page, 1, 1, 100)
    await expectScores(page, { Alice: 100, Bob: 0, Chloé: 0 })

    // Q2 — personne ne trouve au palier 1 : on passe au palier 2 (5 s), Chloé trouve.
    await nextQuestion(page)
    await advance(page, 1000)
    await expect(page.locator('.blind__status')).toHaveText('Buzzez !')
    await advance(page, 3000 + TICK_MARGIN_MS)
    expect(await currentStage(page)).toBe(2)
    await buzzAndAnswer(page, 3, 'correct')
    await expectWinner(page, 3, 2, 50)
    await expectScores(page, { Alice: 100, Bob: 0, Chloé: 50 })

    // Q3 — personne au bout du palier 3 : perdu pour tout le monde.
    await nextQuestion(page)
    await skipToStage(page, 3)
    await advance(page, STAGE_TOTAL_MS[2]! + TICK_MARGIN_MS)
    await expectScreen(page, 'reveal')
    await expect(page.locator('.reveal__title')).toHaveText('Personne n’a trouvé')
    await expectScores(page, { Alice: 100, Bob: 0, Chloé: 50 })
    await endRound(page, 1)

    // ——— Manche 2 ———
    await startRound(page, 2)
    await buzzAndAnswer(page, 2, 'correct')
    await expectWinner(page, 2, 1, 100)
    await nextQuestion(page)
    await buzzAndAnswer(page, 1, 'correct')
    await expectWinner(page, 1, 1, 100)
    await nextQuestion(page)
    await skipToStage(page, 3)
    await buzzAndAnswer(page, 2, 'correct')
    await expectWinner(page, 2, 3, 20)
    await expectScores(page, { Alice: 200, Bob: 120, Chloé: 50 })
    await endRound(page, 2)

    // ——— Manche 3 ———
    await startRound(page, 3)
    await buzzAndAnswer(page, 1, 'correct')
    await expectWinner(page, 1, 1, 100)
    await nextQuestion(page)
    await buzzAndAnswer(page, 3, 'correct')
    await expectWinner(page, 3, 1, 100)
    await nextQuestion(page)
    await skipToStage(page, 2)
    await buzzAndAnswer(page, 1, 'correct')
    await expectWinner(page, 1, 2, 50)
    await expectScores(page, { Alice: 350, Bob: 120, Chloé: 150 })

    // Bilan de la dernière manche puis podium final.
    await advance(page, 5000)
    await expect(page.locator('.summary__next')).toHaveText('Résultats finaux dans un instant…')
    await advance(page, 8000)
    await expectScreen(page, 'finished')
    await expect(page.locator('.finished__title')).toHaveText('Fin de la partie')
    await expect(page.locator('.finished__winner')).toHaveText('Alice remporte la partie !')

    const lines = page.locator('.finished .board__line')
    await expect(lines).toHaveCount(3)
    await expect(lines.nth(0)).toContainText('Alice')
    await expect(lines.nth(0)).toContainText('350 pts')
    await expect(lines.nth(1)).toContainText('Chloé')
    await expect(lines.nth(1)).toContainText('150 pts')
    await expect(lines.nth(2)).toContainText('Bob')
    await expect(lines.nth(2)).toContainText('120 pts')
    await expect(page.locator('.finished .board__rank')).toHaveText(['1', '2', '3'])

    // La sauvegarde (qui contient les emails) est effacée dès la fin de la partie.
    expect(await page.evaluate((key) => localStorage.getItem(key), GAME_STORAGE_KEY)).toBeNull()

    await page.getByRole('button', { name: 'Nouvelle partie' }).click()
    await expect(page).toHaveURL(/\/lobby$/)
  })

  test('arrêter la partie en cours demande confirmation et affiche le classement', async ({
    page,
  }) => {
    await freezeClock(page)
    await enterDemo(page)
    await startShortGame(page, PLAYERS.slice(0, 2))
    await startRound(page, 1)
    await buzzAndAnswer(page, 2, 'correct')
    await expectWinner(page, 2, 1, 100)

    await page.getByRole('button', { name: 'Arrêter la partie' }).click()
    await page.getByRole('button', { name: 'Confirmer' }).click()
    await expectScreen(page, 'finished')
    await expect(page.locator('.finished__title')).toHaveText('Partie arrêtée')
    await expect(page.locator('.finished .board__line').first()).toContainText('Bob')
    expect(await page.evaluate((key) => localStorage.getItem(key), GAME_STORAGE_KEY)).toBeNull()
  })
})
