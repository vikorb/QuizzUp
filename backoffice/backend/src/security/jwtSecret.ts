/** Valeur de `JWT_SECRET` publique (docker-compose de dev, `.env.example`) : jamais en production. */
export const DEV_JWT_SECRET = 'change_me_super_secret'

/** Longueur minimale en production (`openssl rand -hex 32` en donne 64). */
export const JWT_SECRET_MIN_LENGTH = 32

/**
 * Refuse un `JWT_SECRET` faible quand `NODE_ENV=production` : le démarrage de l'API échoue.
 * Hors production (dev, tests), tout secret non vide est accepté.
 */
export function assertJwtSecretIsSafe(secret: string, nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv !== 'production') return

  if (secret === DEV_JWT_SECRET || secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET refusé en production : au moins ${JWT_SECRET_MIN_LENGTH} caractères et ` +
        'différent de la valeur de développement (ex. `openssl rand -hex 32`).'
    )
  }
}
