import type { EngineQuestion, EngineTheme } from '@quizzup/game-engine'
import type { GameFormat, MiniGame, RoomLogEntryInput } from '@quizzup/shared'

import { toExtractEffect } from '@/audio/extractEffect'
import type { MediaCredit } from '@/game/mediaCredits'
import { authHeaders, getApiBase } from '@/utils/auth'

/**
 * Routes `/room/*` du backoffice, réservées au compte de salle : la partie
 * préparée par le staff, son contenu, son démarrage et la config matérielle.
 */
export type RoomGameParticipant = {
  id: number
  podium: number
  displayName: string
  /** 2e joueur facultatif du pupitre (`null` : joueur seul). */
  secondDisplayName?: string | null
  score: number
}

/** Lien d'inscription par QR code de la partie en attente (`join` de `GET /room/games/current`). */
export type RoomGameJoin = {
  url: string
  /** SVG complet du QR code ; absent ou `null` si le serveur n'a pas d'adresse publique. */
  qrSvg?: string | null
  expiresAt: string
}

export type RoomGame = {
  id: number
  seed: number
  /** Format choisi à la création ; `null` ou absent (partie ancienne) : personnalisé. */
  format?: GameFormat | null
  roundsCount: number
  questionsPerRound: number
  /** Mini-jeux choisis au lancement ; `null` : aucun choix, tous peuvent être tirés. */
  miniGames: MiniGame[] | null
  state: string
  participants: RoomGameParticipant[]
  /** Lien d'inscription ouvert, `null` s'il est fermé (absent d'un backoffice ancien). */
  join?: RoomGameJoin | null
  /** Demandes d'inscription à valider au backoffice (jamais leurs noms). */
  pendingRegistrationsCount?: number
  /** Questions déjà vues par ces joueurs, à poser en dernier (absent d'un backoffice ancien). */
  avoidQuestionIds?: number[]
}

/** Centre de la salle, tel que `GET /room/me` le renvoie (`logoUrl` : adresse complète, `null` sans logo). */
export type RoomCompany = {
  id: number
  name: string
  logoUrl: string | null
}

export type RoomInfo = {
  id: number
  name: string
  /** Absent d'un backoffice ancien. */
  company?: RoomCompany | null
  config: Record<string, unknown>
  /** Révision de `config` : à renvoyer à l'enregistrement (absente d'un backoffice ancien). */
  configRevision?: number
}

/** Corps du 409 de `PUT /room/config` : la config courante du compte et sa révision. */
export type RoomConfigConflict = {
  config: Record<string, unknown>
  configRevision: number
}

export class RoomApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    /** Corps JSON de la réponse d'erreur, s'il y en avait un. */
    public readonly body: unknown = null
  ) {
    super(code)
    this.name = 'RoomApiError'
  }

  /** La config courante du compte, si c'est un conflit de révision bien formé. */
  get configConflict(): RoomConfigConflict | null {
    const body = this.body as Partial<RoomConfigConflict> | null
    return this.status === 409 &&
      this.code === 'room_config_conflict' &&
      body?.config !== null &&
      typeof body?.config === 'object' &&
      Number.isInteger(body.configRevision)
      ? (body as RoomConfigConflict)
      : null
  }
}

async function request<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const headers = authHeaders(token)
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Abandon (erreur brute, comme une coupure réseau) si le serveur ne répond pas à temps.
    signal: init.timeoutMs === undefined ? undefined : AbortSignal.timeout(init.timeoutMs),
  })

  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null

  if (!res.ok || data === null) {
    throw new RoomApiError(res.status, data?.error ?? 'server_error', data)
  }
  return data
}

/** Question du contenu de partie : celle du moteur, plus le crédit d'un extrait tiers (absent d'un serveur ancien). */
export type RoomQuestion = EngineQuestion & { mediaCredit?: MediaCredit | null }
export type RoomTheme = Omit<EngineTheme, 'questions'> & { questions: RoomQuestion[] }

/** Chemin relatif de l'API (`/room/questions/12/media`) → URL complète ; URL absolue (extrait tiers) inchangée. */
export function resolveMediaUrl(url: string | null): string | null {
  if (!url) {
    return null
  }
  return url.startsWith('/') ? `${getApiBase()}${url}` : url
}

export async function fetchRoomInfo(token: string): Promise<RoomInfo> {
  const data = await request<{ room: RoomInfo; company?: RoomCompany | null }>(token, '/room/me')
  const company = data.company
    ? { ...data.company, logoUrl: resolveMediaUrl(data.company.logoUrl ?? null) }
    : null
  return { ...data.room, company }
}

/** Partie en attente ou en cours de la salle, ou `null` si le staff n'en a lancé aucune. */
export async function fetchCurrentGame(token: string): Promise<RoomGame | null> {
  const data = await request<{ game: RoomGame | null }>(token, '/room/games/current')
  return data.game
}

