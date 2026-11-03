import {
  QUESTION_AUDIO_MIME_TYPE_ALIASES,
  QUESTION_AUDIO_MIME_TYPE_MPEG,
  QUESTION_AUDIO_MIME_TYPE_OGG,
  type QuestionAudioMimeType,
} from '@quizzup/shared'

/** `audio/MPEG; charset=…` → `audio/mpeg`, ou `null` si le format n'est pas accepté. */
export function normalizeAudioMimeType(contentType: unknown): QuestionAudioMimeType | null {
  if (typeof contentType !== 'string') {
    return null
  }

  const baseType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  return QUESTION_AUDIO_MIME_TYPE_ALIASES[baseType] ?? null
}

function startsWithBytes(content: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => content[offset + index] === byte)
}

function isMpegAudio(content: Buffer): boolean {
  // Tag ID3v2 en tête, ou directement une trame MPEG (11 bits de synchro à 1).
  if (startsWithBytes(content, [0x49, 0x44, 0x33])) {
    return true
  }

  const first = content[0]
  const second = content[1]

  return first === 0xff && second !== undefined && (second & 0xe0) === 0xe0
}

function isOggAudio(content: Buffer): boolean {
  return startsWithBytes(content, [0x4f, 0x67, 0x67, 0x53])
}

/**
 * Vérifie la signature du fichier : on ne se fie pas au seul `Content-Type` envoyé par le
 * navigateur, pour ne pas stocker n'importe quel fichier renommé en `.mp3`.
 */
export function matchesAudioSignature(content: Buffer, mimeType: QuestionAudioMimeType): boolean {
  if (content.length < 4) {
    return false
  }

  if (mimeType === QUESTION_AUDIO_MIME_TYPE_MPEG) {
    return isMpegAudio(content)
  }

  if (mimeType === QUESTION_AUDIO_MIME_TYPE_OGG) {
    return isOggAudio(content)
  }

  return false
}

const MAX_ORIGINAL_NAME_LENGTH = 255

/** Nom d'origine affiché dans le backoffice : sans chemin ni caractères de contrôle. */
export function sanitizeOriginalName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const baseName = value.split(/[/\\]/).pop() ?? ''
  const cleaned = baseName.replaceAll(/\p{Cc}/gu, '').trim()

  return cleaned ? cleaned.slice(0, MAX_ORIGINAL_NAME_LENGTH) : null
}
