import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Page, TestInfo } from '@playwright/test'

/**
 * Captures d'écran des étapes d'un scénario, pour voir où en est le jeu sans lancer la
 * salle. Chaque capture est jointe au rapport Playwright ; si `E2E_CAPTURES_DIR` est
 * défini, elle est aussi écrite dans ce dossier (`<dossier>/<scénario>/<nn>-<étape>.png`).
 */
export function createCapturer(page: Page, testInfo: TestInfo, scenario: string) {
  let count = 0
  const root = process.env.E2E_CAPTURES_DIR

  return async function capture(step: string): Promise<void> {
    count += 1
    const name = `${String(count).padStart(2, '0')}-${step}.png`
    const body = await page.screenshot()
    await testInfo.attach(`${scenario}/${name}`, { body, contentType: 'image/png' })

    if (root) {
      const dir = path.join(root, scenario)
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, name), body)
    }
  }
}
