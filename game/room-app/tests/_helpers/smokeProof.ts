import { recordSmokeCutoffResult, saveRoomHardwareConfig } from '@/hardware/roomHardware'

/**
 * Enregistre `config` comme sur un PC où le test de coupure de la fumée a réussi : même chemin
 * que l'assistant (config de test appliquée à la page, réponse « elle s'est arrêtée »), puis
 * enregistrement normal de la config.
 */
export async function saveWithSmokeProof(config: unknown): Promise<void> {
  await saveRoomHardwareConfig(config, { persist: false, smokeTest: true })
  recordSmokeCutoffResult(true)
  await saveRoomHardwareConfig(config)
}
