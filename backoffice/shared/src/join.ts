/**
 * Accueil des joueurs par lien et QR code (lot 2) : le personnel ouvre un lien sur la partie en
 * attente, les joueurs s'inscrivent depuis leur téléphone, le personnel valide chaque demande.
 */

/** Durée de validité d'un lien d'inscription, à compter de son ouverture ou de sa régénération. */
export const JOIN_LINK_TTL_MINUTES = 180 as const

/** Taille du jeton d'un lien, en octets aléatoires (encodés en base64url, 43 caractères). */
export const JOIN_TOKEN_BYTES = 32 as const

/** Une demande d'inscription non validée est supprimée au bout de ce délai (purge RGPD). */
export const JOIN_REGISTRATION_MAX_AGE_HOURS = 24 as const

/** Demandes d'inscription en attente au plus par partie : au-delà, le lien répond `join_full`. */
export const JOIN_MAX_PENDING_REGISTRATIONS = 12 as const

/** Longueur maximale du prénom saisi sur le téléphone (le backoffice accepte jusqu'à 100). */
export const JOIN_DISPLAY_NAME_MAX_LENGTH = 30 as const
