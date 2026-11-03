/**
 * Capacités « kiosque » du navigateur (plein écran, écran allumé, capture des
 * touches système). Chaque appel est tolérant : un navigateur qui ne sait pas
 * faire renvoie `false` au lieu de casser le lancement de la salle.
 */

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void }
type WakeLockSentinelLike = { release: () => Promise<void> }
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

export function isFullscreen(doc: Document = document): boolean {
  return Boolean(doc.fullscreenElement)
}

export async function enterFullscreen(doc: Document = document): Promise<boolean> {
  if (isFullscreen(doc)) {
    return true
  }

  try {
    await doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    return isFullscreen(doc)
  } catch {
    return false
  }
}

export async function exitFullscreen(doc: Document = document): Promise<void> {
  if (!isFullscreen(doc)) {
    return
  }

  try {
    await doc.exitFullscreen?.()
  } catch {
    // Déjà sorti du plein écran.
  }
}

/** Capte Échap et les raccourcis en plein écran (Chrome / Edge uniquement). */
export async function lockSystemKeys(nav: Navigator = navigator): Promise<boolean> {
  const keyboard = (nav as Navigator & { keyboard?: KeyboardLock }).keyboard

  if (!keyboard?.lock) {
    return false
  }

  try {
    await keyboard.lock()
    return true
  } catch {
    return false
  }
}

let wakeLock: WakeLockSentinelLike | null = null

/** Empêche la mise en veille de l'écran pendant la partie. */
export async function keepScreenAwake(nav: Navigator = navigator): Promise<boolean> {
  const api = (nav as Navigator & { wakeLock?: WakeLockLike }).wakeLock

  if (!api) {
    return false
  }

  try {
    wakeLock = await api.request('screen')
    return true
  } catch {
    return false
  }
}

export async function releaseScreenAwake(): Promise<void> {
  const current = wakeLock
  wakeLock = null
  await current?.release().catch(() => undefined)
}
