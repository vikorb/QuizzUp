import { baseCompile } from '@intlify/message-compiler'
import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/**/*.json', { eager: true }) as Record<
  string,
  { default: Messages }
>

function collect(messages: Messages, prefix = ''): Array<[string, string]> {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : collect(value, `${prefix}${key}.`)
  )
}

const entries = Object.entries(modules).flatMap(([file, module]) =>
  collect(module.default).map(([key, message]) => [file, key, message] as const)
)

describe('locales', () => {
  it('finds the locale files', () => {
    expect(entries.length).toBeGreaterThan(100)
  })

  // Les tests des vues moquent i18n : un « @ » non échappé (« a@b.fr » au lieu de « a{'@'}b.fr »)
  // ne casse qu'au rendu réel. Chaque texte est donc compilé ici avec le compilateur de vue-i18n.
  it('compiles every message with the vue-i18n compiler', () => {
    const invalid = entries.filter(([, , message]) => {
      let failed = false

      baseCompile(message, {
        onError: () => {
          failed = true
        },
      })

      return failed
    })

    expect(invalid.map(([file, key]) => `${file} → ${key}`)).toEqual([])
  })
})
