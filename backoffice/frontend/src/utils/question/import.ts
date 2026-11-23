import {
  QUESTION_IMPORT_MAX_BYTES,
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'

/** Attribut `accept` du champ fichier : `.csv` d'abord, les types MIME pour les navigateurs qui les connaissent. */
export const IMPORT_FILE_ACCEPT = '.csv,text/csv,application/vnd.ms-excel'

// `application/vnd.ms-excel` : le type qu'un navigateur Windows avec Excel donne à un `.csv`.
const CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel']

export const IMPORT_TEMPLATE_FILE_NAME = 'modele-import-questions.csv'

type ImportFileError = 'csv_content_type_unsupported' | 'csv_empty' | 'file_too_large'

/** Refus avant envoi ; les codes sont ceux des textes `questionImport.errors`. */
export function validateImportFile(
  file: Pick<File, 'name' | 'type' | 'size'>
): ImportFileError | null {
  if (!/\.csv$/i.test(file.name) && !CSV_MIME_TYPES.includes(file.type.toLowerCase())) {
    return 'csv_content_type_unsupported'
  }

  if (file.size === 0) {
    return 'csv_empty'
  }

  return file.size > QUESTION_IMPORT_MAX_BYTES ? 'file_too_large' : null
}

/**
 * Clé du texte d'un code d'erreur ; un code que l'écran ne traduit pas (code de session, erreur
 * inattendue du serveur) retombe sur `server_error`, jamais sur une clé brute à l'écran.
 */
export function getImportErrorKey(code: string, has: (key: string) => boolean): string {
  const key = `questionImport.errors.${code}`

  return has(key) ? key : 'questionImport.errors.server_error'
}

// ponytail: la liste des colonnes vit côté serveur (routes/questions/import.ts), pas dans
// `@quizzup/shared` : à y déplacer pour que modèle et route ne puissent plus diverger.
const TEMPLATE_COLUMNS = [
  'theme',
  'question',
  'kind',
  'answer_1',
  'answer_2',
  'answer_3',
  'answer_4',
  'correct',
  'media_type',
  'media_url',
] as const

export type ImportTemplateTexts = {
  theme: string
  qcmQuestion: string
  trueFalseQuestion: string
  estimateQuestion: string
}

/**
 * Trois lignes d'exemple, une par type de question ; seuls les textes sont traduits.
 * Les valeurs suivent l'ordre de `TEMPLATE_COLUMNS`.
 */
export function getImportTemplateRows(texts: ImportTemplateTexts): string[][] {
  const none = QUESTION_MEDIA_TYPE_NONE

  return [
    [
      texts.theme,
      texts.qcmQuestion,
      QUESTION_KIND_QCM,
      'Paris',
      'Lyon',
      'Marseille',
      'Lille',
      '1',
      none,
      '',
    ],
    [
      texts.theme,
      texts.trueFalseQuestion,
      QUESTION_KIND_TRUE_FALSE,
      'Vrai',
      'Faux',
      '',
      '',
      '2',
      none,
      '',
    ],
    [
      texts.theme,
      texts.estimateQuestion,
      QUESTION_KIND_ESTIMATE,
      '0-100',
      '101-300',
      '301-400',
      '',
      '3',
      none,
      '',
    ],
  ]
}

/** RFC 4180 : un champ qui contient le séparateur, un guillemet ou un retour à la ligne est entre guillemets. */
function escapeCsvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Contenu du modèle : séparateur `;` (Excel en français) et BOM UTF-8, pour qu'Excel lise les
 * accents ; le serveur accepte les deux.
 */
export function buildImportTemplate(texts: ImportTemplateTexts): string {
  const lines = [TEMPLATE_COLUMNS as readonly string[], ...getImportTemplateRows(texts)]

  return `\uFEFF${lines.map((row) => row.map(escapeCsvField).join(';')).join('\r\n')}\r\n`
}
