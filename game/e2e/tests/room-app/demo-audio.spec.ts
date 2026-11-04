import { expect, type Page, test } from '@playwright/test'

import {
  answerButtons,
  chooseFirstTheme,
  currentStage,
  type Desk,
  enterDemo,
  expectScreen,
  pressBuzzer,
  startShortGame,
} from '../support/roomApp'
import { ROOM_APP_URL } from '../support/urls'
import { firstSoundAfter, heardBetween, installSoundProbe, now } from '../support/soundProbe'

/**
 * Son réel dans l'écran de salle, en mode démo (extraits synthétisés en Web Audio, libres de
 * droits) : l'extrait du palier joue pendant l'écoute, se tait pendant la fenêtre de buzz,
 * se coupe quand un joueur buzze, reprend après une erreur et s'arrête sur une bonne réponse.
 * L'horloge n'est pas figée ici : le son suit l'horloge audio réelle.
 */
/** Fondus, échantillonnage de la sonde et tick de 50 ms de la salle. */
const MARGIN_MS = 250
/**
 * Les sons d'interface (buzz, montée de palier, bonne réponse…) sortent sur les mêmes
 * haut-parleurs : on laisse passer leur durée (700 ms au plus) avant de vérifier le silence.
 */
const UI_SOUND_MS = 1000
/** Fenêtre de buzz après chaque écoute (moteur). */
const BUZZ_WINDOW_MS = 3000
/** Écoute du palier 1. */
const EXTRACT_1_MS = 1000

async function waitForStatus(page: Page, text: string): Promise<number> {
  await expect(page.locator('.blind__status')).toContainText(text, { timeout: 15_000 })
  return now(page)
}

async function buzz(page: Page, desk: Desk, name: string): Promise<number> {
  await pressBuzzer(page, desk, 0)
  await expect(page.locator('.blind__status--answering')).toContainText(`${name} répond !`)
  return now(page)
}

// Projet Playwright `audio` (mesures lancées seules) : on vise l'écran de salle.
test.use({ baseURL: ROOM_APP_URL, viewport: { width: 1600, height: 900 } })

test.describe('Écran de salle — son réel en mode démo', () => {
  test('l’extrait suit les paliers, se coupe au buzz et s’arrête sur une bonne réponse', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await installSoundProbe(page)
    await enterDemo(page)
    await startShortGame(page, [
      { desk: 1, name: 'Alice' },
      { desk: 2, name: 'Bob' },
    ])
    await expectScreen(page, 'intro')
    await chooseFirstTheme(page)

    // Palier 1 : l'extrait joue pendant l'écoute (1 s), puis se tait pendant la fenêtre de buzz.
    expect(await currentStage(page)).toBe(1)
    const stage1 = await now(page)
    const window1 = await waitForStatus(page, 'Buzzez !')
    expect(await heardBetween(page, stage1 - MARGIN_MS, window1)).toBe(true)
    // Silence pendant la fenêtre de buzz, repérée depuis le début réel du son (l'écran est
    // lu avec un léger retard). La montée au palier 2 joue ensuite un son d'interface.
    const soundStart = await firstSoundAfter(page, stage1 - MARGIN_MS)
    const windowStart = soundStart + EXTRACT_1_MS
    await expect.poll(() => currentStage(page), { timeout: 10_000 }).toBe(2)
    const stage2 = await now(page)
    expect(
      await heardBetween(page, windowStart + MARGIN_MS, windowStart + BUZZ_WINDOW_MS - MARGIN_MS)
    ).toBe(false)

    // Palier 2 : l'extrait joue ; Bob buzze, le son se coupe pendant qu'il répond.
    await page.waitForTimeout(1500)
    expect(await heardBetween(page, stage2, await now(page))).toBe(true)
    const buzzedAt = await buzz(page, 2, 'Bob')
    await page.waitForTimeout(UI_SOUND_MS + 1000)
    expect(await heardBetween(page, buzzedAt + UI_SOUND_MS, await now(page))).toBe(false)

    // Mauvaise réponse : l'extrait reprend pour la fin du palier.
    const { correct, wrong } = await answerButtons(page)
    await pressBuzzer(page, 2, wrong[0] ?? 0)
    const resumedAt = await waitForStatus(page, 'Écoute…')
    await page.waitForTimeout(1500)
    expect(await heardBetween(page, resumedAt + UI_SOUND_MS, await now(page))).toBe(true)

    // Alice trouve : le son s'arrête et ne reprend pas pendant la révélation.
    await buzz(page, 1, 'Alice')
    await pressBuzzer(page, 1, correct)
    await expectScreen(page, 'reveal')
    const revealAt = await now(page)
    await page.waitForTimeout(UI_SOUND_MS + 1500)
    expect(await heardBetween(page, revealAt + UI_SOUND_MS, await now(page))).toBe(false)
  })
})
