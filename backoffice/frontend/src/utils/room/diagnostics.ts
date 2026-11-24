import { ROOM_PRESENCE, type RoomDiagnostics, type RoomLive } from '@quizzup/shared'

import { formatGameDate } from '@/utils/game/format'

type DiagnosticTone = 'ok' | 'warn' | 'danger' | 'muted'

type DiagnosticTranslate = (key: string, params?: Record<string, unknown>) => string

export type RoomDiagnosticRow = {
  id: 'appVersion' | 'buzzers' | 'lights' | 'smoke' | 'audio' | 'lastError'
  label: string
  value: string
  /** `null` : une valeur sans état (la version), affichée en texte seul. */
  tone: DiagnosticTone | null
}

const LIGHTING_STATUS_TONE: Record<string, DiagnosticTone> = {
  open: 'ok',
  opening: 'warn',
  closing: 'warn',
  error: 'danger',
  closed: 'muted',
}

/** `null` : la salle n'a pas publié ce qu'il faut pour l'affirmer. */
function buzzersLabel(diagnostics: RoomDiagnostics, t: DiagnosticTranslate): string | null {
  if (diagnostics.buzzerSource === 'keyboard') {
    return t('rooms.diagnostic.buzzers.keyboard')
  }

  if (diagnostics.buzzerSource !== 'gamepad') {
    return null
  }

  if (diagnostics.gamepadCount === null) {
    return t('rooms.diagnostic.buzzers.gamepadUnknown')
  }

  return diagnostics.gamepadCount === 0
    ? t('rooms.diagnostic.buzzers.gamepadNone')
    : t('rooms.diagnostic.buzzers.gamepad', { count: diagnostics.gamepadCount })
}

function smokeState({
  smokeEnabled,
  smokeArmed,
}: RoomDiagnostics): 'disabled' | 'enabled' | 'armed' | null {
  if (smokeEnabled === null) {
    return null
  }

  if (!smokeEnabled) {
    return 'disabled'
  }

  // Une fumée autorisée dont on ignore si elle est armée reste inconnue : jamais « non armée » par défaut.
  if (smokeArmed === null) {
    return null
  }

  return smokeArmed ? 'armed' : 'enabled'
}

/** Une fumée armée est le seul état qui demande l'attention du personnel. */
const SMOKE_TONE = { disabled: 'muted', enabled: 'ok', armed: 'warn' } as const

/**
 * Lignes du bloc « Diagnostic » d'une salle. Tout est « inconnu » quand le flux en direct n'est pas
 * ouvert, que la salle est hors ligne ou n'a jamais publié : un état ancien ne doit pas passer pour
 * l'état actuel. Un écran de salle ancien (sans `diagnostics`) laisse inconnu ce qu'il ne publie pas.
 */
export function getRoomDiagnosticRows(
  room: RoomLive | null,
  uncertain: boolean,
  t: DiagnosticTranslate,
  locale: string
): RoomDiagnosticRow[] {
  const status = !uncertain && room?.presence !== ROOM_PRESENCE.OFFLINE ? room?.status : null
  const diagnostics = status?.diagnostics
  const unknown = t('rooms.diagnostic.unknown')
  const row = (
    id: RoomDiagnosticRow['id'],
    value: string | null,
    tone: DiagnosticTone | null
  ): RoomDiagnosticRow => ({
    id,
    label: t(`rooms.diagnostic.rows.${id}`),
    value: value ?? unknown,
    tone: value === null ? 'muted' : tone,
  })

  const lighting = diagnostics?.lightingDriver
    ? t('rooms.diagnostic.lights.value', {
        driver: t(`rooms.diagnostic.lights.drivers.${diagnostics.lightingDriver}`),
        status: t(`rooms.diagnostic.lights.statuses.${diagnostics.lightingStatus ?? 'unknown'}`),
      })
    : null
  const smoke = diagnostics ? smokeState(diagnostics) : null
  const buzzers = diagnostics ? buzzersLabel(diagnostics, t) : null

  return [
    row('appVersion', diagnostics?.appVersion ?? null, null),
    row(
      'buzzers',
      buzzers,
      diagnostics?.buzzerSource === 'gamepad' && diagnostics.gamepadCount === 0 ? 'warn' : 'ok'
    ),
    row('lights', lighting, LIGHTING_STATUS_TONE[diagnostics?.lightingStatus ?? ''] ?? 'muted'),
    row('smoke', smoke && t(`rooms.diagnostic.smoke.${smoke}`), SMOKE_TONE[smoke ?? 'disabled']),
    row(
      'audio',
      status ? t(`rooms.diagnostic.audio.${status.audioReady ? 'ready' : 'waiting'}`) : null,
      status?.audioReady ? 'ok' : 'warn'
    ),
    row(
      'lastError',
      diagnostics
        ? diagnostics.lastErrorAt === null
          ? t('rooms.diagnostic.lastError.none')
          : formatGameDate(diagnostics.lastErrorAt, locale)
        : null,
      diagnostics?.lastErrorAt === null ? 'ok' : 'warn'
    ),
  ]
}
