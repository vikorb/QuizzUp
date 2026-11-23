import { expect, type Page, test } from '@playwright/test'

import {
  advance,
  answerButtons,
  chooseFirstTheme,
  chooserDesk,
  type Desk,
  enterDemo,
  expectScreen,
  freezeClock,
  pressBuzzer,
  TICK_MARGIN_MS,
} from '../tests/support/roomApp'
import { saveCapture } from './encode'

/**
 * Captures réelles de l'écran de salle en mode démo pour le site vitrine : lobby avec
 * pupitres, question avec buzzers, mini-jeu, podium final, plan de salle de l'écran Matériel.
 * Même pilotage que les tests de bout en bout (clavier de simulation, horloge figée) : rien
 * n'est monté à la main, chaque image est ce que la salle affiche.
 */
const PLAYERS: { desk: Desk; name: string }[] = [
  { desk: 1, name: 'Alice' },
  { desk: 2, name: 'Bob' },
  { desk: 3, name: 'Chloé' },
  { desk: 4, name: 'David' },
]

/** Écoute + fenêtre de buzz de chaque palier du blind test (1 + 3 s, 5 + 3 s, 20 + 3 s). */
const STAGE_TOTAL_MS = [4000, 8000, 23_000]

/** Mini-jeu montré par la vitrine (code de `@quizzup/shared`). */
const SHOWN_MINI_GAME = process.env.CAPTURES_MINI_GAME ?? 'double_or_nothing'

/** Qui trouve, à quel palier, aux 9 questions de la partie (3 manches × 3). */
const WINS: { desk: Desk; stage: number }[][] = [
  [
    { desk: 1, stage: 1 },
    { desk: 3, stage: 2 },
    { desk: 1, stage: 1 },
  ],
  [
    { desk: 2, stage: 1 },
    { desk: 4, stage: 1 },
    { desk: 1, stage: 2 },
  ],
  [
    { desk: 3, stage: 1 },
    { desk: 2, stage: 1 },
    { desk: 1, stage: 1 },
  ],
]

/** Entre dans le lobby ; `ping` fait buzzer ce pupitre avant la saisie (un champ capte les touches). */
async function registerPlayers(page: Page, ping?: Desk): Promise<void> {
  await page.getByRole('button', { name: 'Lancer la salle' }).click()
  await expect(page.getByText('Inscription des joueurs')).toBeVisible()
  if (ping) {
    await pressBuzzer(page, ping, 3)
    await expect(page.locator(`.desk--${ping} .desk__ping`)).toHaveText('Buzzer OK')
  }
  for (const player of PLAYERS) {
    await page.locator(`input[name="desk-${player.desk}-name"]`).fill(player.name)
  }
}

async function startShortGame(page: Page): Promise<void> {
  await page.getByRole('radio', { name: /Partie courte · 3 manches × 3 questions/ }).check()
  await page.getByRole('button', { name: 'Démarrer la partie' }).click()
  await expect(page).toHaveURL(/\/play$/)
  await expectScreen(page, 'intro')
  await advance(page, 4000 + TICK_MARGIN_MS)
}

/** Laisse finir les animations CSS (elles suivent l'horloge réelle, pas celle de la page). */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1500))
}

async function answerCorrectly(page: Page, desk: Desk): Promise<void> {
  const { correct } = await answerButtons(page)
  await pressBuzzer(page, desk, correct)
}

test.describe('Captures pour la vitrine', () => {
  test('lobby, question, podium final', async ({ page, browser }) => {
    await freezeClock(page)
    await enterDemo(page)
    // Un appui sur un buzzer fait briller son pupitre.
    await registerPlayers(page, 2)
    await settle()
    await saveCapture(browser, 'lobby', await page.screenshot())

    await advance(page, 1300)
    await startShortGame(page)

    for (const [round, wins] of WINS.entries()) {
      if (round > 0) {
        await expectScreen(page, 'intro')
        await advance(page, 4000 + TICK_MARGIN_MS)
      }
      await chooseFirstTheme(page)

      for (const [index, win] of wins.entries()) {
        for (let stage = 1; stage < win.stage; stage += 1) {
          await advance(page, (STAGE_TOTAL_MS[stage - 1] ?? 0) + TICK_MARGIN_MS)
        }
        await pressBuzzer(page, win.desk, 0)
        await expect(page.locator('.blind__status--answering')).toBeVisible()
        if (round === 0 && index === 0) {
          await settle()
          await saveCapture(browser, 'question', await page.screenshot())
        }
        await answerCorrectly(page, win.desk)
        await expectScreen(page, 'reveal')
        await advance(page, 5000 + TICK_MARGIN_MS)
      }
      // Bilan de manche, puis manche suivante ou podium.
      await advance(page, 8000 + TICK_MARGIN_MS)
    }

    await expectScreen(page, 'finished')
    await expect(page.locator('.finished__winner')).toHaveText('Alice remporte la partie !')
    await expect(page.locator('.finished .board__line')).toHaveCount(PLAYERS.length)
    await settle()
    await saveCapture(browser, 'podium', await page.screenshot())
  })

  test('un mini-jeu', async ({ page, browser }) => {
    await freezeClock(page)
    await enterDemo(page, { miniGames: [SHOWN_MINI_GAME] })
    await registerPlayers(page)
    await startShortGame(page)

    await expectScreen(page, 'choice')
    await pressBuzzer(page, await chooserDesk(page), 0)
    // Premier écran de question du mini-jeu (mise, réponses, buzz…).
    await expect(page.locator('.game__stage > :not(.choice)').first()).toBeVisible()
    await settle()
    await saveCapture(browser, 'mini-jeu', await page.screenshot())
  })

  test('plan de salle de l’écran Matériel', async ({ page, browser }) => {
    await enterDemo(page)
    await page.locator('[data-test="open-hardware"]').click()
    await expect(page).toHaveURL(/\/hardware$/)

    // Un projecteur par pupitre et une machine à fumée, comme dans une salle équipée.
    await page.locator('[data-test="tab-advanced"]').click()
    const editor = page.locator('[data-test="config-json"]')
    const config = JSON.parse(await editor.inputValue()) as {
      lighting: { fixtures: unknown[] }
    }
    config.lighting.fixtures = [
      ...PLAYERS.map((player, index) => ({
        id: `par-${player.desk}`,
        name: `PAR pupitre ${player.desk}`,
        profileId: 'par-rgb',
        address: 1 + index * 3,
        desk: player.desk,
      })),
      { id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 20 },
    ]
    await editor.fill(JSON.stringify(config, null, 2))
    await page.locator('[data-test="config-save"]').click()
    await expect(page.locator('.hw-ok')).toBeVisible()

    await page.locator('[data-test="tab-plan"]').click()
    await expect(page.locator('[data-test="room-plan"]')).toBeVisible()
    await settle()
    await saveCapture(browser, 'plan-de-salle', await page.screenshot())
  })
})
