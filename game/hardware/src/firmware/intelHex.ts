/**
 * Format Intel HEX (https://en.wikipedia.org/wiki/Intel_HEX), limité à ce dont un programme de
 * carte Uno a besoin : enregistrements de données (00) et fin de fichier (01).
 *
 * Choix : les enregistrements d'adresse étendue ou de point d'entrée (02, 03, 04, 05) sont
 * refusés. Un ATmega328P a 32 Kio de flash, adressables sur 16 bits : un `.hex` produit pour lui
 * (avr-objcopy, arduino-cli) n'en contient jamais. En accepter un en silence cacherait un fichier
 * prévu pour une autre puce.
 */

export type IntelHexErrorReason =
  | 'bad_format'
  | 'bad_length'
  | 'bad_checksum'
  | 'unsupported_record'
  | 'address_overflow'
  | 'after_eof'
  | 'missing_eof'
  | 'no_data'

/** Fichier Intel HEX invalide : `line` (à partir de 1) et `reason` disent où et pourquoi. */
export class IntelHexError extends Error {
  readonly line: number
  readonly reason: IntelHexErrorReason

  constructor(reason: IntelHexErrorReason, line: number, detail: string) {
    super(`Intel HEX, ligne ${line} : ${detail}`)
    this.name = 'IntelHexError'
    this.reason = reason
    this.line = line
  }
}

/** Adresses sur 16 bits : au plus 64 Kio. */
const ADDRESS_SPACE = 0x1_0000
const EMPTY_BYTE = 0xff
const RECORD_DATA = 0x00
const RECORD_EOF = 0x01
/** Octets de données par ligne à l'écriture (usage courant d'avr-objcopy). */
const BYTES_PER_RECORD = 16

const checksum = (bytes: number[]) =>
  (0x100 - (bytes.reduce((sum, byte) => sum + byte, 0) & 0xff)) & 0xff

/**
 * Lit un fichier Intel HEX et renvoie l'image mémoire, de l'adresse 0 au dernier octet écrit ;
 * les trous valent 0xFF (flash effacée). Un fichier sans donnée donne une image vide.
 */
export function parseIntelHex(text: string): Uint8Array {
  const image = new Uint8Array(ADDRESS_SPACE).fill(EMPTY_BYTE)
  let end = 0
  let eofLine = 0
  const lines = text.split(/\r?\n/)

  lines.forEach((raw, index) => {
    const line = index + 1
    const record = raw.trim()
    if (record === '') {
      return
    }
    if (eofLine > 0) {
      throw new IntelHexError(
        'after_eof',
        line,
        `contenu après la fin de fichier (ligne ${eofLine})`
      )
    }
    if (!record.startsWith(':') || !/^:(?:[0-9A-Fa-f]{2})+$/.test(record)) {
      throw new IntelHexError(
        'bad_format',
        line,
        'ligne illisible (« : » puis des octets en hexadécimal)'
      )
    }
    const bytes = (record.slice(1).match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16))
    // Octets : nombre, adresse (2), type, données, somme de contrôle.
    const [count = 0, high = 0, low = 0, type = 0] = bytes
    if (bytes.length !== count + 5) {
      throw new IntelHexError(
        'bad_length',
        line,
        `${count} octet(s) annoncé(s), ${Math.max(0, bytes.length - 5)} présent(s)`
      )
    }
    if ((bytes.reduce((sum, byte) => sum + byte, 0) & 0xff) !== 0) {
      throw new IntelHexError('bad_checksum', line, 'somme de contrôle fausse')
    }
    if (type === RECORD_EOF) {
      eofLine = line
      return
    }
    if (type !== RECORD_DATA) {
      throw new IntelHexError(
        'unsupported_record',
        line,
        `enregistrement de type ${type.toString(16).padStart(2, '0')} non pris en charge (données et fin seulement)`
      )
    }
    const address = (high << 8) | low
    if (address + count > ADDRESS_SPACE) {
      throw new IntelHexError('address_overflow', line, 'données au-delà de 64 Kio')
    }
    image.set(bytes.slice(4, 4 + count), address)
    end = Math.max(end, address + count)
  })

  if (eofLine === 0) {
    throw new IntelHexError('missing_eof', lines.length, 'fin de fichier (:00000001FF) absente')
  }
  return image.slice(0, end)
}

/** Écrit une image (adresse 0) en Intel HEX, tous les octets, sans rien omettre. */
export function writeIntelHex(image: Uint8Array): string {
  if (image.length > ADDRESS_SPACE) {
    throw new RangeError('Image de plus de 64 Kio : Intel HEX sans adresse étendue impossible')
  }
  const lines: string[] = []
  for (let address = 0; address < image.length; address += BYTES_PER_RECORD) {
    const data = [...image.subarray(address, address + BYTES_PER_RECORD)]
    const body = [data.length, address >> 8, address & 0xff, RECORD_DATA, ...data]
    lines.push(toRecord([...body, checksum(body)]))
  }
  lines.push(':00000001FF')
  return `${lines.join('\n')}\n`
}

const toRecord = (bytes: number[]) =>
  `:${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
