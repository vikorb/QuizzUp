<template>
  <div class="company-status" :class="{ 'company-status--pending': hasStatusChanges }">
    <div class="company-status__info">
      <p class="company-status__title">
        {{ $t('clients.details.form.fields.status.label') }}
      </p>
      <Tooltip :text="statusHelp" />
    </div>

    <SwitchField
      :model-value="isActive"
      :disabled="disabled || isDeleted"
      :label="statusHelp"
      @change="$emit('toggle')"
    />
  </div>
</template>

<script setup lang="ts">
import type { CompanyStatus } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
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

const hasStatusChanges = computed(() => hasCompanyStatusChanged(props.status, props.originalStatus))

const statusHelp = computed(() => t(getCompanyStatusHelpKey(props.status, props.originalStatus)))
</script>

<style scoped>
.company-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-2);
}

.company-status--pending {
  border-color: rgba(240, 189, 102, 0.4);
}

.company-status__info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.company-status__title {
  margin: 0;
  color: var(--text-0);
  font-weight: 800;
  font-size: 14px;
}

.company-status--pending .company-status__title {
  color: var(--warn);
}
</style>
