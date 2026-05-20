<template>
  <SectionLayout :title="$t('clients.details.title')" :subtitle="$t('clients.details.subtitle')">
    <BaseCard
      id="company-info"
      :title="$t('clients.details.card.title')"
      :neon="true"
      :no-hover="true"
      :loading="companyLoading"
      :error="companyErrorCode"
      error-namespace="clients.details.errors"
      class="company-details-card"
    >
      <template #actions>
        <UiButton variant="default" type="button" :disabled="companySaving" @click="goBack">
          {{ $t('clients.details.actions.back') }}
        </UiButton>
      </template>

      <ClientDetailForm
        v-if="company"
        :name="form.name"
        :email="form.email"
        :status="form.status"
        :original-status="company.status"
        :field-errors="fieldErrors"
        :company-saving="companySaving"
        :is-company-readonly="isCompanyReadonly"
        :can-manage-company="canManageCompany"
        :can-show-status-switch="canShowStatusSwitch"
        :has-company-changes="hasCompanyChanges"
        :form-error="formError"
        :form-success="formSuccess"
        @update:name="form.name = $event"
        @update:email="form.email = $event"
        @toggle-status="toggleCompanyStatus"
        @reset="resetCompanyForm"
        @submit="saveCompany"
      />
    </BaseCard>

    <div v-if="canShowAccountsSection" id="accounts" class="accounts-section">
      <AccountsToolBar
        v-model="searchQuery"
        v-model:status-filter="statusFilter"
        @create="handleCreateAccount"
      />

      <BaseBanner
        :variant="actionBannerVariant"
        :message="actionBannerMessage"
        @dismiss="clearActionBanner"
      />

      <AccountsTable
        :company-id="companyId"
        :accounts="filteredAccounts"
        :loading="accountsLoading"
        :error="accountsErrorCode"
        @updated="handleAccountUpdated"
        @deleted="handleAccountDeleted"
        @edit="handleEditAccount"
        @error="handleTableError"
        @retry="loadAccounts"
      />
    </div>
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getCreateCompanyAccountRoute, getEditCompanyAccountRoute } from '@/router/clients'
import { loadCompanyAccountsService } from '@/services/accountsService'
import { loadCompanyDetailsService, updateCompanyService } from '@/services/companiesService'
import { me } from '@/state/authState'
import type { Account, AccountStatusFilter } from '@/types/account'
import type { ActionBanner } from '@/types/banner'
import type { Company, EditCompanyFieldErrors } from '@/types/company'
import { createAccountDeletedBanner, createAccountUpdatedBanner } from '@/utils/account/detailsBanner'
import { filterAccounts, filterAccountsByStatus } from '@/utils/account/filters'
import { DEFAULT_ACCOUNT_STATUS_FILTER } from '@/utils/account/filters'
import { updateAccountInList } from '@/utils/account/list'
import { createErrorBanner, getBannerMessage, getBannerVariant } from '@/utils/banner'
import {
  createCompanyDetailsForm,
  getCompanyDetailsFormValues,
  hasCompanyDetailsChanges,
} from '@/utils/company/details/form'
import {
  canManageCompanyDetails,
  canShowCompanyAccountsSection,
  canShowCompanyStatusSwitch,
  isCompanyDetailsReadonly,
  isSuperadminRole,
} from '@/utils/company/details/permissions'
import { getNextCompanyStatus } from '@/utils/company/details/status'
import {
  buildUpdateCompanyPayload,
  createEditCompanyFieldErrors,
  getEditCompanyApiFieldError,
  getEditCompanyApiFormError,
  hasEditCompanyFormErrors,
  validateEditCompanyForm,
} from '@/utils/company/edit'
import { clearTimer, scheduleTimer, type TimerHandle } from '@/utils/timer'

import AccountsTable from './accounts/AccountsTable.vue'
import AccountsToolBar from './accounts/AccountsToolBar.vue'
import ClientDetailForm from './clientDetails/ClientDetailForm.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const companyId = Number(route.params.id)

const company = ref<Company | null>(null)
const accounts = ref<Account[]>([])

const companyLoading = ref(false)
const accountsLoading = ref(false)
const companySaving = ref(false)

const companyErrorCode = ref<string | null>(null)
const accountsErrorCode = ref<string | null>(null)

const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const formSuccessTimer = ref<TimerHandle | null>(null)
const actionBannerTimer = ref<TimerHandle | null>(null)

const fieldErrors = reactive<EditCompanyFieldErrors>(createEditCompanyFieldErrors())
const form = reactive(createCompanyDetailsForm())

const searchQuery = ref('')
const statusFilter = ref<AccountStatusFilter>(DEFAULT_ACCOUNT_STATUS_FILTER)
const actionBanner = ref<ActionBanner | null>(null)

const currentRole = computed(() => me.value?.role ?? null)

const isSuperadmin = computed(() => isSuperadminRole(currentRole.value))
const canManageCompany = computed(() => canManageCompanyDetails(currentRole.value))
const canShowStatusSwitch = computed(() => canShowCompanyStatusSwitch(currentRole.value))
const canShowAccountsSection = computed(() => canShowCompanyAccountsSection(currentRole.value))
const isCompanyReadonly = computed(() => isCompanyDetailsReadonly(currentRole.value))

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const filteredAccounts = computed(() => {
  if (!canShowAccountsSection.value) {
    return []
  }

  const searchedAccounts = filterAccounts(accounts.value, searchQuery.value)

  return filterAccountsByStatus(searchedAccounts, statusFilter.value)
})

