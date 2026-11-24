import { qrSvg } from '@backend/utils/qrSvg'
import qrcode from 'qrcode-generator'
import { describe, expect, it } from 'vitest'

const QUIET_ZONE = 4

/** Relit la grille de modules noirs d'un SVG rendu (sans la marge), ligne par ligne. */
function readMatrix(svg: string): boolean[][] {
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1])
  const count = size - QUIET_ZONE * 2
  const matrix = Array.from({ length: count }, () => Array<boolean>(count).fill(false))

  for (const [, x, y, length] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let col = 0; col < Number(length); col += 1) {
      matrix[Number(y) - QUIET_ZONE]![Number(x) - QUIET_ZONE + col] = true
    }
  }

  return matrix
}

/** Grille de la bibliothèque pour le même texte, passé en octets UTF-8 (un caractère par octet). */
function referenceMatrix(text: string): boolean[][] {
  const code = qrcode(0, 'M')

  code.addData(Buffer.from(text, 'utf8').toString('latin1'), 'Byte')
  code.make()

  return Array.from({ length: code.getModuleCount() }, (_, row) =>
    Array.from({ length: code.getModuleCount() }, (_cell, col) => code.isDark(row, col))
  )
}

// Motif de repérage 7 x 7 : anneau noir, anneau blanc, carré noir de 3 x 3.
const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111']

const toRows = (matrix: boolean[][], top: number, left: number) =>
  FINDER.map((_, row) =>
    matrix[top + row]!.slice(left, left + 7)
      .map((dark) => (dark ? '1' : '0'))
      .join('')
  )

describe('utils/qrSvg.ts', () => {
  it('renders a standalone SVG: black modules on white, 4-module margin, no script or link', () => {
    const svg = qrSvg('https://bo.quizzup.test/rejoindre/#abc')
    const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1])

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain(`<rect width="${size}" height="${size}" fill="white"/>`)
    expect(svg).toContain('<path fill="black" d="M')
    // Un `#` ouvrirait le fragment d'une adresse `data:` non encodée et casserait l'image.
    expect(svg).not.toContain('#')
    expect(svg).not.toMatch(/<script|href|http:\/\/(?!www\.w3\.org)|https:|url\(|<image/)
    expect((svg.match(/</g) ?? []).length).toBe(4)
    // Version 1 = 21 modules ; 29 avec la marge au minimum.
    expect(size).toBeGreaterThanOrEqual(21 + QUIET_ZONE * 2)
    // La marge reste blanche : aucun trait ne commence dans les 4 premières lignes ou colonnes.
    for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(QUIET_ZONE)
      expect(Number(y)).toBeGreaterThanOrEqual(QUIET_ZONE)
    }
  })

  it('is deterministic', () => {
    expect(qrSvg('same text')).toBe(qrSvg('same text'))
    expect(qrSvg('same text')).not.toBe(qrSvg('other text'))
  })

  it('grows with the text', () => {
    const viewBoxSize = (svg: string) => Number(/viewBox="0 0 (\d+) /.exec(svg)![1])

    expect(viewBoxSize(qrSvg('x'.repeat(300)))).toBeGreaterThan(viewBoxSize(qrSvg('x')))
  })

  it.each([
    ['a plain address', 'https://bo.quizzup.test/rejoindre/#Zm9vYmFyYmF6cXV4'],
    ['a fragment with #', 'https://bo.quizzup.test/bon/#7K2M-9QXD'],
    ['non ASCII characters', 'https://bo.quizzup.test/bon/#é€ 日本 😀'],
    ['a long text', 'https://bo.quizzup.test/?q=' + 'a'.repeat(400)],
  ])('draws the same modules as the library does (%s)', (_label, text) => {
    expect(readMatrix(qrSvg(text))).toEqual(referenceMatrix(text))
  })

  it('draws the three finder patterns of a readable code', () => {
    const matrix = readMatrix(qrSvg('https://bo.quizzup.test/bon/#7K2M-9QXD'))
    const last = matrix.length - 7

    expect(toRows(matrix, 0, 0)).toEqual(FINDER)
    expect(toRows(matrix, 0, last)).toEqual(FINDER)
    expect(toRows(matrix, last, 0)).toEqual(FINDER)
  })

  it('keeps non ASCII characters apart instead of truncating them to 8 bits', () => {
    // Tronqué à 8 bits, `€` (U+20AC) serait lu comme `¬` (U+00AC).
    expect(qrSvg('€')).not.toBe(qrSvg('¬'))
  })
})
