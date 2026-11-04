import { expect, type Page, test } from '@playwright/test'

/**
 * Lumières en simulation DMX : les vrais buzzers clavier et le vrai moteur pilotent le
 * contrôleur de `@quizzup/hardware`, sur la sortie simulée. On lit les trames DMX envoyées.
 */
type Rgb = [number, number, number]

async function lastEvent(page: Page, type: string) {
  return page.evaluate(
    (name) => window.dmxHarness.events().findLast((event) => event.type === name) ?? null,
    type
  )
}

async function waitForEvent(page: Page, type: string, count = 1): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (name) => window.dmxHarness.events().filter((event) => event.type === name).length,
          type
        ),
      { timeout: 15_000 }
    )
    .toBeGreaterThanOrEqual(count)
}

function parColor(page: Page, desk: 1 | 2 | 3 | 4, universe = 0): Promise<Rgb> {
  return page.evaluate(([value, number]) => window.dmxHarness.parColor(value, number), [
    desk,
    universe,
  ] as const)
}

const SIMULATION_KEYS = {
  1: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  2: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
}

async function press(page: Page, desk: 1 | 2, button: number): Promise<void> {
  await page.keyboard.press(SIMULATION_KEYS[desk][button] ?? 'Digit1')
}

test.describe('Lumières — simulation DMX', () => {
  test('les scènes suivent la partie, l’arrêt d’urgence met tout au noir, la fumée reste coupée', async ({
    page,
  }) => {
    await page.goto('/dmx.html')
    await page.getByRole('button', { name: 'Lancer la salle' }).click()
    await expect.poll(() => page.evaluate(() => window.dmxHarness.started())).toBe(true)
    expect(await page.evaluate(() => window.dmxHarness.lightingState())).toMatchObject({
      running: true,
      simulation: true,
      emergency: false,
    })

    // La boucle DMX tourne (~30 trames par seconde) même sans partie.
    const before = await page.evaluate(() => window.dmxHarness.framesSent())
    await page.waitForTimeout(1000)
    expect((await page.evaluate(() => window.dmxHarness.framesSent())) - before).toBeGreaterThan(15)

    await page.evaluate(() => window.dmxHarness.startGame())
    await waitForEvent(page, 'blind_test_stage_started')

    // Bob (pupitre 2) buzze : son PAR passe à la couleur du pupitre, les autres baissent.
    await press(page, 2, 0)
    await waitForEvent(page, 'buzzer_pressed')
    expect((await lastEvent(page, 'buzzer_pressed'))?.payload.participantId).toBe(2)
    await expect.poll(() => page.evaluate(() => window.dmxHarness.scene())).toBe('buzz')
    const desk2Color = await page.evaluate(() => window.dmxHarness.deskColor(2))
    await expect.poll(() => parColor(page, 2)).toEqual(desk2Color)
    expect(Math.max(...(await parColor(page, 1)))).toBeLessThan(40)
    // Univers 1 : le second PAR du pupitre 2 (même adresse 1 que le PAR du pupitre 1 sur
    // l'univers 0) prend la couleur du pupitre sans toucher à l'univers 0.
    await expect.poll(() => parColor(page, 1, 1)).toEqual(desk2Color)

    // Bonne réponse de Bob : scène « bonne réponse ».
    const correct = await page.evaluate(() => window.dmxHarness.correctButton())
    await press(page, 2, correct)
    await waitForEvent(page, 'answer_correct')
    await expect.poll(() => page.evaluate(() => window.dmxHarness.scene())).toBe('answer-correct')

    // Question 2 : Alice se trompe → scène « mauvaise réponse ».
    await waitForEvent(page, 'question_started', 2)
    await press(page, 1, 0)
    await waitForEvent(page, 'buzzer_pressed', 2)
    const correct2 = await page.evaluate(() => window.dmxHarness.correctButton())
    await press(page, 1, (correct2 + 1) % 4)
    await waitForEvent(page, 'answer_wrong')
    await expect.poll(() => page.evaluate(() => window.dmxHarness.scene())).toBe('answer-wrong')

    // Arrêt d'urgence : noir complet, et un buzz ne rallume rien.
    await page.evaluate(() => window.dmxHarness.emergencyStop())
    await expect.poll(() => page.evaluate(() => window.dmxHarness.frameMax())).toBe(0)
    expect((await page.evaluate(() => window.dmxHarness.lightingState())).emergency).toBe(true)
    await expect.poll(() => page.evaluate(() => window.dmxHarness.frameMax(1))).toBe(0)
    await press(page, 2, 0)
    await waitForEvent(page, 'buzzer_pressed', 3)
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => window.dmxHarness.frameMax())).toBe(0)

    // Réarmement : les lumières reprennent avec l'événement suivant.
    await page.evaluate(() => window.dmxHarness.resetEmergency())
    await expect.poll(() => page.evaluate(() => window.dmxHarness.scene())).toBe('idle')
    const correct3 = await page.evaluate(() => window.dmxHarness.correctButton())
    await press(page, 2, correct3)
    await waitForEvent(page, 'answer_correct', 2)
    await expect.poll(() => page.evaluate(() => window.dmxHarness.scene())).toBe('answer-correct')

    // Fin de partie : scène de victoire ; fumée jamais déclenchée (non armée par défaut).
    await waitForEvent(page, 'game_ended')
    await expect.poll(() => page.evaluate(() => window.dmxHarness.scene())).toBe('victory')
    // L'étape fumée de la victoire est refusée (activée mais non armée) : rien n'est envoyé.
    await expect
      .poll(() => page.evaluate(() => window.dmxHarness.smokeRefusals()))
      .toEqual(['not_armed'])
    expect(await page.evaluate(() => window.dmxHarness.smokeMax())).toBe(0)
  })
})
