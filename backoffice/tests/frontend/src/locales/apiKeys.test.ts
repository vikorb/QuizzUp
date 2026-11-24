import { describe, expect, it } from 'vitest'

import { getApiKeyErrorKey } from '@/utils/apiKey/errors'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/apiKeys.json', {
  eager: true,
}) as Record<string, { default: { apiKeys: Messages } }>

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

const fr = flatten(modules['/frontend/src/locales/fr/apiKeys.json']!.default.apiKeys, 'apiKeys.')
const en = flatten(modules['/frontend/src/locales/en/apiKeys.json']!.default.apiKeys, 'apiKeys.')

describe('locales — apiKeys', () => {
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

  // Les codes des routes `api-keys` et `api-logs` : un code sans texte s'afficherait brut.
  it.each([
    'unauthorized',
    'forbidden',
    'not_found',
    'api_unreachable',
    'invalid_json',
    'invalid_params',
    'invalid_body',
    'invalid_query',
    'api_key_limit_reached',
    'company_inactive',
    'company_deleted',
    'server_error',
  ])('has an error text for the server code %s in both languages', (code) => {
    const key = getApiKeyErrorKey(code)

    expect(fr[key], `fr ${code}`).toBeTruthy()
    expect(en[key], `en ${code}`).toBeTruthy()
  })

  it('falls back on the server error for an unknown code', () => {
    expect(getApiKeyErrorKey('something_new')).toBe('apiKeys.errors.serverError')
    expect(getApiKeyErrorKey(null)).toBe('apiKeys.errors.serverError')
  })
})
