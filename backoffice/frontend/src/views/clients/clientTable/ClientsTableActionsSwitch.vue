<template>
  <button
    class="switch"
    :class="{ 'switch--active': isActive }"
    type="button"
    role="switch"
    :aria-checked="isActive"
    :disabled="disabled || busy || isDeleted"
    :title="switchTitle"
    @click="toggleStatus"
  >
    <span class="switch__thumb" />
  </button>
</template>

<script setup lang="ts">
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  type CompanyStatus,
} from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { updateCompanyStatusService } from '@/services/companiesService'
import type { CompanyTableRow } from '@/types/company'
import { toCompanyStatus } from '@/utils/company/status'

const props = withDefaults(
  defineProps<{
    company: CompanyTableRow
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'updated', company: CompanyTableRow): void
  (event: 'error', errorCode: string): void
  (event: 'busy-change', value: boolean): void
}>()

const { t } = useI18n()

const busy = ref(false)

const currentStatus = computed<CompanyStatus>(
  () => toCompanyStatus(props.company.status) ?? COMPANY_STATUS_INACTIVE,
)

const isActive = computed(() => currentStatus.value === COMPANY_STATUS_ACTIVE)
const isDeleted = computed(() => currentStatus.value === COMPANY_STATUS_DELETED)

const switchTitle = computed(() =>
  isActive.value ? t('clients.table.actions.disable') : t('clients.table.actions.enable'),
)

function setBusy(value: boolean): void {
  busy.value = value
  emit('busy-change', value)
}

async function toggleStatus(): Promise<void> {
  if (props.disabled || busy.value || isDeleted.value) {
    return
  }

  const nextStatus = isActive.value ? COMPANY_STATUS_INACTIVE : COMPANY_STATUS_ACTIVE

  const confirmKey = isActive.value
    ? 'clients.table.actions.disableConfirm'
    : 'clients.table.actions.enableConfirm'

  const confirmed = window.confirm(
    t(confirmKey, {
      name: props.company.name,
    }),
  )

  if (!confirmed) {
    return
  }

  setBusy(true)

  try {
    const result = await updateCompanyStatusService(props.company.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    const updatedCompany: CompanyTableRow = {
      ...props.company,
      ...result.company,
      status: nextStatus,
    }

    emit('updated', updatedCompany)
  } finally {
    setBusy(false)
  }
}
</script>

<style scoped>
.switch {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.switch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.switch--active {
  border-color: rgba(45, 255, 137, 0.45);
  background: rgba(45, 255, 137, 0.22);
}

.switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--text-0);
  transition: transform 0.2s ease;
}

.switch--active .switch__thumb {
  transform: translateX(16px);
}
</style>
