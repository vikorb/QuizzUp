import { GAME_COMMAND_REFUSALS } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/live.json', { eager: true }) as Record<
  string,
  { default: { live: Messages } }
>

const live = (locale: 'fr' | 'en'): Messages =>
  modules[`/frontend/src/locales/${locale}/live.json`]!.default.live

const leaves = (messages: Messages, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`)
  )

describe('locales live.json (commandes à distance)', () => {
  it('has the same keys in fr and en', () => {
    expect(leaves(live('en')).sort()).toEqual(leaves(live('fr')).sort())
  })

  it.each(['fr', 'en'] as const)(
    '%s : un texte par code d’erreur du serveur et par résultat de commande',
    (locale) => {
      const keys = leaves(live(locale))

      for (const code of ['room_not_controllable', 'too_many_requests', 'command_id_conflict']) {
        expect(keys, code).toContain(`command.error.${code}`)
      }

      expect(keys).toContain('command.result.expired')
      expect(keys).toContain('command.result.refused')
    }
  )

  it.each(['fr', 'en'] as const)(
    '%s : exactement un texte par motif de refus du contrat partagé',
    (locale) => {
      const refusals = leaves(live(locale))
        .filter((key) => key.startsWith('command.refusal.'))
        .map((key) => key.replace('command.refusal.', ''))

      expect(refusals.sort()).toEqual([...GAME_COMMAND_REFUSALS].sort())
    }
  )
})
