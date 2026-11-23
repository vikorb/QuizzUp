// Importé par `index.ts` avec l'extension .js : Node résout ainsi le build ESM tel quel, alors que
// tsc et Vite rapportent ce nom au fichier .ts.

/** Nombre de salles maximal d'une demande de démonstration (`demo_requests.rooms_count`, CHECK 1..50). */
export const DEMO_REQUEST_ROOMS_MAX = 50 as const

/** Longueur maximale du nom du contact d'une demande de démonstration, en caractères. */
export const DEMO_REQUEST_NAME_MAX = 120 as const

/** Longueur maximale du nom du centre d'une demande de démonstration, en caractères. */
export const DEMO_REQUEST_CENTER_NAME_MAX = 160 as const

/** Longueur maximale de l'adresse e-mail d'une demande de démonstration, en caractères. */
export const DEMO_REQUEST_EMAIL_MAX = 254 as const

/** Longueur maximale du téléphone d'une demande de démonstration, en caractères. */
export const DEMO_REQUEST_PHONE_MAX = 32 as const

/** Motif du téléphone d'une demande de démonstration (6 à `DEMO_REQUEST_PHONE_MAX` caractères). */
export const DEMO_REQUEST_PHONE_PATTERN = /^[+0-9 ().-]{6,32}$/

/** Longueur maximale du message libre d'une demande de démonstration, en caractères. */
export const DEMO_REQUEST_MESSAGE_MAX = 2000 as const
