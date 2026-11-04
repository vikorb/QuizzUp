import { computed, ref } from 'vue'

import { getRoomToken } from '@/utils/auth'
import { finishRoomGame, RoomApiError, type RoomGameScore } from '@/utils/roomApi'

/**
 * File d'attente des fins de partie à signaler au backoffice (`POST /room/games/:id/finish`).
 * Elle est gardée dans `localStorage`, à part de la sauvegarde de partie : elle survit au
 * rechargement de la page et au lancement d'une nouvelle partie, le temps que le réseau revienne.
 */
export const PENDING_FINISHES_KEY = 'quizzup_room_pending_finishes'

/** Attente avant chaque nouvel essai ; le dernier délai se répète tant que la file n'est pas vide. */
export const RETRY_DELAYS_MS = [2000, 5000, 15_000, 30_000, 60_000] as const

/** Rapport de fin d'une partie du backoffice : `seed` relie la partie locale à la partie retenue. */
export type PendingFinish = { gameId: number; seed: number; scores: RoomGameScore[] }

/**
 * État d'envoi des résultats d'UNE partie (`getFinishStatus`) :
 * - `idle` : rien à signaler pour cette partie ;
 * - `sending` : en file, un envoi est en cours ou imminent ;
 * - `sent` : résultats enregistrés par le backoffice ;
 * - `refused` : refus définitif du backoffice (partie introuvable, déjà close, scores invalides) ;
 * - `offline` : envoi impossible (réseau, serveur), nouvel essai automatique ;
 * - `auth` : la salle n'est plus connectée, l'envoi reprendra à la reconnexion.
 */
export type FinishSyncStatus = 'idle' | 'sending' | 'sent' | 'refused' | 'offline' | 'auth'

/** Refus définitifs du backoffice : partie introuvable (404), déjà close (409) ou scores invalides (400). */
const FINAL_REFUSALS: ReadonlySet<number> = new Set([400, 404, 409])
/** Jeton absent, expiré ou refusé : inutile de boucler, on attend une reconnexion. */
const AUTH_REFUSALS: ReadonlySet<number> = new Set([401, 403])

/** Parties dont les résultats attendent d'être envoyés (vue réactive de la file). */
const pendingIds = ref<number[]>([])
/** Issue définitive des parties traitées depuis l'ouverture de la page. */
const outcomes = ref<Record<number, 'sent' | 'refused'>>({})
/** Ce que fait la file en ce moment, pour les parties qui y figurent encore. */
const syncStatus = ref<'idle' | 'sending' | 'offline' | 'auth'>('idle')

/**
 * Copie en mémoire de la file : elle devient la source de vérité quand `localStorage` refuse
 * l'écriture (quota plein, stockage bloqué), pour que les résultats partent quand même.
 */
let memory: PendingFinish[] = []
let storageFailed = false

let retryTimer: ReturnType<typeof setTimeout> | null = null
let failedAttempts = 0
let draining: Promise<void> | null = null
let listening = false

function isScore(value: unknown): value is RoomGameScore {
  const score = value as Partial<RoomGameScore> | null
  return (
    typeof score === 'object' &&
    score !== null &&
    Number.isInteger(score.podium) &&
    typeof score.score === 'number' &&
    Number.isFinite(score.score)
  )
}

function toPendingFinish(value: unknown): PendingFinish | null {
  const item = value as Partial<PendingFinish> | null
  if (
    typeof item !== 'object' ||
    item === null ||
    !Number.isInteger(item.gameId) ||
    Number(item.gameId) <= 0 ||
    !Number.isInteger(item.seed) ||
    !Array.isArray(item.scores) ||
    !item.scores.every((score) => isScore(score))
  ) {
    return null
  }
  return {
    gameId: Number(item.gameId),
    seed: Number(item.seed),
    scores: item.scores.map(({ podium, score }) => ({ podium, score })),
  }
}

function copyOf(items: PendingFinish[]): PendingFinish[] {
  return items.map((item) => ({ ...item, scores: item.scores.map((score) => ({ ...score })) }))
}

/** File stockée ; `null` si le stockage est inaccessible, vide si son contenu est illisible. */
function readStored(): PendingFinish[] | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(PENDING_FINISHES_KEY)
  } catch {
    return null
  }
  const items: PendingFinish[] = []
  try {
    const saved = JSON.parse(raw ?? '[]') as unknown
    for (const value of Array.isArray(saved) ? saved : []) {
      const item = toPendingFinish(value)
      if (item && !items.some((known) => known.gameId === item.gameId)) {
        items.push(item)
      }
    }
  } catch {
    return []
  }
  return items
}

/** Lecture tolérante : la copie en mémoire fait foi si l'écriture a échoué ou le stockage manque. */
export function readPendingFinishes(): PendingFinish[] {
  if (!storageFailed) {
    const stored = readStored()
    if (stored) {
      memory = stored
    }
  }
  return copyOf(memory)
}

function showQueue(items: PendingFinish[]): void {
  pendingIds.value = items.map((item) => item.gameId)
}

function writePendingFinishes(items: PendingFinish[]): void {
  memory = copyOf(items)
  try {
    if (items.length === 0) {
      localStorage.removeItem(PENDING_FINISHES_KEY)
    } else {
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify(items))
    }
    storageFailed = false
  } catch {
    // Stockage plein ou indisponible : la copie en mémoire garde la file (envoyée, mais elle
    // ne survivra pas à un rechargement).
    storageFailed = true
  }
  showQueue(memory)
}