const hasCompanyChanges = computed(() =>
  hasCompanyDetailsChanges(form, company.value, canManageCompany.value),
)

function dismissFormSuccessLater(): void {
  formSuccessTimer.value = scheduleTimer(formSuccessTimer.value, () => {
    formSuccess.value = null
    formSuccessTimer.value = null
  })
}

function dismissActionBannerLater(): void {
  formSuccessTimer.value = scheduleTimer(formSuccessTimer.value, () => {
    formSuccess.value = null
    formSuccessTimer.value = null
  })
}

function clearActionBanner(): void {
  formSuccessTimer.value = clearTimer(actionBannerTimer.value)
  actionBanner.value = null
}

function resetFormMessages(): void {
  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
  formError.value = null
  formSuccess.value = null
  Object.assign(fieldErrors, createEditCompanyFieldErrors())
}

function resetCompanyForm(): void {
  if (!company.value || !canManageCompany.value) {
    return
  }

  resetFormMessages()
  Object.assign(form, getCompanyDetailsFormValues(company.value))
}

function validateCompanyForm(): boolean {
  const errors = validateEditCompanyForm(form, t)

  Object.assign(fieldErrors, errors)

  return !hasEditCompanyFormErrors(errors)
}

function toggleCompanyStatus(): void {
  if (!canShowStatusSwitch.value) {
    return
  }

  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
  formSuccess.value = null
  form.status = getNextCompanyStatus(form.status)
}

async function saveCompany(): Promise<void> {
  if (!canManageCompany.value || companySaving.value || !hasCompanyChanges.value) {
    return
  }

  resetFormMessages()

  if (!validateCompanyForm()) {
    return
  }

  companySaving.value = true

  try {
    const result = await updateCompanyService(companyId, buildUpdateCompanyPayload(form))

    if (!result.ok) {
      const apiFieldError = getEditCompanyApiFieldError(result.error, t)

      if (apiFieldError) {
        fieldErrors[apiFieldError.field] = apiFieldError.message
        return
      }

      formError.value = getEditCompanyApiFormError(result.error, t)
      return
    }

    company.value = result.data.company
    Object.assign(form, getCompanyDetailsFormValues(result.data.company))
    formSuccess.value = t('clients.details.form.success.updated')
    dismissFormSuccessLater()
  } finally {
    companySaving.value = false
  }
}

async function loadCompany(): Promise<void> {
  companyErrorCode.value = null
  companyLoading.value = true

  try {
    const result = await loadCompanyDetailsService(companyId)

    if (!result.ok) {
      companyErrorCode.value = result.error
      company.value = null
      return
    }

    company.value = result.data.company
    Object.assign(form, getCompanyDetailsFormValues(result.data.company))
  } finally {
    companyLoading.value = false
  }
}

async function loadAccounts(): Promise<void> {
  if (!canShowAccountsSection.value) {
    accounts.value = []
    accountsErrorCode.value = null
    return
  }

  accountsErrorCode.value = null
  clearActionBanner()
  accountsLoading.value = true

  try {
    const result = await loadCompanyAccountsService(companyId)

    if (!canShowAccountsSection.value) {
      accounts.value = []
      accountsErrorCode.value = null
      return
    }

    if (!result.ok) {
      accountsErrorCode.value = result.error
      accounts.value = []
      return
    }

    accounts.value = result.data.accounts
  } finally {
    accountsLoading.value = false
  }
}

function handleAccountUpdated(updatedAccount: Account): void {
  if (!canShowAccountsSection.value) {
    return
  }

  clearActionBanner()
  actionBanner.value = createAccountUpdatedBanner(accounts.value, updatedAccount)
  accounts.value = updateAccountInList(accounts.value, updatedAccount)
  dismissActionBannerLater()
}

function handleAccountDeleted(accountId: number): void {
  if (!canShowAccountsSection.value) {
    return
  }

  clearActionBanner()
  actionBanner.value = createAccountDeletedBanner(accounts.value, accountId)
  dismissActionBannerLater()
}

function handleTableError(error: string): void {
  if (!canShowAccountsSection.value) {
    return
  }

  formSuccessTimer.value = clearTimer(actionBannerTimer.value)
  actionBanner.value = createErrorBanner(error)
}

function handleCreateAccount(): void {
  if (!canShowAccountsSection.value) {
    return
  }

  router.push(getCreateCompanyAccountRoute(companyId))
}

function handleEditAccount(accountId: number): void {
  if (!canShowAccountsSection.value) {
    return
  }

  router.push(getEditCompanyAccountRoute(companyId, accountId))
}

function goBack(): void {
  if (isSuperadmin.value) {
    router.push('/clients')
    return
  }

  router.push('/')
}

watch(
  canShowAccountsSection,
  (canShowAccounts) => {
    if (!Number.isFinite(companyId)) {
      return
    }

    if (!canShowAccounts) {
      accounts.value = []
      accountsErrorCode.value = null
      clearActionBanner()
      return
    }

    loadAccounts()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
  formSuccessTimer.value = clearTimer(actionBannerTimer.value)
})

onMounted(() => {
  if (!Number.isFinite(companyId)) {
    companyErrorCode.value = 'invalid_params'
    return
  }

  loadCompany()
})
</script>

<style scoped>
.company-details-card {
  margin-bottom: 18px;
  scroll-margin-top: 90px;
}

.accounts-section {
  scroll-margin-top: 90px;
}
</style>
