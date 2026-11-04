import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'
import FinishedScreen from '@/views/game/FinishedScreen.vue'

async function mountScreen(sync?: 'sending' | 'sent' | 'offline' | 'auth' | null, locale = 'fr') {
  setCurrentLocale(locale as 'fr' | 'en')
  await nextTick() // la langue de vue-i18n suit la ref au tick suivant
  return mount(FinishedScreen, {
    props: { lines: [], aborted: false, noContent: false, sync },
    global: { plugins: [createAppI18n()] },
  })
}

describe('podium : état de l’envoi des résultats', () => {
  afterEach(() => setCurrentLocale('fr'))

  it('n’affiche rien sans envoi au backoffice (démo, partie hors backoffice)', async () => {
    expect((await mountScreen()).find('[data-test="finish-sync"]').exists()).toBe(false)
    expect((await mountScreen(null)).find('[data-test="finish-sync"]').exists()).toBe(false)
  })

  it.each([
    ['sending', 'Envoi des résultats…'],
    ['sent', 'Résultats enregistrés'],
    ['offline', 'Hors ligne : résultats en attente, nouvel essai automatique'],
    ['auth', 'Salle déconnectée : résultats en attente, ils seront envoyés à la reconnexion'],
  ] as const)('affiche discrètement l’état « %s »', async (sync, text) => {
    const note = (await mountScreen(sync)).find('[data-test="finish-sync"]')

    expect(note.text()).toBe(text)
    expect(note.attributes('role')).toBe('status')
    expect(note.classes()).toContain(`finished__sync--${sync}`)
  })

  it('est traduit en anglais', async () => {
    expect((await mountScreen('offline', 'en')).find('[data-test="finish-sync"]').text()).toBe(
      'Offline: results pending, retrying automatically'
    )
    expect((await mountScreen('sent', 'en')).find('[data-test="finish-sync"]').text()).toBe(
      'Results saved'
    )
  })
})
