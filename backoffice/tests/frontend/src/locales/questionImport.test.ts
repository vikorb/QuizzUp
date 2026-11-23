import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/questionImport.json', {
  eager: true,
}) as Record<string, { default: { questionImport: Messages } }>

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`))
    )
  )
}

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()

const fr = flatten(modules['/frontend/src/locales/fr/questionImport.json']!.default.questionImport)
const en = flatten(modules['/frontend/src/locales/en/questionImport.json']!.default.questionImport)

describe('locales — questionImport', () => {
  it('has the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
  })

  it('has no empty text', () => {
    expect(Object.values(fr).filter((text) => text.trim() === '')).toEqual([])
    expect(Object.values(en).filter((text) => text.trim() === '')).toEqual([])
  })

  // vue-i18n lit « | » comme un séparateur de pluriel : sans plusieurs formes voulues, il faut
  // l'écrire {'|'}, sinon seul le texte après la barre s'affiche.
  it("writes the pipe of an error text as {'|'}", () => {
    for (const messages of [fr, en]) {
      const unescaped = Object.entries(messages).filter(
        ([key, text]) => key.startsWith('errors.') && /\|/.test(text.replaceAll("{'|'}", ''))
      )

      expect(unescaped).toEqual([])
    }
  })

  it('gives the same placeholders to both languages', () => {
    for (const key of Object.keys(fr)) {
      expect(placeholders(en[key]!), key).toEqual(placeholders(fr[key]!))
    }
  })
})
