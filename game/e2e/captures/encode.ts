import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Browser } from '@playwright/test'

/** Largeurs des variantes WebP (la plus grande est la capture d'origine) et du repli JPEG. */
export const WEBP_WIDTHS = [640, 1280, 1920] as const
export const JPEG_WIDTH = 1280

/** Dossier d'arrivée : celui de la vitrine, ou `CAPTURES_OUT`. */
export const OUT_DIR = path.resolve(
  process.env.CAPTURES_OUT ?? path.join(import.meta.dirname, '../../../vitrine/public/captures')
)

/**
 * Écrit `<nom>-<largeur>.webp` et `<nom>-<largeur>.jpg` à partir d'une capture PNG. Le
 * redimensionnement et l'encodage sont faits par Chromium (canvas), déjà présent pour
 * Playwright : aucune dépendance de plus.
 */
export async function saveCapture(browser: Browser, name: string, png: Buffer): Promise<void> {
  const page = await browser.newPage()
  try {
    const files = await page.evaluate(
      async ({ base64, webpWidths, jpegWidth }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()

        const encode = (width: number, type: string, quality: number): string => {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = Math.round((image.height * width) / image.width)
          const context = canvas.getContext('2d')
          if (!context) {
            throw new Error('Canvas 2D indisponible')
          }
          context.imageSmoothingQuality = 'high'
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          return canvas.toDataURL(type, quality).split(',')[1] ?? ''
        }

        const out: Record<string, string> = {}
        for (const width of webpWidths) {
          out[`${width}.webp`] = encode(width, 'image/webp', 0.8)
        }
        out[`${jpegWidth}.jpg`] = encode(jpegWidth, 'image/jpeg', 0.8)
        return out
      },
      { base64: png.toString('base64'), webpWidths: [...WEBP_WIDTHS], jpegWidth: JPEG_WIDTH }
    )

    await mkdir(OUT_DIR, { recursive: true })
    for (const [suffix, base64] of Object.entries(files)) {
      await writeFile(path.join(OUT_DIR, `${name}-${suffix}`), Buffer.from(base64, 'base64'))
    }
  } finally {
    await page.close()
  }
}
