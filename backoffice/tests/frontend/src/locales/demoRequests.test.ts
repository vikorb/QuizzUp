import { describe, expect, it } from 'vitest'

import { getApiErrorKey } from '@/utils/api'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/demoRequests.json', {
  eager: true,
}) as Record<string, { default: { demoRequests: Messages } }>

const indexModules = import.meta.glob('/frontend/src/locales/*/index.json', {
  eager: true,
}) as Record<string, { default: Messages }>

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

const fr = flatten(modules['/frontend/src/locales/fr/demoRequests.json']!.default.demoRequests)
const en = flatten(modules['/frontend/src/locales/en/demoRequests.json']!.default.demoRequests)
const frIndex = flatten(indexModules['/frontend/src/locales/fr/index.json']!.default)
const enIndex = flatten(indexModules['/frontend/src/locales/en/index.json']!.default)

describe('locales — demoRequests', () => {
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

  // La carte affiche `demoRequests.errors.<clé du code>` : un code sans texte s'afficherait brut.
  it.each([
    'missing_token',
    'unauthorized',
    'forbidden',
    'api_unreachable',
    'invalid_json',
    'server_error',
  ])('has a load error text for the code %s in both languages', (code) => {
    const key = getApiErrorKey(code, 'demoRequests.errors').replace(/^demoRequests\./, '')

    expect(fr[key], `fr ${code}`).toBeTruthy()
    expect(en[key], `en ${code}`).toBeTruthy()
  })

  // La bannière lit `errors.<code>` et `success.<code>` de index.json.
  it.each([
    'not_found',
    'forbidden',
    'unauthorized',
    'api_unreachable',
    'server_error',
    'invalid_body',
    'missing_token',
    'invalid_json',
  ])('has a banner error text for the code %s in both languages', (code) => {
    expect(frIndex[`errors.${code}`], `fr ${code}`).toBeTruthy()
    expect(enIndex[`errors.${code}`], `en ${code}`).toBeTruthy()
  })

  it('has a default banner error text in both languages', () => {
    expect(frIndex['errors.default']).toBeTruthy()
    expect(enIndex['errors.default']).toBeTruthy()
  })

  it.each(['demoRequestProcessed', 'demoRequestDeleted'])(
    'has the banner success text %s in both languages',
    (code) => {
      expect(frIndex[`success.${code}`], `fr ${code}`).toBeTruthy()
      expect(enIndex[`success.${code}`], `en ${code}`).toBeTruthy()
    }
  )
})
