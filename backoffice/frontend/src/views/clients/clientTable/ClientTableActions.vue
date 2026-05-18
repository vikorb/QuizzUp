<template>
  <div class="actions">
    <ClientsTableActionsSwitch
      :company="props.item"
      :disabled="deleteBusy"
      @updated="handleCompanyUpdated"
      @error="handleActionError"
      @busy-change="handleSwitchBusyChange"
    />

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

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { deleteCompanyPermanentlyService } from '@/services/companiesService'
import type { CompanyTableRow } from '@/types/company'

import ClientsTableActionsSwitch from './ClientsTableActionsSwitch.vue'

const props = defineProps<{
  item: CompanyTableRow
}>()

const emit = defineEmits<{
  (event: 'view-accounts', companyId: number): void
  (event: 'edit', companyId: number): void
  (event: 'updated', company: CompanyTableRow): void
  (event: 'deleted', companyId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()
const deleteBusy = ref(false)
const switchBusy = ref(false)
const isBusy = computed(() => deleteBusy.value || switchBusy.value)

function handleSwitchBusyChange(value: boolean): void {
  switchBusy.value = value
}

function handleCompanyUpdated(updatedCompany: CompanyTableRow): void {
  emit('updated', updatedCompany)
}

function handleActionError(errorCode: string): void {
  emit('error', errorCode)
}

function handleViewAccounts(): void {
  if (isBusy.value) {
    return
  }

  emit('view-accounts', props.item.id)
}

function handleEditCompany(): void {
  if (isBusy.value) {
    return
  }

  emit('edit', props.item.id)
}

async function handleDeleteCompany(): Promise<void> {
  if (isBusy.value) {
    return
  }

  const confirmed = window.confirm(
    t('clients.table.actions.deleteConfirm', {
      name: props.item.name,
    }),
  )

  if (!confirmed) {
    return
  }

  deleteBusy.value = true

  try {
    const result = await deleteCompanyPermanentlyService(props.item.id)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('deleted', props.item.id)
  } finally {
    deleteBusy.value = false
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

.icon-delete {
  color: #ff6b6b;
}
</style>
