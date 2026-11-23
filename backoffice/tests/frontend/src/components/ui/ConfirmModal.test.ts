import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// Contourne le mock global de useConfirm pour monter la vraie modale sur le vrai composable.
vi.mock('@/composables/useConfirm', async () => vi.importActual('@/composables/useConfirm'))

import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import { useConfirm } from '@/composables/useConfirm'

function dialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]')
}

function buttonByVariant(variant: string): HTMLButtonElement | null {
  return document.body.querySelector(`[data-test="ui-button"][data-variant="${variant}"]`)
}

const mounted: VueWrapper[] = []

function mountModal(): VueWrapper {
  const wrapper = mountWithFrontendMocks(ConfirmModal)
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  useConfirm().cancel()
  // Chaque instance montée écoute l'état global : on la démonte pour qu'un seul dialogue existe.
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

function pressTab(shiftKey: boolean): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  document.body.querySelector('.confirm-overlay')?.dispatchEvent(event)
  return event
}

async function openDialog(): Promise<{ first: HTMLElement; last: HTMLElement }> {
  mountModal()
  void useConfirm().confirm({ message: 'Question ?', variant: 'danger' })
  await nextTick()

  const buttons = document.body.querySelectorAll<HTMLElement>('[role="dialog"] button')
  return { first: buttons[0]!, last: buttons[buttons.length - 1]! }
}

describe('components/ui/ConfirmModal.vue', () => {
  it('stays hidden until a confirmation is requested', () => {
    mountModal()

    expect(dialog()).toBeNull()
  })

  it('renders the requested title, message and a danger confirm button', async () => {
    mountModal()
    const { confirm } = useConfirm()

    void confirm({
      title: 'Supprimer',
      message: 'Confirmer la suppression ?',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    })
    await nextTick()

    const el = dialog()
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain('Confirmer la suppression ?')
    expect(el?.textContent).toContain('Supprimer')
    expect(buttonByVariant('danger')).not.toBeNull()
  })

  it('resolves true when the confirm button is clicked', async () => {
    mountModal()
    const { confirm } = useConfirm()

    const promise = confirm({ message: 'Question ?', variant: 'danger' })
    await nextTick()

    buttonByVariant('danger')?.click()

    await expect(promise).resolves.toBe(true)
    await nextTick()
    expect(dialog()).toBeNull()
  })

  it('resolves false when the cancel button is clicked', async () => {
    mountModal()
    const { confirm } = useConfirm()

    const promise = confirm({ message: 'Question ?' })
    await nextTick()

    buttonByVariant('default')?.click()

    await expect(promise).resolves.toBe(false)
  })

  it('cancels on the Escape key', async () => {
    mountModal()
    const { confirm } = useConfirm()

    const promise = confirm({ message: 'Question ?' })
    await nextTick()

    const overlay = document.body.querySelector('.confirm-overlay')
    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    await expect(promise).resolves.toBe(false)
  })

  describe('focus trap', () => {
    it('wraps Tab from the last button back to the first', async () => {
      const { first, last } = await openDialog()
      last.focus()

      const event = pressTab(false)

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(first)
    })

    it('wraps Shift+Tab from the first button back to the last', async () => {
      const { first, last } = await openDialog()
      first.focus()

      const event = pressTab(true)

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(last)
    })

    it('leaves Tab alone between the two buttons', async () => {
      const { first } = await openDialog()
      first.focus()

      const event = pressTab(false)

      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(first)
    })
  })
})
