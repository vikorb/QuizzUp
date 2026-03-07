<template>
  <BaseCard :neon="false" :no-hover="true">
    <div class="filters">
      <div class="filters__left">
        <FormField
          id="q"
          :model-value="modelValue"
          :label="$t('clients.filters.searchLabel')"
          :placeholder="$t('clients.filters.searchPlaceholder')"
          inputmode="search"
          autocomplete="off"
          :neon="false"
          @update:model-value="$emit('update:modelValue', $event)"
        />
      </div>

      <div class="filters__right">
        <UiButton variant="primary" type="button" @click="handleCreateCompany">
          {{ $t('clients.actions.addCompany') }}
        </UiButton>
      </div>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import FormField from '@/components/ui/form/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'

defineProps<{ modelValue: string }>()
defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const router = useRouter()

function handleCreateCompany(): void {
  router.push({ path: '/clients', query: { mode: 'create' } })
}
</script>

<style scoped>
.filters {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.filters__left {
  flex: 1 1 auto;
  min-width: 0;
}

.filters__right {
  flex: 0 0 auto;
}

@media (max-width: 980px) {
  .filters {
    flex-direction: column;
    align-items: stretch;
  }

  .filters__right :deep(.ui-btn) {
    width: 100%;
  }
}
</style>
