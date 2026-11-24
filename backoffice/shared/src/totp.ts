/**
 * Double authentification TOTP du superadmin (lot 12d) : les valeurs que le serveur et les écrans de
 * connexion lisent tous les deux. Le reste (période, fenêtre, limites d'essais) reste côté serveur.
 */

/** Nombre de chiffres d'un code TOTP ; tout autre format saisi est pris pour un code de secours. */
export const TOTP_CODE_LENGTH = 6

/** Nombre de codes de secours remis à la fin de l'enrôlement. */
export const TOTP_RECOVERY_CODES_COUNT = 10

/** Étape suivante demandée par `POST /login` à un superadmin : saisir un code, ou s'enrôler. */
export const LOGIN_MFA_STEPS = ['totp', 'enroll'] as const
export type LoginMfaStep = (typeof LOGIN_MFA_STEPS)[number]
