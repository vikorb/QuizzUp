import { describe, expect, it } from 'vitest'

import { createTranslator, detectLocale } from '@/public/i18n'
import { joinMessages, NOTICE_PARAMS } from '@/public/join/messages'

describe('public/i18n', () => {
  it.each([
    [['fr-FR', 'en'], 'fr'],
    [['fr'], 'fr'],
    [['en-US', 'fr'], 'en'],
    [['de-DE'], 'en'],
    [[], 'fr'],
  ])('picks the locale of %j: %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected)
  })

  it('fills the {parameters} of a text and leaves nothing behind', () => {
    const t = createTranslator(
      { fr: { hello: 'Bonjour {name} ({n})' }, en: { hello: 'Hi {name}' } },
      'fr'
    )

    expect(t('hello', { name: 'Léa', n: 2 })).toBe('Bonjour Léa (2)')
    expect(t('hello')).toBe('Bonjour  ()')
  })

  it('translates with the chosen locale', () => {
    const messages = { fr: { hello: 'Bonjour' }, en: { hello: 'Hello' } }

    expect(createTranslator(messages, 'en')('hello')).toBe('Hello')
  })
})

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('public/join/messages', () => {
  it('has the same keys in fr and en, none empty', () => {
    expect(Object.keys(joinMessages.en).sort()).toEqual(Object.keys(joinMessages.fr).sort())

    for (const locale of ['fr', 'en'] as const) {
      for (const [key, text] of Object.entries(joinMessages[locale])) {
        expect(text.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('uses the same {parameters} in both languages', () => {
    for (const key of Object.keys(joinMessages.fr) as (keyof typeof joinMessages.fr)[]) {
      expect(placeholders(joinMessages.en[key]), key).toEqual(placeholders(joinMessages.fr[key]))
    }
  })

  it('quotes the retention delays of the server in the notice', () => {
    for (const locale of ['fr', 'en'] as const) {
      const t = createTranslator(joinMessages, locale)

      expect(t('noticeText', NOTICE_PARAMS)).toContain(`${NOTICE_PARAMS.years}`)
      expect(t('noticeText', NOTICE_PARAMS)).toContain(`${NOTICE_PARAMS.hours}`)
      expect(t('noticeText', NOTICE_PARAMS)).not.toContain('{')
    }
  })
})
