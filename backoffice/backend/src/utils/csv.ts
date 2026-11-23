/** Un enregistrement CSV : ses champs et la ligne physique où il commence (la première est 1). */
export type CsvRecord = {
  line: number
  fields: string[]
}

export class CsvError extends Error {
  constructor(
    public readonly code: 'csv_field_unterminated',
    public readonly line: number
  ) {
    super(code)
    this.name = 'CsvError'
  }
}

function countOf(text: string, char: string): number {
  return text.split(char).length - 1
}

/**
 * Analyse un CSV (RFC 4180) : champs entre guillemets, guillemets doublés, retours à la ligne
 * dans un champ, fins de ligne CRLF ou LF, BOM UTF-8 ignoré. Le séparateur (`;` ou `,`) est lu
 * sur la première ligne non vide. Les lignes vides (ou faites de séparateurs seuls) sont
 * ignorées. Un guillemet n'ouvre un champ qu'en début de champ ; ailleurs il reste un caractère.
 * Lève `CsvError` si un champ entre guillemets n'est jamais refermé.
 */
export function parseCsv(input: string): CsvRecord[] {
  const text = input.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  const firstLine = text.split('\n').find((candidate) => candidate.trim() !== '') ?? ''
  const separator = countOf(firstLine, ';') > countOf(firstLine, ',') ? ';' : ','

  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let quoteLine = 1

  const endRecord = () => {
    fields.push(field)

    if (fields.some((value) => value.trim() !== '')) {
      records.push({ line: recordLine, fields })
    }

    fields = []
    field = ''
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!

    if (quoted) {
      if (char !== '"') {
        line += char === '\n' ? 1 : 0
        field += char
      } else if (text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = false
      }
    } else if (char === '"' && field === '') {
      quoted = true
      quoteLine = line
    } else if (char === separator) {
      fields.push(field)
      field = ''
    } else if (char === '\n') {
      endRecord()
      line += 1
      recordLine = line
    } else {
      field += char
    }
  }

  if (quoted) {
    throw new CsvError('csv_field_unterminated', quoteLine)
  }

  endRecord()

  return records
}
