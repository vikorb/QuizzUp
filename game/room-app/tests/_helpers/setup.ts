import { HARDWARE_STORAGE_KEY, resetRoomHardware } from '@/hardware/roomHardware'

// Le matériel est un singleton de page : chaque test repart d'une salle neuve.
afterEach(async () => {
  localStorage.removeItem(HARDWARE_STORAGE_KEY)
  await resetRoomHardware()
})
