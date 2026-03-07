<template>
  <div
    class="base-card"
    :class="{
      neon: neon,
      'neon--no-hover': neon && noHover,
    }"
  >
    <div v-if="$slots.header || title || $slots.actions" class="base-card__head">
      <div v-if="$slots.header || title" class="base-card__title">
        <slot name="header">
          {{ title }}
        </slot>
      </div>

      <div v-if="$slots.actions" class="base-card__actions">
        <slot name="actions" />
      </div>
    </div>

    <div class="base-card__body">
      <div v-if="loading" class="state">
        {{ loadingLabel }}
      </div>

      <div v-else-if="error" class="state state--error">
        {{ t(getApiErrorKey(error, errorNamespace)) }}
      </div>

      <div v-else-if="empty" class="state">
        {{ emptyLabel }}
      </div>

      <slot v-else />
    </div>

    <div v-if="$slots.footer" class="base-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { getApiErrorKey } from '@/utils/api'

const { t } = useI18n()

withDefaults(
  defineProps<{
    title?: string
    neon?: boolean
    noHover?: boolean
    loading?: boolean
    error?: string | null
    empty?: boolean
    loadingLabel?: string
    emptyLabel?: string
    errorNamespace?: string
  }>(),
  {
    title: '',
    neon: true,
    noHover: false,
    loading: false,
    error: null,
    empty: false,
    loadingLabel: '',
    emptyLabel: '',
    errorNamespace: 'common.errors',
  }
)
</script>

<style scoped>
.base-card {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  border: 1px solid var(--border-ui);
  background: rgba(255, 255, 255, 0.03);
  padding: 14px;
}

.base-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.base-card__title {
  font-weight: 900;
  letter-spacing: 0.2px;
}

.base-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.base-card__body {
  min-width: 0;
}

.base-card__footer {
  margin-top: 10px;
}

.state {
  padding: 14px 8px;
  color: var(--text-2);
}

.state--error {
  color: rgba(255, 180, 200, 0.92);
}
</style>
