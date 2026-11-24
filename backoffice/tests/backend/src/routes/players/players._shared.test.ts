import {
  buildPlayersCsv,
  neutralizeFormula,
  PLAYERS_CSV_HEADER,
  toCsvCell,
} from '@backend/routes/players/_shared'
import { describe, expect, it } from 'vitest'

const PLAYER = {
  email: 'jean@exemple.test',
  displayName: 'Jean',
  lastPlayedAt: '2026-11-20T18:30:00.000Z',
  sessions: 3,
  marketingConsentAt: '2026-10-01T10:00:00.000Z',
}

describe('neutralizeFormula', () => {
  it.each([
    ['=', '=1+1'],
    ['+', '+33 6 00 00 00 00'],
    ['-', '-2+3'],
    ['@', '@SUM(A1)'],
    ['a tab', '\t=1+1'],
    ['a carriage return', '\r=1+1'],
  ])('prefixes a cell that starts with %s with an apostrophe', (_label, cell) => {
    expect(neutralizeFormula(cell)).toBe(`'${cell}`)
  })

  it('leaves an ordinary cell alone, even with a formula character inside', () => {
    expect(neutralizeFormula('Jean')).toBe('Jean')
    expect(neutralizeFormula('Anne-Marie')).toBe('Anne-Marie')
    expect(neutralizeFormula('a=b')).toBe('a=b')
    expect(neutralizeFormula('')).toBe('')
  })
})

describe('toCsvCell', () => {
  it('quotes a cell that holds the separator, a quote or a line break, doubling the quotes', () => {
    expect(toCsvCell('a;b')).toBe('"a;b"')
    expect(toCsvCell('dit "oui"')).toBe('"dit ""oui"""')
    expect(toCsvCell('ligne 1\nligne 2')).toBe('"ligne 1\nligne 2"')
  })

  it('neutralizes the formula before quoting', () => {
    expect(toCsvCell('=HYPERLINK("http://x.test";"clic")')).toBe(
      '"\'=HYPERLINK(""http://x.test"";""clic"")"'
    )
  })

  it('writes a number as it is', () => {
    expect(toCsvCell(3)).toBe('3')
  })
})

describe('buildPlayersCsv', () => {
  it('starts with a UTF-8 BOM and the header, then one CRLF line per player, `;` separated', () => {
    const csv = buildPlayersCsv([PLAYER])

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toBe(
      '\uFEFFemail;prenom;derniere_partie;parties;consentement_offres_le\r\n' +
        'jean@exemple.test;Jean;2026-11-20T18:30:00.000Z;3;2026-10-01T10:00:00.000Z\r\n'
    )
    expect(PLAYERS_CSV_HEADER).toHaveLength(5)
  })

  it('writes only the header when nobody accepted the offers', () => {
    expect(buildPlayersCsv([])).toBe(
      '\uFEFFemail;prenom;derniere_partie;parties;consentement_offres_le\r\n'
    )
  })

  it('neutralizes a name typed by a stranger and an address that starts like a formula', () => {
    const csv = buildPlayersCsv([
      { ...PLAYER, displayName: '=cmd|"/c calc"!A1', email: '+x@exemple.test' },
      { ...PLAYER, displayName: '@SUM(1)' },
    ])
    const lines = csv.split('\r\n')

    expect(lines[1]!.startsWith('\'+x@exemple.test;"\'=cmd|""/c calc""!A1";')).toBe(true)
    expect(lines[2]!.split(';')[1]).toBe("'@SUM(1)")
  })
})
