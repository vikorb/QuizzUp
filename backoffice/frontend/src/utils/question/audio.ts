import {
  QUESTION_AUDIO_DEFAULT_MAX_BYTES,
  QUESTION_AUDIO_MIME_TYPE_ALIASES,
  QUESTION_AUDIO_MIME_TYPE_MPEG,
  QUESTION_AUDIO_MIME_TYPE_OGG,
  QUESTION_AUDIO_RECOMMENDED_EXCERPT_MS,
  type QuestionAudioMimeType,
} from '@quizzup/shared'

/**
 * Durées de pré-écoute proposées dans le formulaire : alignées sur les paliers du blind test
 * éclair (portés par le moteur de jeu). C'est une aide à l'écoute, pas une règle de jeu.
 */
export const AUDIO_PREVIEW_DURATIONS_MS = [1000, 5000, 20_000] as const

export const AUDIO_FILE_ACCEPT = '.mp3,.ogg,audio/mpeg,audio/ogg'

export const AUDIO_START_STEP_MS = 100

const EXTENSION_MIME_TYPES: Readonly<Record<string, QuestionAudioMimeType>> = {
  mp3: QUESTION_AUDIO_MIME_TYPE_MPEG,
  ogg: QUESTION_AUDIO_MIME_TYPE_OGG,
  oga: QUESTION_AUDIO_MIME_TYPE_OGG,
}

/** Type MIME envoyé à l'API : celui du navigateur s'il est connu, sinon déduit de l'extension. */
export function getAudioMimeType(file: Pick<File, 'name' | 'type'>): QuestionAudioMimeType | null {
  const fromType = QUESTION_AUDIO_MIME_TYPE_ALIASES[file.type.toLowerCase()]

  if (fromType) {
    return fromType
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  return EXTENSION_MIME_TYPES[extension] ?? null
}

export type AudioFileError = 'audioTypeInvalid' | 'audioTooLarge' | 'audioEmpty'

export function validateAudioFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  maxBytes = QUESTION_AUDIO_DEFAULT_MAX_BYTES
): AudioFileError | null {
  if (!getAudioMimeType(file)) {
    return 'audioTypeInvalid'
  }

  if (file.size === 0) {
    return 'audioEmpty'
  }

  if (file.size > maxBytes) {
    return 'audioTooLarge'
  }

  return null
}

/** `83450` → `1:23.4` (minutes, secondes, dixièmes). */
export function formatAudioTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return '0:00.0'
  }

  const tenths = Math.floor(ms / 100)
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)

  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) {
    return '0 Ko'
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}

/** Arrondi au pas du curseur et borné dans le fichier. */
export function clampStartMs(value: number, durationMs: number | null): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }

  const rounded = Math.round(value / AUDIO_START_STEP_MS) * AUDIO_START_STEP_MS
  const max = durationMs ? Math.max(0, durationMs - AUDIO_START_STEP_MS) : rounded

  return Math.min(rounded, max)
}

/** Vrai si l'extrait ne couvre pas le palier le plus long après le point de départ. */
export function isExcerptTooShort(startMs: number, durationMs: number | null): boolean {
  if (!durationMs) {
    return false
  }

  return durationMs - startMs < QUESTION_AUDIO_RECOMMENDED_EXCERPT_MS
}

/**
 * Durée du fichier lue par le navigateur (métadonnées) avant l'upload. `null` si le
 * navigateur n'y arrive pas : l'upload reste possible, l'API accepte une durée inconnue.
 */
export function measureAudioDurationMs(source: string, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio()
    let settled = false

    function finish(value: number | null): void {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timer)
      audio.removeAttribute('src')
      resolve(value)
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs)

    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration

      finish(Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null)
    })
    audio.addEventListener('error', () => finish(null))
    audio.src = source
  })
}
