// Importé par `index.ts` avec l'extension .js : Node résout ainsi le build ESM tel quel, alors que
// tsc et Vite rapportent ce nom au fichier .ts.

/** Nombre de salles maximal d'une demande de démonstration (`demo_requests.rooms_count`, CHECK 1..50). */
export const DEMO_REQUEST_ROOMS_MAX = 50 as const

/** Longueur maximale du message libre d'une demande de démonstration, en caractères. */
export const DEMO_REQUEST_MESSAGE_MAX = 2000 as const
