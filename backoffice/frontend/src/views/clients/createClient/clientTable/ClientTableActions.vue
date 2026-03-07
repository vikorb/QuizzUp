<template>
  <div class="actions">
    <div class="actions__switch">
      <SwitchField
        :model-value="isActive"
        :disabled="isBusy"
        :label="toggleStatusLabel"
        @change="handleToggleStatus"
      />
    </div>

    <UiButton
      class="icon"
      variant="icon"
      type="button"
      :disabled="isBusy"
      :title="$t('clients.table.actions.viewAccounts')"
      :aria-label="$t('clients.table.actions.viewAccounts')"
      @click="handleViewAccounts"
    >
      <MdIcon :path="mdiAccountDetailsOutline" :size="18" />
    </UiButton>

    <UiButton
      class="icon"
      variant="icon"
      type="button"
      :disabled="isBusy"
      :title="$t('clients.table.actions.edit')"
      :aria-label="$t('clients.table.actions.edit')"
      @click="handleEditCompany"
    >
      <MdIcon :path="mdiPencilOutline" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-delete"
      variant="icon"
      type="button"
      :disabled="isBusy"
      :title="$t('clients.table.actions.delete')"
      :aria-label="$t('clients.table.actions.delete')"
      @click="handleDeleteCompany"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiAccountDetailsOutline, mdiDeleteOutline, mdiPencilOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { CompanyTableRow } from '@/types/company'
import { apiRequestJson } from '@/utils/api'
import { isCompanyTableRow } from '@/utils/company'

type UpdateCompanyStatusResponse = {
  company: CompanyTableRow
}

type DeleteCompanyResponse = {
  success: boolean
  deleted: {
    companyId: number
    adminsCount: number
    companiesCount: number
  }
}

const props = defineProps<{
  item: Record<string, unknown>
}>()

const emit = defineEmits<{
  (event: 'view-accounts', companyId: number): void
  (event: 'edit', companyId: number): void
  (event: 'updated', company: CompanyTableRow): void
  (event: 'deleted', companyId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const busyAction = ref<'toggle' | 'delete' | null>(null)

const company = computed(() => (isCompanyTableRow(props.item) ? props.item : null))
const isActive = computed(() => company.value?.status === 1)
const isBusy = computed(() => busyAction.value !== null)

const toggleStatusLabel = computed(() =>
  isActive.value
    ? t('clients.table.actions.active')
    : t('clients.table.actions.inactive')
)

function handleViewAccounts(): void {
  if (!company.value || isBusy.value) {
    return
  }

  emit('view-accounts', company.value.id)
}

function handleEditCompany(): void {
  if (!company.value || isBusy.value) {
    return
  }

  emit('edit', company.value.id)
}

async function handleToggleStatus(nextChecked: boolean): Promise<void> {
  if (!company.value || isBusy.value) {
    return
  }

  const nextStatus: 1 | 2 = nextChecked ? 1 : 2

  if (nextStatus === 2) {
    const confirmed = window.confirm(
      t('clients.table.actions.deactivateConfirm', { name: company.value.name })
    )

    if (!confirmed) {
      return
    }
  }

  busyAction.value = 'toggle'

  try {
    const result = await apiRequestJson<UpdateCompanyStatusResponse>({
      path: `/companies/${company.value.id}/status`,
      method: 'PATCH',
      authenticated: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: nextStatus,
      }),
    })

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.company)
  } finally {
    busyAction.value = null
  }
}

async function handleDeleteCompany(): Promise<void> {
  if (!company.value || isBusy.value) {
    return
  }

  const confirmed = window.confirm(
    t('clients.table.actions.deleteConfirm', { name: company.value.name })
  )

  if (!confirmed) {
    return
  }

  busyAction.value = 'delete'

  try {
    const result = await apiRequestJson<DeleteCompanyResponse>({
      path: `/companies/${company.value.id}/permanent`,
      method: 'DELETE',
      authenticated: true,
    })

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('deleted', company.value.id)
  } finally {
    busyAction.value = null
  }
}
</script>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

.actions__switch {
  margin-left: 8px;
}

.icon-delete {
  color: #ff6b6b;
}
</style>
