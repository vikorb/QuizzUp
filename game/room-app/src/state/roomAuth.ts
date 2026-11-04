import { computed, ref } from 'vue'

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

/** Session du PC de la salle : compte de salle connecté, ou mode démo (sans backoffice). */
const token = ref<string | null>(getRoomToken())
const account = ref<RoomAccount | null>(null)
const demo = ref(isDemoMode())

export const isRoomReady = computed(() => demo.value || Boolean(token.value))
export const isDemo = computed(() => demo.value)
export const roomAccount = computed(() => account.value)

export function signIn(nextToken: string, nextAccount: RoomAccount): void {
  setDemoMode(false)
  demo.value = false
  setRoomToken(nextToken)
  setRoomAccountId(nextAccount.id)
  token.value = nextToken
  account.value = nextAccount
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
    // Jeton expiré ou révoqué : retour à la connexion. Une partie interrompue reste
    // reprenable après reconnexion ; elle est effacée à sa fin ou à la déconnexion.
    clearLocalSession({ keepSavedGame: true })
    // Plus personne aux commandes : lumières éteintes et fumée coupée, comme à la déconnexion.
    await stopLighting().catch(() => undefined)
    return
  }
  if (fetched) {
    account.value = fetched
    setRoomAccountId(fetched.id)
  }
}

function clearLocalSession(options: { keepSavedGame?: boolean } = {}): void {
  // Plus de compte : la config matérielle n'est plus enregistrée côté backoffice.
  setHardwareRemoteSaver(null)
  setRoomToken(null)
  setRoomAccountId(null)
  setDemoMode(false)
  token.value = null
  account.value = null
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
}
