<template>
  <div class="form-actions">
    <UiButton variant="default" type="button" :disabled="disabled" @click="$emit('cancel')">
      {{ cancelLabel }}
    </UiButton>

    <UiButton variant="primary" type="submit" :disabled="disabled">
      <span v-if="!loading">{{ submitLabel }}</span>
      <span v-else>{{ submittingLabel }}</span>
    </UiButton>
  </div>
</template>

<script setup lang="ts">
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
</script>

<style scoped>
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 980px) {
  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions :deep(.ui-btn) {
    width: 100%;
  }
}
</style>
