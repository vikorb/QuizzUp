<template>
  <Transition name="base-banner-fade">
    <div
      v-if="message"
      :key="`${variant}-${message}`"
      class="base-banner"
      :class="`base-banner--${variant}`"
      :role="ariaRole"
      :aria-live="ariaLive"
    >
      <div class="base-banner__content">
        <div class="base-banner__title">
          {{ displayedTitle }}
        </div>

        <p class="base-banner__message">
          {{ message }}
        </p>
      </div>

      <button
        v-if="dismissible"
        class="base-banner__close"
        type="button"
        :aria-label="$t('closeLabel')"
        @click="dismiss"
      >
        ×
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { BannerVariant } from '@/types/banner'

const props = withDefaults(
  defineProps<{
    message: string | null
    title?: string | null
    variant?: BannerVariant
    dismissible?: boolean
    autoDismiss?: boolean
    durationMs?: number
  }>(),
  {
    title: null,
    variant: 'error',
    dismissible: true,
    autoDismiss: true,
    durationMs: 4000,
  },
)

const emit = defineEmits<{
  (event: 'dismiss'): void
}>()

const { t } = useI18n()
let dismissTimeout: ReturnType<typeof setTimeout> | null = null
const isError = computed(() => props.variant === 'error')
const ariaRole = computed(() => (isError.value ? 'alert' : 'status'))
const ariaLive = computed(() => (isError.value ? 'assertive' : 'polite'))

const displayedTitle = computed(() => {
  if (props.title) {
    return props.title
  }

  return isError.value ? t('errors.title') : t('success.title')
})

function clearDismissTimeout(): void {
  if (!dismissTimeout) {
    return
  }

  clearTimeout(dismissTimeout)
  dismissTimeout = null
}

function dismiss(): void {
  clearDismissTimeout()
  emit('dismiss')
}

function scheduleDismiss(): void {
  clearDismissTimeout()

  if (!props.message || !props.autoDismiss) {
    return
  }

  dismissTimeout = setTimeout(() => {
    emit('dismiss')
  }, props.durationMs)
}

watch(
  () => [props.message, props.autoDismiss, props.durationMs],
  () => {
    scheduleDismiss()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearDismissTimeout()
})
</script>

<style scoped>
.base-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid var(--base-banner-border);
  border-radius: 16px;
  background:
    linear-gradient(135deg, var(--base-banner-gradient-start), var(--base-banner-gradient-end)),
    rgba(13, 15, 30, 0.62);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    0 0 18px var(--base-banner-shadow);
}

.base-banner--error {
  --base-banner-border: rgba(255, 107, 107, 0.28);
  --base-banner-title: #ff8a8a;
  --base-banner-gradient-start: rgba(255, 107, 107, 0.12);
  --base-banner-gradient-end: rgba(255, 107, 107, 0.06);
  --base-banner-shadow: rgba(255, 107, 107, 0.08);
  --base-banner-close-border: rgba(255, 107, 107, 0.22);
  --base-banner-close-bg: rgba(255, 107, 107, 0.08);
  --base-banner-close-color: #ffb0b0;
  --base-banner-close-border-hover: rgba(255, 107, 107, 0.45);
  --base-banner-close-bg-hover: rgba(255, 107, 107, 0.16);
}

.base-banner--success {
  --base-banner-border: rgba(70, 230, 160, 0.3);
  --base-banner-title: #70f0b8;
  --base-banner-gradient-start: rgba(70, 230, 160, 0.13);
  --base-banner-gradient-end: rgba(70, 230, 160, 0.06);
  --base-banner-shadow: rgba(70, 230, 160, 0.1);
  --base-banner-close-border: rgba(70, 230, 160, 0.24);
  --base-banner-close-bg: rgba(70, 230, 160, 0.08);
  --base-banner-close-color: #a8ffd6;
  --base-banner-close-border-hover: rgba(70, 230, 160, 0.48);
  --base-banner-close-bg-hover: rgba(70, 230, 160, 0.16);
}

.base-banner__content {
  min-width: 0;
}

.base-banner__title {
  font-size: 13px;
  font-weight: 800;
  color: var(--base-banner-title);
}

.base-banner__message {
  margin: 4px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
}

.base-banner__close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: 1px solid var(--base-banner-close-border);
  border-radius: 999px;
  background: var(--base-banner-close-bg);
  color: var(--base-banner-close-color);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: var(--tr);
}

.base-banner__close:hover {
  border-color: var(--base-banner-close-border-hover);
  background: var(--base-banner-close-bg-hover);
  color: #ffffff;
}

.base-banner-fade-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.base-banner-fade-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.base-banner-fade-enter-from,
.base-banner-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.base-banner-fade-enter-to,
.base-banner-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
