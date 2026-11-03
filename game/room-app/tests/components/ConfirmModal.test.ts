import { flushPromises } from '@vue/test-utils'

import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import { useConfirm } from '@/composables/useConfirm'

import { mountWithApp } from '../_helpers/mount'

function dialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]')
}

describe('ConfirmModal', () => {
  afterEach(() => useConfirm().cancel())

  it('reste cachée tant qu’aucune confirmation n’est demandée', async () => {
    await mountWithApp(ConfirmModal)
    expect(dialog()).toBeNull()
  })

  it('confirme au clic et annule avec Échap', async () => {
    await mountWithApp(ConfirmModal)
    const { confirm } = useConfirm()

    const accepted = confirm({ message: 'Arrêter la partie ?', variant: 'danger' })
    await flushPromises()
    expect(dialog()?.textContent).toContain('Arrêter la partie ?')
    const buttons = [...(dialog()?.querySelectorAll('button') ?? [])]
    buttons.find((button) => button.textContent?.includes('Confirmer'))?.click()
    await expect(accepted).resolves.toBe(true)

    const cancelled = confirm({ message: 'Abandonner ?' })
    await flushPromises()
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(cancelled).resolves.toBe(false)
  })

  it('garde le focus dans la modale (Tab / Maj+Tab)', async () => {
    await mountWithApp(ConfirmModal)
    void useConfirm().confirm({ message: 'Question ?' })
    await flushPromises()

    const buttons = [...(dialog()?.querySelectorAll('button') ?? [])]
    const first = buttons[0] as HTMLButtonElement
    const last = buttons.at(-1) as HTMLButtonElement

    last.focus()
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(first)

    first.focus()
    dialog()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )
    expect(document.activeElement).toBe(last)
  })
})
