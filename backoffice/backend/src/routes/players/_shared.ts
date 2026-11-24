import type { ExportedPlayer } from './_queries'

/** Séparateur de l'export : le point-virgule, que l'Excel français ouvre sans assistant. */
const CSV_SEPARATOR = ';'
const CSV_BOM = '\uFEFF'

/** En-tête de l'export des joueurs qui acceptent les offres. */
export const PLAYERS_CSV_HEADER = [
  'email',
  'prenom',
  'derniere_partie',
  'parties',
  'consentement_offres_le',
] as const

// Une cellule qui commence par l'un de ces caractères est lue comme une formule par un tableur.
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Injection de formule : un nom saisi par un inconnu sur son téléphone (`=HYPERLINK(...)`) ne doit
 * pas s'exécuter dans le tableur du centre. La cellule est préfixée d'une apostrophe : la formule
 * devient du texte. Limite connue de cette parade : à l'ouverture d'un CSV, Excel affiche
 * l'apostrophe (elle n'est masquée que lorsqu'on la saisit dans une cellule).
 */
export function neutralizeFormula(cell: string): string {
  return FORMULA_START.test(cell) ? `'${cell}` : cell
}

/** Une cellule de l'export : formule neutralisée, puis guillemets si le texte les exige (RFC 4180). */
export function toCsvCell(value: string | number): string {
  const cell = neutralizeFormula(String(value))

  return /[;"\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
}

/** CSV UTF-8 avec BOM, fins de ligne CRLF : l'en-tête puis un joueur par ligne. */
export function buildPlayersCsv(players: ExportedPlayer[]): string {
  const lines = [
    PLAYERS_CSV_HEADER.join(CSV_SEPARATOR),
    ...players.map((player) =>
      [
        player.email,
        player.displayName,
        player.lastPlayedAt,
        player.sessions,
        player.marketingConsentAt,
      ]
        .map(toCsvCell)
        .join(CSV_SEPARATOR)
    ),
  ]

  return `${CSV_BOM}${lines.join('\r\n')}\r\n`
}
