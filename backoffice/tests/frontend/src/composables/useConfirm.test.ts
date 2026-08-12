import { describe, expect, it, vi } from 'vitest'

import type * as UseConfirmModule from '@/composables/useConfirm'

// Contourne le mock global (registerFrontendMocks) pour tester le vrai composable.
const { useConfirm } = await vi.importActual<typeof UseConfirmModule>('@/composables/useConfirm')

describe('composables/useConfirm', () => {
  it('opens the dialog with the provided options and resolves true on accept', async () => {
    const { state, confirm, accept } = useConfirm()

    const promise = confirm({
      title: 'Titre',
      message: 'Message',
      confirmLabel: 'OK',
      cancelLabel: 'Non',
      variant: 'danger',
    })

    expect(state.open).toBe(true)
    expect(state.title).toBe('Titre')
    expect(state.message).toBe('Message')
    expect(state.confirmLabel).toBe('OK')
    expect(state.cancelLabel).toBe('Non')
    expect(state.variant).toBe('danger')

    accept()

    await expect(promise).resolves.toBe(true)
    expect(state.open).toBe(false)
  })

  it('resolves false when cancelled', async () => {
    const { confirm, cancel } = useConfirm()

    const promise = confirm({ message: 'Message' })
    cancel()

    await expect(promise).resolves.toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const { state, confirm, cancel } = useConfirm()

    confirm({ message: 'Only message' })

    expect(state.title).toBe('')
    expect(state.confirmLabel).toBe('')
    expect(state.cancelLabel).toBe('')
    expect(state.variant).toBe('default')

    cancel()
  })

  it('auto-cancels a pending confirmation when a new one opens', async () => {
    const { confirm, accept } = useConfirm()

    const first = confirm({ message: 'first' })
    const second = confirm({ message: 'second' })

    await expect(first).resolves.toBe(false)

    accept()

    await expect(second).resolves.toBe(true)
  })
})
