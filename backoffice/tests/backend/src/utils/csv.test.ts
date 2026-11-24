import { CsvError, parseCsv } from '@backend/utils/csv'
import { describe, expect, it } from 'vitest'

const fields = (text: string) => parseCsv(text).map((record) => record.fields)

describe('utils/csv.ts', () => {
  it('reads plain records with the line where each one starts', () => {
    expect(parseCsv('a;b\n1;2\n3;4\n')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['1', '2'] },
      { line: 3, fields: ['3', '4'] },
    ])
  })

  it('detects the separator on the header line, ; or ,', () => {
    expect(fields('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
    expect(fields('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
    // Une virgule dans un texte ne change pas le séparateur choisi sur l'en-tête.
    expect(fields('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ])
  })

  it('reads quoted fields, and keeps separators inside them', () => {
    expect(fields('a;b\n"x;y";"z"')).toEqual([
      ['a', 'b'],
      ['x;y', 'z'],
    ])
  })

  it('reads doubled quotes as one quote', () => {
    expect(fields('a;b\n"il dit ""oui""";"""";""')).toEqual([
      ['a', 'b'],
      ['il dit "oui"', '"', ''],
    ])
  })

  it('keeps a line break inside a quoted field and counts the physical lines', () => {
    const records = parseCsv('a;b\n"ligne 1\nligne 2";x\nsuite;y')

    expect(records).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['ligne 1\nligne 2', 'x'] },
      { line: 4, fields: ['suite', 'y'] },
    ])
  })

  it('accepts CRLF and LF, and turns a CRLF inside a quoted field into LF', () => {
    expect(fields('a;b\r\n1;2\r\n"x\r\ny";3\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['x\ny', '3'],
    ])
  })

  it('ignores a UTF-8 BOM', () => {
    expect(fields('﻿a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('ignores empty lines and lines made only of separators', () => {
    expect(parseCsv('\na;b\n\n1;2\n;\n  ;  \n3;4\n\n')).toEqual([
      { line: 2, fields: ['a', 'b'] },
      { line: 4, fields: ['1', '2'] },
      { line: 7, fields: ['3', '4'] },
    ])
  })

  it('keeps the last record when the file has no final line break', () => {
    expect(fields('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('﻿')).toEqual([])
    expect(parseCsv('\n \n')).toEqual([])
  })

  it('only opens a quoted field at the start of a field', () => {
    expect(fields('a;b\n5" de large;x')).toEqual([
      ['a', 'b'],
      ['5" de large', 'x'],
    ])
  })

  it('refuses an unterminated quoted field and gives the line where it starts', () => {
    const run = () => parseCsv('a;b\n1;2\n3;"jamais fermé\nsuite\n')

    expect(run).toThrow(CsvError)
    expect(run).toThrow(expect.objectContaining({ code: 'csv_field_unterminated', line: 3 }))
  })
})
