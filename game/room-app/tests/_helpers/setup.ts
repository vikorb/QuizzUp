import {
  EMERGENCY_STORAGE_KEY,
  HARDWARE_STORAGE_KEY,
  HARDWARE_SYNC_STORAGE_KEY,
  resetRoomHardware,
} from '@/hardware/roomHardware'

// Le matériel et la file d'envoi des résultats sont des singletons de page : chaque test
// repart d'une salle neuve (minuteur de nouvel essai et écoute du réseau arrêtés).
afterEach(async () => {
  // Import tardif : un import ici chargerait `roomApi` avant les `vi.mock` des fichiers de test.
  const { resetPendingFinishes } = await import('@/game/pendingFinishes')
  resetPendingFinishes()
  localStorage.removeItem(HARDWARE_STORAGE_KEY)
  localStorage.removeItem(HARDWARE_SYNC_STORAGE_KEY)
  localStorage.removeItem(EMERGENCY_STORAGE_KEY)
  await resetRoomHardware()
})
