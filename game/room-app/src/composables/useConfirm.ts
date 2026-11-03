import { reactive, readonly } from 'vue'

export type ConfirmVariant = 'default' | 'danger'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

export interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  variant: ConfirmVariant
}

// État singleton : une seule instance de <ConfirmModal> est montée dans App.vue et
// lit cet état. N'importe quel composant peut déclencher une confirmation via confirm().
const state = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  variant: 'default',
})

let resolver: ((value: boolean) => void) | null = null

function settle(result: boolean): void {
  if (!state.open) {
    return
  }

  state.open = false

  const resolve = resolver
  resolver = null
  resolve?.(result)
}

function confirm(options: ConfirmOptions): Promise<boolean> {
  // Une confirmation déjà ouverte est résolue (annulée) avant d'en ouvrir une nouvelle.
  settle(false)

  state.title = options.title ?? ''
  state.message = options.message
  state.confirmLabel = options.confirmLabel ?? ''
  state.cancelLabel = options.cancelLabel ?? ''
  state.variant = options.variant ?? 'default'
  state.open = true

  return new Promise<boolean>((resolve) => {
    resolver = resolve
  })
}

function accept(): void {
  settle(true)
}

function cancel(): void {
  settle(false)
}

export function useConfirm() {
  return {
    state: readonly(state),
    confirm,
    accept,
    cancel,
  }
}