/**
 * Contenu de la partie, au format du moteur, avec des URL de médias complètes. `ids` limite la
 * réponse à ces questions (le serveur n'en accepte qu'un nombre borné par appel).
 */
export async function fetchCurrentContent(
  token: string,
  options: { ids?: number[]; timeoutMs?: number } = {}
): Promise<RoomTheme[]> {
  const query = options.ids === undefined ? '' : `?ids=${options.ids.join(',')}`
  const data = await request<{ themes: RoomTheme[] }>(
    token,
    `/room/games/current/content${query}`,
    { timeoutMs: options.timeoutMs }
  )
  return data.themes.map((theme) => ({
    ...theme,
    questions: theme.questions.map((question) => ({
      ...question,
      mediaUrl: resolveMediaUrl(question.mediaUrl),
      audioEffect: toExtractEffect(question.audioEffect),
    })),
  }))
}

/** Titre d'une playlist de la partie : lien d'extrait à jour et crédit (`ref` = `-id` de la question). */
export type RoomTrack = { ref: string; mediaUrl: string; mediaCredit: MediaCredit }

/**
 * Liens d'extrait à jour des titres de playlist de la partie (reprise après un rechargement).
 * `themeIds` : les thèmes de playlist de la partie (1 à 6) ; `refs` : la valeur absolue des
 * identifiants de question négatifs. Un titre que le serveur ne retrouve pas est absent du résultat.
 */
export async function fetchCurrentTracks(
  token: string,
  options: { themeIds: number[]; refs: string[]; timeoutMs?: number }
): Promise<RoomTrack[]> {
  const query = `?themeIds=${options.themeIds.join(',')}&refs=${options.refs.join(',')}`
  const data = await request<{ items: RoomTrack[] }>(token, `/room/games/current/tracks${query}`, {
    timeoutMs: options.timeoutMs,
  })
  // Le serveur rend des URL absolues https : rien à compléter.
  return data.items
}

/**
 * Accuse réception de la partie : elle passe « en cours » côté backoffice (idempotent).
 * `podiums` : les pupitres chargés par la salle ; si la liste du backoffice a changé depuis, il
 * répond 409 `game_participants_changed` et ne lance rien (absent : aucune vérification).
 */
export async function startRoomGame(
  token: string,
  gameId: number,
  podiums?: number[]
): Promise<RoomGame> {
  const data = await request<{ game: RoomGame }>(token, `/room/games/${gameId}/start`, {
    method: 'POST',
    body: podiums === undefined ? undefined : { podiums },
  })
  return data.game
}

/** Score final d'un pupitre, envoyé au podium. */
export type RoomGameScore = { podium: number; score: number }

/** Manche jouée, envoyée au podium : mini-jeu, thème et questions effectivement posées. */
export type RoomGameRound = {
  position: number
  miniGame: MiniGame
  themeId: number | null
  questionIds: number[]
}

/** Délai maximal de l'envoi de fin de partie : au-delà, l'envoi est réessayé plus tard. */
export const FINISH_REQUEST_TIMEOUT_MS = 10_000

/**
 * Fin de partie : le backoffice la passe « terminée » avec les scores et, si fournies, les manches
 * jouées (idempotent).
 */
export async function finishRoomGame(
  token: string,
  gameId: number,
  scores: RoomGameScore[],
  rounds?: RoomGameRound[]
): Promise<RoomGame> {
  const data = await request<{ game: RoomGame }>(token, `/room/games/${gameId}/finish`, {
    method: 'POST',
    body: rounds ? { scores, rounds } : { scores },
    timeoutMs: FINISH_REQUEST_TIMEOUT_MS,
  })
  return data.game
}

/** Délai maximal de l'envoi des journaux d'erreurs : au-delà, ils repartent au prochain passage. */
export const LOGS_REQUEST_TIMEOUT_MS = 10_000

/** Envoie des journaux d'erreurs (`POST /room/logs`, 204 sans corps : pas de passage par `request`). */
export async function postRoomLogs(
  token: string,
  appVersion: string,
  entries: RoomLogEntryInput[]
): Promise<void> {
  const headers = authHeaders(token)
  headers.set('Content-Type', 'application/json')

  const res = await fetch(`${getApiBase()}/room/logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ appVersion, entries }),
    signal: AbortSignal.timeout(LOGS_REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new RoomApiError(res.status, data?.error ?? 'server_error', data)
  }
}

/**
 * Enregistre la config sur le compte. Avec `revision` (celle lue), le backoffice refuse
 * (409, voir `RoomApiError.configConflict`) si un autre poste a écrit entre-temps.
 */
export async function saveRoomConfig(
  token: string,
  config: unknown,
  revision?: number | null
): Promise<RoomInfo> {
  const data = await request<{ room: RoomInfo }>(token, '/room/config', {
    method: 'PUT',
    body: typeof revision === 'number' ? { config, revision } : { config },
  })
  return data.room
}
