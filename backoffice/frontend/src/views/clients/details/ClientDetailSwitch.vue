<template>
  <div class="company-status">
    <div>
      <p class="company-status__title">
        {{ $t('clients.details.form.fields.status.label') }}
      </p>

      <p
        class="company-status__subtitle"
        :class="{ 'company-status__subtitle--pending': hasStatusChanges }"
      >
        {{ statusHelp }}
      </p>
    </div>

    <SwitchField
      :model-value="isActive"
      :disabled="disabled || isDeleted"
      :label="statusHelp"
      size="large"
      @change="$emit('toggle')"
    />
  </div>
</template>

<script setup lang="ts">
import type { CompanyStatus } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import {
  getCompanyStatusHelpKey,
  hasCompanyStatusChanged,
  isCompanyActiveStatus,
  isCompanyDeletedStatus,
} from '@/utils/company/details/status'

const props = defineProps<{
  status: CompanyStatus
  originalStatus: CompanyStatus
  disabled?: boolean
}>()

defineEmits<{
  (event: 'toggle'): void
}>()

const { t } = useI18n()

const isActive = computed(() => isCompanyActiveStatus(props.status))

const isDeleted = computed(() => isCompanyDeletedStatus(props.status))

const hasStatusChanges = computed(() =>
  hasCompanyStatusChanged(props.status, props.originalStatus),
)

const statusHelp = computed(() => t(getCompanyStatusHelpKey(props.status, props.originalStatus)))
</script>

<style scoped>
.company-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
}

.company-status__title {
  margin: 0;
  color: var(--text-0);
  font-weight: 800;
}

.company-status__subtitle {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 13px;
}

.company-status__subtitle--pending {
  color: #ffd166;
  font-weight: 700;
}

@media (max-width: 760px) {
  .company-status {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
