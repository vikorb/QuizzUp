import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
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

afterEach(() => {
  useConfirm().cancel()
})

describe('components/ui/ConfirmModal.vue', () => {
  it('stays hidden until a confirmation is requested', () => {
    mountWithFrontendMocks(ConfirmModal)

    expect(dialog()).toBeNull()
  })

  it('renders the requested title, message and a danger confirm button', async () => {
    mountWithFrontendMocks(ConfirmModal)
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
    mountWithFrontendMocks(ConfirmModal)
    const { confirm } = useConfirm()

    const promise = confirm({ message: 'Question ?', variant: 'danger' })
    await nextTick()

    buttonByVariant('danger')?.click()

    await expect(promise).resolves.toBe(true)
    await nextTick()
    expect(dialog()).toBeNull()
  })

  it('resolves false when the cancel button is clicked', async () => {
    mountWithFrontendMocks(ConfirmModal)
    const { confirm } = useConfirm()

    const promise = confirm({ message: 'Question ?' })
    await nextTick()

    buttonByVariant('default')?.click()

    await expect(promise).resolves.toBe(false)
  })

  it('cancels on the Escape key', async () => {
    mountWithFrontendMocks(ConfirmModal)
    const { confirm } = useConfirm()

    const promise = confirm({ message: 'Question ?' })
    await nextTick()

    const overlay = document.body.querySelector('.confirm-overlay')
    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    await expect(promise).resolves.toBe(false)
  })
})
