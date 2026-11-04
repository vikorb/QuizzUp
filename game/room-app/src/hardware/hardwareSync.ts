import {
  applyRemoteHardwareConfig,
  getHardwareSaveGeneration,
  getHardwareSyncMeta,
  getRoomHardwareConfig,
  isDefaultHardwareConfig,
  isHardwareCopyForeign,
  pushHardwareConfig,
  setHardwareRemoteSaver,
} from '@/hardware/roomHardware'
import { roomAccount } from '@/state/roomAuth'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { fetchRoomInfo, type RoomInfo, saveRoomConfig } from '@/utils/roomApi'

/** Empreinte du jeton (FNV-1a 32 bits) : retrouve le compte d'une copie locale hors ligne. */
export function tagRoomToken(token: string): string {
  let hash = 0x81_1c_9d_c5
  for (const char of token) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0
  }
  return hash.toString(16)
}

/** Compte du jeton : connu après le login ou au démarrage, ou retrouvé dans la copie locale. */
function resolveAccountId(tokenTag: string): number | null {
  const account = roomAccount.value
  if (account) {
    return account.id
  }
  const meta = getHardwareSyncMeta()
  return meta.tokenTag === tokenTag ? meta.accountId : null
}

/**
 * Relie la config matérielle au compte de la salle (`rooms.config`) : elle y est
 * relue au démarrage et enregistrée à chaque modification. Le navigateur n'en
 * garde qu'une copie de secours. Rien en mode démo.
 *
 * Au démarrage, la copie locale l'emporte seulement si elle concerne ce compte et
 * qu'elle contient des réglages que le compte n'a pas : modifications restées en
 * attente d'envoi, ou compte encore vierge. Une config par défaut ne part jamais
 * écraser celle d'une salle, et la copie d'une autre salle n'y est jamais envoyée.
 */
export async function syncHardwareWithRoom(): Promise<void> {
  const token = getRoomToken()

  if (!token || isDemoMode()) {
    setHardwareRemoteSaver(null)
    return
  }

  const tokenTag = tagRoomToken(token)
  const accountId = resolveAccountId(tokenTag)
  if (accountId === null) {
    // Compte inconnu (backoffice injoignable dès le démarrage) : rien ne part.
    setHardwareRemoteSaver(null)
    return
  }

  setHardwareRemoteSaver(
    async (config) => {
      // Un envoi resté en file ne part jamais vers un autre compte.
      if (getRoomToken() !== token) {
        throw new Error('account_changed')
      }
      await saveRoomConfig(token, config)
    },
    { accountId, tokenTag }
  )

  const generation = getHardwareSaveGeneration()
  let room: RoomInfo
  try {
    room = await fetchRoomInfo(token)
  } catch {
    // Backoffice injoignable : on joue avec la copie locale.
    return
  }

  if (getRoomToken() !== token || isDemoMode()) {
    return
  }

  const foreign = isHardwareCopyForeign()
  // Enregistrement local pendant la lecture : la config reçue est périmée
  // (l'enregistrement est déjà parti). Sauf copie d'une autre salle, jamais envoyée.
  if (!foreign && getHardwareSaveGeneration() !== generation) {
    return
  }

  const keepLocal =
    !foreign &&
    !isDefaultHardwareConfig(getRoomHardwareConfig()) &&
    (getHardwareSyncMeta().pending || isDefaultHardwareConfig(room.config))

  if (keepLocal) {
    await pushHardwareConfig()
    return
  }
  await applyRemoteHardwareConfig(room.config)
}
