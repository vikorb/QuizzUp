import { readonly, ref } from 'vue'

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
 * - `idle` : rien à signaler (file vide, ou résultats refusés pour de bon par le backoffice) ;
 * - `sending` : un envoi est en cours ;
 * - `sent` : tous les résultats sont enregistrés ;
 * - `offline` : envoi impossible (réseau, serveur), nouvel essai automatique ;
 * - `auth` : la salle n'est plus connectée, l'envoi reprendra à la reconnexion.
 */
export type FinishSyncStatus = 'idle' | 'sending' | 'sent' | 'offline' | 'auth'

/** Refus définitifs du backoffice : partie introuvable (404), déjà close (409) ou scores invalides (400). */
const FINAL_REFUSALS: ReadonlySet<number> = new Set([400, 404, 409])
/** Jeton absent, expiré ou refusé : inutile de boucler, on attend une reconnexion. */
const AUTH_REFUSALS: ReadonlySet<number> = new Set([401, 403])

const pendingCount = ref(0)
const syncStatus = ref<FinishSyncStatus>('idle')

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

/** Lecture tolérante : stockage absent ou illisible → file vide, éléments invalides ignorés. */
export function readPendingFinishes(): PendingFinish[] {
  const items: PendingFinish[] = []
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_FINISHES_KEY) ?? '[]') as unknown
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

function writePendingFinishes(items: PendingFinish[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(PENDING_FINISHES_KEY)
    } else {
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify(items))
    }
  } catch {
    // Stockage indisponible : la file ne survivra pas au rechargement.
  }
  pendingCount.value = items.length
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

/** Envoie les rapports dans l'ordre, un à la fois ; s'arrête au premier qui doit être renvoyé. */
async function sendAll(): Promise<void> {
  let sentSome = false
  for (;;) {
    const [next] = readPendingFinishes()
    if (!next) {
      clearRetryTimer()
      failedAttempts = 0
      syncStatus.value = sentSome ? 'sent' : 'idle'
      return
    }

    const token = getRoomToken()
    if (!token) {
      syncStatus.value = 'auth'
      return
    }

    try {
      await finishRoomGame(token, next.gameId, next.scores)
      sentSome = true
    } catch (error) {
      const status = error instanceof RoomApiError ? error.status : null
      if (status !== null && FINAL_REFUSALS.has(status)) {
        console.warn(`Résultats de la partie ${next.gameId} refusés par le backoffice (${status})`)
      } else if (status !== null && AUTH_REFUSALS.has(status)) {
        syncStatus.value = 'auth'
        return
      } else {
        syncStatus.value = 'offline'
        scheduleRetry()
        return
      }
    }
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

function listenToConnection(): void {
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    listening = true
  }
}

/**
 * Tente d'envoyer toute la file tout de suite (démarrage, reconnexion de la salle, retour du
 * réseau, nouveau rapport) et repart des délais courts. Sans effet si la file est vide.
 */
export function flushPendingFinishes(): Promise<void> {
  listenToConnection()
  pendingCount.value = readPendingFinishes().length
  if (pendingCount.value === 0) {
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
    writePendingFinishes([...items, report])
  }
  return flushPendingFinishes()
}

/** État réactif de la file, pour l'affichage (podium, lobby du staff). */
export function usePendingFinishes() {
  pendingCount.value = readPendingFinishes().length
  return { count: readonly(pendingCount), status: readonly(syncStatus) }
}

/** Arrête minuteur et écoute, et remet l'état à zéro (tests ; la file stockée n'est pas touchée). */
export function resetPendingFinishes(): void {
  clearRetryTimer()
  if (listening) {
    window.removeEventListener('online', onOnline)
    listening = false
  }
  failedAttempts = 0
  draining = null
  syncStatus.value = 'idle'
  pendingCount.value = 0
}
