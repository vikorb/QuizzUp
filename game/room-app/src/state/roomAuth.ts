import { computed, ref } from 'vue'

import { flushPendingFinishes } from '@/game/pendingFinishes'
import { createLocalSessionStorage } from '@/game/session'
import { setHardwareRemoteSaver, stopLighting } from '@/hardware/roomHardware'
import {
  fetchRoomAccount,
  getRoomToken,
  isDemoMode,
  logoutApi,
  type RoomAccount,
  setDemoMode,
  setRoomAccountId,
  setRoomToken,
} from '@/utils/auth'
import type { RoomCompany } from '@/utils/roomApi'

/** Session du PC de la salle : compte de salle connecté, ou mode démo (sans backoffice). */
const token = ref<string | null>(getRoomToken())
const account = ref<RoomAccount | null>(null)
const demo = ref(isDemoMode())
const company = ref<RoomCompany | null>(null)

export const isRoomReady = computed(() => demo.value || Boolean(token.value))
export const isDemo = computed(() => demo.value)
export const roomAccount = computed(() => account.value)
/** Centre de la salle (nom et logo), lu avec la config matérielle ; jamais en démo ni hors ligne. */
export const roomCompany = computed(() => (demo.value ? null : company.value))
/** Compte de salle connecté au backoffice (ni démo ni déconnecté) : seul cas où la salle se signale. */
export const isRoomConnected = computed(() => !demo.value && Boolean(token.value))

export function signIn(nextToken: string, nextAccount: RoomAccount): void {
  setDemoMode(false)
  demo.value = false
  setRoomToken(nextToken)
  setRoomAccountId(nextAccount.id)
  token.value = nextToken
  account.value = nextAccount
  // Le logo d'un autre centre ne reste jamais affiché : il est relu avec la config de ce compte.
  company.value = null
  // Des résultats de partie attendaient peut-être un jeton valide.
  void flushPendingFinishes()
}

export function setRoomCompany(next: RoomCompany | null): void {
  company.value = next
}

export function enterDemo(): void {
  setDemoMode(true)
  demo.value = true
}

/**
 * Recharge le compte au démarrage. Jeton expiré ou révoqué : la salle est
 * déconnectée. API injoignable : on garde le jeton (partie hors ligne).
 */
export async function refreshRoomAccount(): Promise<void> {
  if (!token.value) {
    return
  }
  const fetched = await fetchRoomAccount(token.value)
  if (fetched === 'unauthorized') {
    await expireRoomSession()
    return
  }
  if (fetched) {
    account.value = fetched
    setRoomAccountId(fetched.id)
  }
}

/**
 * Le jeton de salle n'est plus valable (expiré, révoqué) : retour à la connexion. Une partie
 * interrompue reste reprenable après reconnexion ; elle est effacée à sa fin ou à la déconnexion.
 */
export async function expireRoomSession(): Promise<void> {
  clearLocalSession({ keepSavedGame: true })
  // Plus personne aux commandes : lumières éteintes et fumée coupée, comme à la déconnexion.
  await stopLighting().catch(() => undefined)
}

function clearLocalSession(options: { keepSavedGame?: boolean } = {}): void {
  // Plus de compte : la config matérielle n'est plus enregistrée côté backoffice.
  setHardwareRemoteSaver(null)
  setRoomToken(null)
  setRoomAccountId(null)
  setDemoMode(false)
  token.value = null
  account.value = null
  company.value = null
  demo.value = false
  // Une partie sauvegardée contient les emails des joueurs : elle ne survit pas à la déconnexion.
  if (!options.keepSavedGame) {
    createLocalSessionStorage().clear()
  }
}

export async function signOut(): Promise<void> {
  const current = token.value
  clearLocalSession()
  // Plus personne aux commandes : noir complet, fumée coupée, interface DMX libérée.
  await stopLighting().catch(() => undefined)
  if (current) {
    await logoutApi(current)
  }
}

/** Réinitialise l'état depuis le stockage (tests). */
export function syncRoomAuth(): void {
  token.value = getRoomToken()
  demo.value = isDemoMode()
  account.value = null
  company.value = null
}
