import { expect, test } from '@playwright/test'

import {
  audibleBetween,
  openAudioHarness,
  segments,
  segmentsBetween,
  waitForEvent,
} from '../support/audioHarness'

/**
 * Lecture audio réelle du blind test éclair dans Chromium : vrai moteur, vrai pont audio
 * de l'écran de salle et vrai lecteur Web Audio (`@quizzup/audio`). On mesure le son qui
 * sort réellement (analyseur branché sur la sortie) et on le compare aux paliers 1 s / 5 s / 20 s.
 */

/** Marge acceptée sur le début / la fin du son (fondus de 15 ms, échantillonnage 5 ms, ticks). */
const TOLERANCE_MS = 150

test.describe('Blind test éclair — audio réel', () => {
  test('le son démarre et s’arrête à chaque palier, se coupe au buzz et reprend après une erreur', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openAudioHarness(page)
    await page.evaluate(() => window.audioHarness.start())

    // Palier 1 : 1 s d'extrait, personne ne buzze.
    const stage1 = await waitForEvent(
      page,
      'blind_test_stage_started',
      (event) => event.payload.stage === 1
    )
    expect(stage1.payload.extractMs).toBe(1000)
    const stage2 = await waitForEvent(
      page,
      'blind_test_stage_started',
      (event) => event.payload.stage === 2
    )

    const stage1Sound = segmentsBetween(await segments(page), stage1.at, stage2.at)
    expect(stage1Sound).toHaveLength(1)
    expect(Math.abs(stage1Sound[0]!.start - stage1.at)).toBeLessThan(TOLERANCE_MS)
    expect(Math.abs(audibleBetween(stage1Sound, stage1.at, stage2.at) - 1000)).toBeLessThan(
      TOLERANCE_MS
    )
    // Personne n'a trouvé : le palier 2 commence après l'écoute (1 s) et la fenêtre de buzz (3 s).
    expect(stage2.at - stage1.at).toBeGreaterThanOrEqual(4000)

    // Palier 2 : Alice buzze au bout de 2 s → le son se coupe pendant qu'elle répond.
    await page.waitForFunction((at) => performance.now() >= at + 2000, stage2.at)
    await page.evaluate(() => window.audioHarness.press(1, 0))
    const buzz = await waitForEvent(page, 'blind_test_paused')
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => window.audioHarness.isAudible())).toBe(false)
    const lastBeforeAnswer = (await segments(page)).at(-1)!
    expect(lastBeforeAnswer.end).not.toBeNull()
    expect(Math.abs(lastBeforeAnswer.end! - buzz.at)).toBeLessThan(TOLERANCE_MS)

    // Mauvaise réponse : pas de pénalité, l'extrait reprend là où il s'était arrêté.
    const { wrong } = await page.evaluate(() => window.audioHarness.answerButtons())
    await page.evaluate((button) => window.audioHarness.press(1, button), wrong)
    const resumed = await waitForEvent(page, 'blind_test_stage_resumed')
    await expect.poll(() => page.evaluate(() => window.audioHarness.isAudible())).toBe(true)

    // Personne d'autre ne trouve : palier 3 après les 5 s d'écoute + 3 s de fenêtre.
    const stage3 = await waitForEvent(
      page,
      'blind_test_stage_started',
      (event) => event.payload.stage === 3
    )
    const stage2Sound = await segments(page)
    const heard = audibleBetween(stage2Sound, stage2.at, stage3.at)
    expect(Math.abs(heard - 5000)).toBeLessThan(2 * TOLERANCE_MS)
    expect(segmentsBetween(stage2Sound, resumed.at, stage3.at)).toHaveLength(1)

    // Palier 3 : 20 s d'écoute, personne ne trouve → perdu pour tout le monde, silence.
    const ended = await waitForEvent(page, 'question_ended', () => true, 40_000)
    expect(ended.payload.winnerIds).toEqual([])
    const stage3Sound = segmentsBetween(await segments(page), stage3.at, ended.at)
    expect(stage3Sound).toHaveLength(1)
    expect(Math.abs(stage3Sound[0]!.start - stage3.at)).toBeLessThan(TOLERANCE_MS)
    expect(Math.abs(audibleBetween(stage3Sound, stage3.at, ended.at) - 20_000)).toBeLessThan(
      2 * TOLERANCE_MS
    )
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.audioHarness.isAudible())).toBe(false)
  })

  test('une bonne réponse coupe l’extrait et termine la question au palier en cours', async ({
    page,
  }) => {
    await openAudioHarness(page)
    await page.evaluate(() => window.audioHarness.start())

    const stage1 = await waitForEvent(
      page,
      'blind_test_stage_started',
      (event) => event.payload.stage === 1
    )
    await page.waitForFunction((at) => performance.now() >= at + 500, stage1.at)
    await expect.poll(() => page.evaluate(() => window.audioHarness.isAudible())).toBe(true)

    // Bob buzze pendant l'écoute du palier 1, puis donne la bonne réponse.
    await page.evaluate(() => window.audioHarness.press(2, 3))
    await waitForEvent(page, 'blind_test_paused')
    const { correct } = await page.evaluate(() => window.audioHarness.answerButtons())
    await page.evaluate((button) => window.audioHarness.press(2, button), correct)

    const points = await waitForEvent(page, 'points_awarded')
    expect(points.payload).toMatchObject({ participantId: 2, points: 100 })
    const ended = await waitForEvent(page, 'question_ended')
    expect(ended.payload.winnerIds).toEqual([2])

    // Le son ne reprend jamais et aucun palier suivant ne démarre.
    await page.waitForTimeout(1500)
    const list = await segments(page)
    expect(list).toHaveLength(1)
    expect(list[0]!.end).not.toBeNull()
    expect(audibleBetween(list, stage1.at, ended.at + 1500)).toBeLessThan(600)
  })
})
