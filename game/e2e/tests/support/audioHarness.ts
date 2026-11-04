import { expect, type Page } from '@playwright/test'

import { createFreeExtractWav } from './freeExtract'

export type LoggedEvent = { type: string; at: number; payload: Record<string, unknown> }
export type SoundSegment = { start: number; end: number | null }

const EXTRACT_PATH = '/media/extrait-libre.wav'

/** Ouvre le banc audio, sert l'extrait libre de droits et « lance la salle » (déblocage du son). */
export async function openAudioHarness(page: Page): Promise<void> {
  const wav = createFreeExtractWav({ durationMs: 32_000, silentMs: 2000 })
  await page.route(`**${EXTRACT_PATH}`, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav })
  )

  await page.goto('/audio.html')
  await page.getByRole('button', { name: 'Lancer la salle' }).click()

  await expect
    .poll(() => page.evaluate(() => window.audioHarness.preload()))
    .toEqual({ loaded: [EXTRACT_PATH], failed: [] })
  expect(await page.evaluate(() => window.audioHarness.contextState())).toBe('running')
}

export function events(page: Page): Promise<LoggedEvent[]> {
  return page.evaluate(() => window.audioHarness.events())
}

export function segments(page: Page): Promise<SoundSegment[]> {
  return page.evaluate(() => window.audioHarness.segments())
}

/** Attend un événement du moteur (le n-ième de ce type correspondant au filtre). */
export async function waitForEvent(
  page: Page,
  type: string,
  match: (event: LoggedEvent) => boolean = () => true,
  timeout = 30_000
): Promise<LoggedEvent> {
  await expect
    .poll(async () => (await events(page)).some((event) => event.type === type && match(event)), {
      timeout,
      intervals: [20],
    })
    .toBe(true)
  const found = (await events(page)).find((event) => event.type === type && match(event))
  if (!found) {
    throw new Error(`Événement ${type} introuvable`)
  }
  return found
}

/** Durée audible cumulée (ms) entre deux instants, d'après le moniteur de sortie. */
export function audibleBetween(list: SoundSegment[], from: number, to: number): number {
  return list.reduce((total, segment) => {
    const start = Math.max(segment.start, from)
    const end = Math.min(segment.end ?? to, to)
    return end > start ? total + (end - start) : total
  }, 0)
}

export function segmentsBetween(list: SoundSegment[], from: number, to: number): SoundSegment[] {
  return list.filter((segment) => segment.start < to && (segment.end ?? to) > from)
}
