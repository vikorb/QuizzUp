export const ROOM_LOCK_NAME = 'quizzup-room'
/** Si le navigateur ne répond pas au verrou dans ce délai, la salle démarre quand même. */
export const LOCK_FALLBACK_MS = 2000

type LockManagerLike = Pick<LockManager, 'request'>

type SingleInstanceOptions = {
  /** Démarre la salle (moteur, buzzers, lumières). */
  start: () => void
  /** Affiche le message « déjà ouvert » (la salle n'est pas démarrée). */
  showBlocked: () => void
  locks?: LockManagerLike
  reload?: () => void
}

const holdForever = () => new Promise<never>(() => {})

/**
 * Une seule instance de l'écran de salle par poste : deux onglets piloteraient deux fois les
 * buzzers, les lumières (Web Serial occupé) et la sauvegarde de partie. Le verrou Web Locks est
 * pris sans attente (`ifAvailable`) et gardé tant que la page vit.
 *
 * - verrou obtenu : la salle démarre ;
 * - verrou refusé : le message s'affiche, et la page attend le verrou (sans `ifAvailable`) ; dès que
 *   l'autre page se ferme, elle se recharge et démarre. Cela couvre aussi le rechargement, où
 *   Chromium libère le verrou de l'ancienne page un peu après le démarrage de la nouvelle ;
 * - API absente ou en erreur, ou aucune réponse sous `LOCK_FALLBACK_MS` : la salle démarre
 *   normalement (jamais d'écran blanc).
 */
export function guardSingleInstance({
  start,
  showBlocked,
  locks = globalThis.navigator?.locks,
  reload = () => location.reload(),
}: SingleInstanceOptions): void {
  if (!locks) {
    start()
    return
  }

  let settled = false
  const settle = (action: () => void) => {
    if (!settled) {
      settled = true
      clearTimeout(fallback)
      action()
    }
  }
  const fallback = setTimeout(() => settle(start), LOCK_FALLBACK_MS)

  try {
    locks
      .request(ROOM_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (lock) {
          settle(start)
          return holdForever()
        }
        settle(() => {
          showBlocked()
          // Attente du verrou : accordé quand l'autre page se ferme, puis rechargement (le verrou
          // reste tenu par cette page jusqu'à son remplacement).
          locks
            .request(ROOM_LOCK_NAME, () => {
              reload()
              return holdForever()
            })
            .catch(() => undefined)
        })
        return undefined
      })
      .catch(() => settle(start))
  } catch {
    settle(start)
  }
}
