<template>
  <div class="form-actions">
    <span class="form-actions__legend">
      <span class="form-actions__req">*</span> {{ t('requiredLegend') }}
    </span>

    <div class="form-actions__buttons">
      <UiButton variant="default" type="button" :disabled="disabled" @click="$emit('cancel')">
        {{ cancelLabel }}
      </UiButton>

      <UiButton variant="primary" type="submit" :disabled="disabled">
        <span v-if="!loading">{{ submitLabel }}</span>
        <span v-else>{{ submittingLabel }}</span>
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'

withDefaults(
  defineProps<{
    cancelLabel: string
    submitLabel: string
    submittingLabel: string
    loading?: boolean
    disabled?: boolean
  }>(),
  {
    loading: false,
    disabled: false,
  }
)

defineEmits<{
  (event: 'cancel'): void
}>()

const { t } = useI18n()
</script>

<style scoped>
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  flex-wrap: wrap;
}

.form-actions__legend {
  font-size: 12px;
  color: var(--text-3);
}

.form-actions__req {
  color: var(--accent-pink);
  font-weight: 800;
}

.form-actions__buttons {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

@media (max-width: 980px) {
  .form-actions__buttons {
    width: 100%;
    flex-direction: column-reverse;
  }

  .form-actions__buttons :deep(.ui-btn) {
    width: 100%;
  }
}
</style>
