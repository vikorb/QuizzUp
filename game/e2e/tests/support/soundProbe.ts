import type { Page } from '@playwright/test'

/**
 * Sonde du son réellement envoyé aux haut-parleurs par l'écran de salle : injectée avant
 * le chargement de la page, elle double chaque connexion vers `context.destination` vers
 * un analyseur et note les instants (`performance.now()`) où un son est audible.
 * Même principe que `harness/src/soundMonitor.ts`, sans rien modifier à l'application.
 */
export type SoundSample = { at: number; audible: boolean }

declare global {
  interface Window {
    soundProbe: { samples: () => SoundSample[]; isAudible: () => boolean }
  }
}

export async function installSoundProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const AUDIBLE_RMS = 0.01
    const analysers = new Map<BaseAudioContext, AnalyserNode>()
    const changes: { at: number; audible: boolean }[] = []
    const nativeConnect = AudioNode.prototype.connect as (
      this: AudioNode,
      destination: AudioNode | AudioParam,
      output?: number,
      input?: number
    ) => AudioNode | undefined

    AudioNode.prototype.connect = function connect(
      this: AudioNode,
      destination: AudioNode | AudioParam,
      output?: number,
      input?: number
    ) {
      if (destination === this.context.destination) {
        let analyser = analysers.get(this.context)
        if (!analyser) {
          analyser = this.context.createAnalyser()
          analyser.fftSize = 256
          analysers.set(this.context, analyser)
        }
        nativeConnect.call(this, analyser)
      }
      return nativeConnect.call(this, destination, output, input)
    } as typeof AudioNode.prototype.connect

    let audible = false
    const buffer = new Float32Array(256)
    setInterval(() => {
      let level = 0
      for (const analyser of analysers.values()) {
        analyser.getFloatTimeDomainData(buffer)
        let sum = 0
        for (const sample of buffer) {
          sum += sample * sample
        }
        level = Math.max(level, Math.sqrt(sum / buffer.length))
      }
      const next = level >= AUDIBLE_RMS
      if (next !== audible) {
        audible = next
        changes.push({ at: performance.now(), audible })
      }
    }, 5)

    window.soundProbe = {
      samples: () => changes.map((change) => ({ ...change })),
      isAudible: () => audible,
    }
  })
}

export function now(page: Page): Promise<number> {
  return page.evaluate(() => performance.now())
}

/** Le son a-t-il été audible à un moment entre `from` et `to` ? */
export async function heardBetween(page: Page, from: number, to: number): Promise<boolean> {
  const samples = await page.evaluate(() => window.soundProbe.samples())
  // État au début de la plage : celui du dernier changement avant `from`.
  const before = samples.filter((sample) => sample.at < from).at(-1)
  if (before?.audible) {
    return true
  }
  return samples.some((sample) => sample.audible && sample.at >= from && sample.at <= to)
}

/** Dernier instant où le son s'est tu avant `before`. */
export async function lastSilenceBefore(page: Page, before: number): Promise<number> {
  const samples = await page.evaluate(() => window.soundProbe.samples())
  const found = samples.filter((sample) => !sample.audible && sample.at <= before).at(-1)
  if (!found) {
    throw new Error('Aucune fin de son entendue')
  }
  return found.at
}
