<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="state.open"
        class="confirm-overlay"
        @click.self="handleCancel"
        @keydown="handleKeydown"
      >
        <div
          ref="dialogRef"
          class="confirm-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="hasTitle ? titleId : undefined"
          :aria-describedby="messageId"
        >
          <h2 v-if="hasTitle" :id="titleId" class="confirm-dialog__title">
            {{ resolvedTitle }}
          </h2>

          <p :id="messageId" class="confirm-dialog__message">
            {{ state.message }}
          </p>

          <div class="confirm-dialog__actions">
            <UiButton ref="cancelRef" variant="default" type="button" @click="handleCancel">
              {{ resolvedCancelLabel }}
            </UiButton>

            <UiButton
              ref="confirmRef"
              :variant="state.variant === 'danger' ? 'danger' : 'primary'"
              type="button"
              @click="handleConfirm"
            >
              {{ resolvedConfirmLabel }}
            </UiButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'

const { t } = useI18n()
const { state, accept, cancel } = useConfirm()

const baseId = useId()
const titleId = `${baseId}-title`
const messageId = `${baseId}-message`

const dialogRef = ref<HTMLElement | null>(null)
const cancelRef = ref<InstanceType<typeof UiButton> | null>(null)
const confirmRef = ref<InstanceType<typeof UiButton> | null>(null)

let previouslyFocused: HTMLElement | null = null

const hasTitle = computed(() => state.title.trim() !== '')
const resolvedTitle = computed(() => state.title || t('confirm.title'))
const resolvedConfirmLabel = computed(() => state.confirmLabel || t('confirm.confirm'))
const resolvedCancelLabel = computed(() => state.cancelLabel || t('confirm.cancel'))

function handleConfirm(): void {
  accept()
}

function handleCancel(): void {
  cancel()
}

function focusableElements(): HTMLElement[] {
  if (!dialogRef.value) {
    return []
  }

  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('disabled'))
}

// Piège de focus : Tab / Shift+Tab bouclent à l'intérieur du dialogue, Échap annule.
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    handleCancel()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusables = focusableElements()

  if (focusables.length === 0) {
    return
  }

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null

  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => state.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      await nextTick()
      // Focus initial sur l'action la moins destructive (Annuler).
      cancelRef.value?.$el?.focus?.()
      return
    }

    // Restaure le focus sur l'élément déclencheur à la fermeture.
    previouslyFocused?.focus?.()
    previouslyFocused = null
  }
)
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--overlay);
  backdrop-filter: blur(2px);
}

.confirm-dialog {
  width: 100%;
  max-width: 440px;
  padding: 22px;
  border: 1px solid var(--border-2);
  border-radius: var(--radius);
  background: var(--bg-card-hi);
  box-shadow: 0 24px 60px var(--shadow-2);
}

.confirm-dialog__title {
  margin: 0 0 10px;
  color: var(--text-0);
  font-size: 17px;
  font-weight: 800;
}

.confirm-dialog__message {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.5;
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.confirm-dialog__actions :deep(.ui-btn) {
  min-height: 40px;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.16s ease;
}

.confirm-fade-enter-active .confirm-dialog,
.confirm-fade-leave-active .confirm-dialog {
  transition: transform 0.16s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-fade-enter-from .confirm-dialog,
.confirm-fade-leave-to .confirm-dialog {
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .confirm-fade-enter-active,
  .confirm-fade-leave-active,
  .confirm-fade-enter-active .confirm-dialog,
  .confirm-fade-leave-active .confirm-dialog {
    transition: none;
  }

  .confirm-fade-enter-from .confirm-dialog,
  .confirm-fade-leave-to .confirm-dialog {
    transform: none;
  }
}
</style>
