import { vi } from 'vitest'
import { reactive, readonly } from 'vue'

import type { ConfirmOptions, ConfirmState } from '@/composables/useConfirm'

// Flag pilotable : détermine la résolution de confirm() dans les tests.
// Par défaut la confirmation est ACCEPTÉE (true) pour ne pas bloquer les scénarios nominaux.
let confirmResult = true

const state = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  variant: 'default',
})

// Mock de confirm() : résout selon confirmResult sans afficher de dialogue.
export const confirmMock = vi.fn(
  async (_options: ConfirmOptions): Promise<boolean> => confirmResult
)

export const acceptMock = vi.fn(() => {
  state.open = false
})

export const cancelMock = vi.fn(() => {
  state.open = false
})

export const useConfirmMock = vi.fn(() => ({
  state: readonly(state),
  confirm: confirmMock,
  accept: acceptMock,
  cancel: cancelMock,
}))

/**
 * Pilote la réponse de la prochaine (et des suivantes) confirmation.
 * `setConfirmResult(false)` simule une annulation par l'utilisateur.
 */
export function setConfirmResult(value: boolean): void {
  confirmResult = value
}

export function resetConfirmMock(): void {
  confirmResult = true
  state.open = false
  state.title = ''
  state.message = ''
  state.confirmLabel = ''
  state.cancelLabel = ''
  state.variant = 'default'

  confirmMock.mockClear()
  acceptMock.mockClear()
  cancelMock.mockClear()
  useConfirmMock.mockClear()
}
