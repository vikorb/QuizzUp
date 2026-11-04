import {
  applyRemoteHardwareConfig,
  getRoomHardwareConfig,
  setHardwareRemoteSaver,
} from '@/hardware/roomHardware'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { fetchRoomInfo, saveRoomConfig } from '@/utils/roomApi'

function isEmptyConfig(config: unknown): boolean {
  return (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    Object.keys(config).length === 0
  )
}

/**
 * Relie la config matérielle au compte de la salle (`rooms.config`) : elle y est
 * relue au démarrage et enregistrée à chaque modification. Le navigateur n'en
 * garde qu'une copie de secours. Rien en mode démo.
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

  let room
  try {
    room = await fetchRoomInfo(token)
  } catch {
    // Backoffice injoignable : on joue avec la copie locale.
    return
  }

  if (isEmptyConfig(room.config)) {
    // Salle encore vierge côté backoffice : on y remonte la config réglée sur ce PC.
    await saveRoomConfig(token, getRoomHardwareConfig()).catch(() => undefined)
    return
  }
  await applyRemoteHardwareConfig(room.config)
}
