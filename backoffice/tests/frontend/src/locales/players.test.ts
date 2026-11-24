import { describe, expect, it } from 'vitest'

import { getPlayersErrorKey } from '@/utils/player/errors'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/players.json', {
  eager: true,
}) as Record<string, { default: { players: Messages } }>

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

const fr = flatten(modules['/frontend/src/locales/fr/players.json']!.default.players)
const en = flatten(modules['/frontend/src/locales/en/players.json']!.default.players)

describe('locales — players', () => {
  it('has the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
  })

  it('has no empty text', () => {
    expect(Object.values(fr).filter((text) => text.trim() === '')).toEqual([])
    expect(Object.values(en).filter((text) => text.trim() === '')).toEqual([])
  })

  it('gives the same placeholders to both languages', () => {
    for (const key of Object.keys(fr)) {
      expect(placeholders(en[key]!), key).toEqual(placeholders(fr[key]!))
    }
  })

  // Le tableau, le bandeau et la fenêtre de confirmation lisent ces clés avec le nom du joueur.
  it.each(['actions.unsubscribe', 'actions.erase', 'erase.message', 'banners.unsubscribed'])(
    'gives the player name to %s',
    (key) => {
      expect(placeholders(fr[key]!)).toContain('name')
      expect(placeholders(en[key]!)).toContain('name')
    }
  )

  it('tells the erasure is final, in both languages', () => {
    expect(fr['erase.message']).toMatch(/définitif/)
    expect(en['erase.message']).toMatch(/permanent/)
  })

  // L'écran affiche `players.errors.<clé du code>` : un code sans texte s'afficherait brut.
  it.each([
    'unauthorized',
    'forbidden',
    'api_unreachable',
    'invalid_json',
    'invalid_params',
    'invalid_body',
    'player_not_found',
    'server_error',
  ])('has an error text for the code %s in both languages', (code) => {
    const key = getPlayersErrorKey(code).replace(/^players\./, '')

    expect(fr[key], `fr ${code}`).toBeTruthy()
    expect(en[key], `en ${code}`).toBeTruthy()
  })

  // La carte de la liste passe par `getApiErrorKey`, qui ne connaît que ces clés.
  it.each([
    'missingToken',
    'unauthorized',
    'forbidden',
    'apiUnreachable',
    'invalidJson',
    'invalidBody',
    'serverError',
  ])('has the list error text errors.%s in both languages', (key) => {
    expect(fr[`errors.${key}`]).toBeTruthy()
    expect(en[`errors.${key}`]).toBeTruthy()
  })

  it('has a menu entry in both languages', () => {
    expect(fr.menu).toBeTruthy()
    expect(en.menu).toBeTruthy()
  })
})
