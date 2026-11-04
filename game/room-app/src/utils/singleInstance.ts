export const ROOM_LOCK_NAME = 'quizzup-room'

type LockManagerLike = Pick<LockManager, 'request'>

/**
 * Une seule instance de l'écran de salle par poste : deux onglets piloteraient deux fois les
 * buzzers, les lumières (Web Serial occupé) et la sauvegarde de partie. Le verrou Web Locks est
 * pris sans attente et gardé tant que la page vit (la promesse du rappel ne se résout jamais).
 * Renvoie `false` si une autre page le détient ; `true` aussi quand l'API est absente
 * (navigateur ancien, page non sécurisée) ou refuse : l'application démarre alors normalement.
 */
export function acquireSingleInstance(
  locks: LockManagerLike | undefined = globalThis.navigator?.locks
): Promise<boolean> {
  if (!locks) {
    return Promise.resolve(true)
  }
  return new Promise<boolean>((resolve) => {
    try {
      locks
        .request(ROOM_LOCK_NAME, { ifAvailable: true }, (lock) => {
          resolve(lock !== null)
          return lock ? new Promise<never>(() => {}) : undefined
        })
        .catch(() => resolve(true))
    } catch {
      resolve(true)
    }
  })
}
