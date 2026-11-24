import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/gameJoin.json', {
  eager: true,
}) as Record<string, { default: { gameJoin: Messages } }>

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

const fr = flatten(modules['/frontend/src/locales/fr/gameJoin.json']!.default.gameJoin)
const en = flatten(modules['/frontend/src/locales/en/gameJoin.json']!.default.gameJoin)

describe('locales: gameJoin', () => {
  it('has the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
  })

  it('has no empty text', () => {
    expect(Object.values(fr).filter((text) => text.trim() === '')).toEqual([])
    expect(Object.values(en).filter((text) => text.trim() === '')).toEqual([])
  })

  it('uses the same placeholders in both languages', () => {
    for (const [key, text] of Object.entries(fr)) {
      expect(placeholders(en[key]!), key).toEqual(placeholders(text))
    }
  })

  // Seul le texte du compteur a deux formes voulues (« | ») ; ailleurs la barre couperait le texte.
  it('writes a plural bar only in the counter', () => {
    for (const messages of [fr, en]) {
      const withBar = Object.entries(messages).filter(([, text]) => text.includes('|'))

      expect(withBar.map(([key]) => key)).toEqual(['count'])
    }
  })
})