function removePendingFinish(gameId: number): void {
  writePendingFinishes(readPendingFinishes().filter((item) => item.gameId !== gameId))
}

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry(): void {
  clearRetryTimer()
  const index = Math.min(failedAttempts, RETRY_DELAYS_MS.length - 1)
  failedAttempts += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    void drain()
  }, RETRY_DELAYS_MS[index])
}

type Attempt = 'sent' | 'refused' | 'reauth' | 'auth' | 'retry'

async function attempt(report: PendingFinish, token: string): Promise<Attempt> {
  try {
    await finishRoomGame(token, report.gameId, report.scores)
    return 'sent'
  } catch (error) {
    const status = error instanceof RoomApiError ? error.status : null
    if (status !== null && FINAL_REFUSALS.has(status)) {
      console.warn(`Résultats de la partie ${report.gameId} refusés par le backoffice (${status})`)
      return 'refused'
    }
    if (status !== null && AUTH_REFUSALS.has(status)) {
      // La salle s'est reconnectée pendant l'envoi : le nouveau jeton n'a pas encore servi.
      return getRoomToken() === token ? 'auth' : 'reauth'
    }
    // Réseau coupé, délai dépassé, 5xx, 429 : on réessaiera.
    return 'retry'
  }
}

/** Envoie les rapports dans l'ordre, un à la fois ; s'arrête au premier qui doit être renvoyé. */
async function sendAll(): Promise<void> {
  for (;;) {
    const [next] = readPendingFinishes()
    if (!next) {
      clearRetryTimer()
      failedAttempts = 0
      syncStatus.value = 'idle'
      return
    }

    const token = getRoomToken()
    if (!token) {
      syncStatus.value = 'auth'
      return
    }

    const result = await attempt(next, token)
    if (result === 'reauth') {
      continue
    }
    if (result === 'auth') {
      syncStatus.value = 'auth'
      return
    }
    if (result === 'retry') {
      syncStatus.value = 'offline'
      scheduleRetry()
      return
    }
    outcomes.value = { ...outcomes.value, [next.gameId]: result }
    removePendingFinish(next.gameId)
  }
}

function drain(): Promise<void> {
  if (!draining) {
    clearRetryTimer()
    draining = sendAll().finally(() => {
      draining = null
    })
  }
  return draining
}

function onOnline(): void {
  void flushPendingFinishes()
}

/** Autre onglet : la file stockée a changé, on s'y aligne (sans perdre ce qui n'a pu être écrit). */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== PENDING_FINISHES_KEY) {
    return
  }
  const stored = readStored()
  if (stored) {
    memory = storageFailed
      ? [
          ...stored,
          ...memory.filter((item) => !stored.some((known) => known.gameId === item.gameId)),
        ]
      : stored
  }
  showQueue(memory)
}

function listenToConnection(): void {
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    window.addEventListener('storage', onStorage)
    listening = true
  }
}

/**
 * Tente d'envoyer toute la file tout de suite (démarrage, reconnexion de la salle, retour du
 * réseau, nouveau rapport) et repart des délais courts. Sans effet si la file est vide.
 */
export function flushPendingFinishes(): Promise<void> {
  listenToConnection()
  const items = readPendingFinishes()
  showQueue(items)
  if (items.length === 0) {
    return draining ?? Promise.resolve()
  }
  failedAttempts = 0
  if (!draining) {
    syncStatus.value = 'sending'
  }
  return drain()
}

/** Met un rapport en file (une seule fois par partie) et tente de l'envoyer. */
export function enqueuePendingFinish(report: PendingFinish): Promise<void> {
  const items = readPendingFinishes()
  if (!items.some((item) => item.gameId === report.gameId)) {
    const { [report.gameId]: _previous, ...others } = outcomes.value
    outcomes.value = others
    writePendingFinishes([...items, report])
  }
  return flushPendingFinishes()
}

/** Partie en file dont la graine est celle de la partie jouée (`undefined` : aucune). */
export function findPendingFinishBySeed(seed: number): PendingFinish | undefined {
  return readPendingFinishes().find((item) => item.seed === seed)
}

/** État d'envoi d'une partie précise : celui du podium affiché, pas celui de la file entière. */
export function getFinishStatus(gameId: number | null): FinishSyncStatus {
  if (gameId === null) {
    return 'idle'
  }
  const outcome = outcomes.value[gameId]
  if (outcome) {
    return outcome
  }
  if (!pendingIds.value.includes(gameId)) {
    return 'idle'
  }
  return syncStatus.value === 'idle' ? 'sending' : syncStatus.value
}

/** Nombre de résultats en attente, réactif (bandeau du lobby du staff). */
export function usePendingFinishes() {
  showQueue(readPendingFinishes())
  return { count: computed(() => pendingIds.value.length) }
}

/** Arrête minuteur et écoute, et remet l'état à zéro (tests ; la file stockée n'est pas touchée). */
export function resetPendingFinishes(): void {
  clearRetryTimer()
  if (listening) {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('storage', onStorage)
    listening = false
  }
  failedAttempts = 0
  draining = null
  memory = []
  storageFailed = false
  syncStatus.value = 'idle'
  pendingIds.value = []
  outcomes.value = {}
}
