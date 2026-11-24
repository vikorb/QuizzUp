import { IntelHexError, parseIntelHex, writeIntelHex } from '@hardware/firmware/intelHex'

// Exemple de la spécification Intel HEX : 16 octets à l'adresse 0x0100.
const WIKIPEDIA_LINE = ':10010000214601360121470136007EFE09D2190140'
const EOF_LINE = ':00000001FF'

const hexOf = (...lines: string[]) => `${lines.join('\n')}\n`

describe('parseIntelHex', () => {
  it('lit les données à leur adresse et comble les trous par 0xFF', () => {
    const image = parseIntelHex(hexOf(WIKIPEDIA_LINE, EOF_LINE))
    expect(image).toHaveLength(0x110)
    expect([...image.subarray(0, 0x100)].every((byte) => byte === 0xff)).toBe(true)
    expect([...image.subarray(0x100, 0x104)]).toEqual([0x21, 0x46, 0x01, 0x36])
  })

  it('accepte les fins de ligne Windows et les lignes vides', () => {
    const image = parseIntelHex(`\r\n${WIKIPEDIA_LINE}\r\n\r\n${EOF_LINE}\r\n\r\n`)
    expect(image).toHaveLength(0x110)
  })

  it('renvoie une image vide pour un fichier sans donnée', () => {
    expect(parseIntelHex(hexOf(EOF_LINE))).toHaveLength(0)
  })
})

describe('writeIntelHex', () => {
  it('écrit des lignes de données avec leur somme de contrôle, puis la fin de fichier', () => {
    expect(writeIntelHex(Uint8Array.of(1, 2, 3))).toBe(':03000000010203F7\n:00000001FF\n')
  })

  it('ne produit que la fin de fichier pour une image vide', () => {
    expect(writeIntelHex(new Uint8Array(0))).toBe(`${EOF_LINE}\n`)
  })

  it('refuse une image plus grande que l’espace d’adresses sur 16 bits', () => {
    expect(() => writeIntelHex(new Uint8Array(0x1_0001))).toThrow(RangeError)
  })

  it('refait la même image à la relecture (octets 0xFF au milieu compris)', () => {
    const image = Uint8Array.from({ length: 300 }, (_value, index) =>
      index % 40 < 8 ? 0xff : index & 0xff
    )
    image[299] = 0x42
    expect(parseIntelHex(writeIntelHex(image))).toEqual(image)
  })

  it('refait la même image à la relecture pour toute la flash d’un Uno, 0xFF de fin compris', () => {
    const image = Uint8Array.from({ length: 32_256 }, (_value, index) => (index * 7) & 0xff)
    image.fill(0xff, 30_000)
    expect(parseIntelHex(writeIntelHex(image))).toEqual(image)
  })
})

describe('parseIntelHex : fichiers invalides', () => {
  const bad = (text: string) => {
    try {
      parseIntelHex(text)
    } catch (error) {
      return error as IntelHexError
    }
    throw new Error('aucune erreur levée')
  }

  it.each([
    [
      'somme de contrôle fausse',
      hexOf(':10010000214601360121470136007EFE09D2190141', EOF_LINE),
      'bad_checksum',
      1,
    ],
    ['ligne sans « : »', hexOf(WIKIPEDIA_LINE, 'bonjour', EOF_LINE), 'bad_format', 2],
    ['hexadécimal impair', hexOf(':0'), 'bad_format', 1],
    ['nombre d’octets faux', hexOf(':0300000001FF', EOF_LINE), 'bad_length', 1],
    [
      'adresse étendue (type 04)',
      hexOf(WIKIPEDIA_LINE, ':020000040000FA', EOF_LINE),
      'unsupported_record',
      2,
    ],
    ['données au-delà de 64 Kio', hexOf(':02FFFF000102FD', EOF_LINE), 'address_overflow', 1],
    ['donnée après la fin de fichier', hexOf(EOF_LINE, WIKIPEDIA_LINE), 'after_eof', 2],
    ['fin de fichier absente', hexOf(WIKIPEDIA_LINE), 'missing_eof', 2],
    ['fichier vide', '', 'missing_eof', 1],
  ] as const)('%s', (_name, text, reason, line) => {
    const error = bad(text)
    expect(error).toBeInstanceOf(IntelHexError)
    expect(error.reason).toBe(reason)
    expect(error.line).toBe(line)
    expect(error.message).toContain(`ligne ${line}`)
  })
})
