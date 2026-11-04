import {
  applyRemoteHardwareConfig,
  bindHardwareToRoom,
  getHardwareSaveGeneration,
  getHardwareSyncMeta,
  getRoomHardwareConfig,
  isDefaultHardwareConfig,
  pushHardwareConfig,
  setHardwareRemoteSaver,
} from '@/hardware/roomHardware'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { fetchRoomInfo, type RoomInfo, saveRoomConfig } from '@/utils/roomApi'

/**
 * Relie la config matérielle au compte de la salle (`rooms.config`) : elle y est
 * relue au démarrage et enregistrée à chaque modification. Le navigateur n'en
 * garde qu'une copie de secours. Rien en mode démo.
 *
 * Au démarrage, la copie locale l'emporte seulement si elle concerne cette salle et
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

  setHardwareRemoteSaver(async (config) => {
    const current = getRoomToken()
    if (!current) {
      throw new Error('signed_out')
    }
    await saveRoomConfig(current, config)
  })

  const generation = getHardwareSaveGeneration()
  let room: RoomInfo
  try {
    room = await fetchRoomInfo(token)
  } catch {
    // Backoffice injoignable : on joue avec la copie locale.
    return
  }

  // Déconnexion, passage en démo ou enregistrement local pendant la lecture :
  // la config reçue est périmée (l'enregistrement est déjà parti).
  if (getRoomToken() !== token || isDemoMode() || getHardwareSaveGeneration() !== generation) {
    return
  }

  const meta = getHardwareSyncMeta()
  const sameRoom = meta.roomId === null || meta.roomId === room.id
  const localHasSettings = !isDefaultHardwareConfig(getRoomHardwareConfig())
  const keepLocal =
    sameRoom && localHasSettings && (meta.pending || isDefaultHardwareConfig(room.config))

  if (keepLocal) {
    bindHardwareToRoom(room.id)
    await pushHardwareConfig()
    return
  }
  await applyRemoteHardwareConfig(room.config, room.id)
}
