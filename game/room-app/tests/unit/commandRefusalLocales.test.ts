import { GAME_COMMAND_REFUSALS } from '@quizzup/shared'

import { createAppI18n } from '@/plugins/i18n'

describe('messages de refus d’une commande de pilotage', () => {
  it.each(['fr', 'en'])('%s : un message traduit pour chaque motif de refus', (locale) => {
    const { global } = createAppI18n()

    for (const code of GAME_COMMAND_REFUSALS) {
      const key = `room.command.refused.${code}`
      expect(global.te(key, locale), key).toBe(true)
      expect(global.t(key, {}, { locale }), key).not.toBe(key)
    }
  })

  it.each(['fr', 'en'])(
    '%s : aucun message pour un motif que le contrat ne connaît plus',
    (locale) => {
      const { global } = createAppI18n()
      const messages = global.getLocaleMessage(locale) as {
        room: { command: { refused: Record<string, string> } }
      }

      expect(Object.keys(messages.room.command.refused).sort()).toEqual(
        [...GAME_COMMAND_REFUSALS].sort()
      )
    }
  )
})
