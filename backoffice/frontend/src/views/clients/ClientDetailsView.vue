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

      <form v-if="company" class="company-form" @submit.prevent="saveCompany">
        <div class="company-form__grid">
          <FormField
            v-model="form.name"
            :label="$t('clients.details.form.fields.name.label')"
            name="name"
            autocomplete="organization"
            :placeholder="$t('clients.details.form.fields.name.placeholder')"
            :disabled="companySaving"
            :error="fieldErrors.name"
            required
          />

          <FormField
            v-model="form.email"
            :label="$t('clients.details.form.fields.email.label')"
            name="email"
            type="email"
            autocomplete="email"
            :placeholder="$t('clients.details.form.fields.email.placeholder')"
            :disabled="companySaving"
            :error="fieldErrors.email"
            required
          />
        </div>

        <div class="company-status">
          <div>
            <p class="company-status__title">
              {{ $t('clients.details.form.fields.status.label') }}
            </p>
            <p class="company-status__subtitle">
              {{ statusHelp }}
            </p>
          </div>

          <button
            class="company-status__switch"
            :class="{ 'company-status__switch--active': isCompanyActive }"
            type="button"
            role="switch"
            :aria-checked="isCompanyActive"
            :disabled="companySaving || isCompanyDeleted"
            @click="toggleCompanyStatus"
          >
            <span class="company-status__thumb" />
          </button>
        </div>

        <FormResult :error="formError" :success="formSuccess" />

        <div class="company-form__actions">
          <UiButton variant="default" type="button" :disabled="companySaving" @click="resetCompanyForm">
            {{ $t('clients.details.actions.reset') }}
          </UiButton>

          <UiButton variant="primary" type="submit" :disabled="companySaving || !hasCompanyChanges">
            {{
              companySaving
                ? $t('clients.details.actions.saving')
                : $t('clients.details.actions.save')
            }}
          </UiButton>
        </div>
      </form>
    </BaseCard>

    <div id="accounts" class="accounts-section">
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
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadCompanyAccountsService } from '@/services/accountsService'
import { loadCompanyDetailsService, updateCompanyService } from '@/services/companiesService'
import type { Account, AccountStatusFilter } from '@/types/account'
import type { ActionBanner } from '@/types/banner'
import type { Company, EditCompanyFieldErrors, EditCompanyFormValues } from '@/types/company'
import { filterAccounts, filterAccountsByStatus } from '@/utils/account/filters'
import { DEFAULT_ACCOUNT_STATUS_FILTER } from '@/utils/account/filters'
import { findAccountById, updateAccountInList } from '@/utils/account/list'
import { getAccountUpdateSuccessCode, toAccountStatus } from '@/utils/account/status'
import { createErrorBanner, createSuccessBanner, getBannerMessage, getBannerVariant } from '@/utils/banner'
import {
  buildUpdateCompanyPayload,
  createEditCompanyFieldErrors,
  getEditCompanyApiFieldError,
  getEditCompanyApiFormError,
  hasEditCompanyFormErrors,
  validateEditCompanyForm,
} from '@/utils/company/edit'

import AccountsTable from './accounts/AccountsTable.vue'
import AccountsToolBar from './accounts/AccountsToolBar.vue'

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

const fieldErrors = reactive<EditCompanyFieldErrors>(createEditCompanyFieldErrors())

const form = reactive<EditCompanyFormValues>({
  name: '',
  email: '',
  status: COMPANY_STATUS_ACTIVE,
})

const searchQuery = ref('')
const statusFilter = ref<AccountStatusFilter>(DEFAULT_ACCOUNT_STATUS_FILTER)
const actionBanner = ref<ActionBanner | null>(null)

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const filteredAccounts = computed(() => {
  const searchedAccounts = filterAccounts(accounts.value, searchQuery.value)

  return filterAccountsByStatus(searchedAccounts, statusFilter.value)
})

const isCompanyActive = computed(() => form.status === COMPANY_STATUS_ACTIVE)
const isCompanyDeleted = computed(() => form.status === COMPANY_STATUS_DELETED)

const hasCompanyChanges = computed(() => {
  if (!company.value) {
    return false
  }

  return (
    form.name.trim() !== company.value.name ||
    form.email.trim().toLowerCase() !== company.value.email.toLowerCase() ||
    form.status !== company.value.status
  )
})

const statusHelp = computed(() => {
  if (isCompanyDeleted.value) {
    return t('clients.details.form.fields.status.deletedHelp')
  }

  return isCompanyActive.value
    ? t('clients.details.form.fields.status.activeHelp')
    : t('clients.details.form.fields.status.inactiveHelp')
})

function clearActionBanner(): void {
  actionBanner.value = null
}

function resetFormMessages(): void {
  formError.value = null
  formSuccess.value = null
  Object.assign(fieldErrors, createEditCompanyFieldErrors())
}

function syncCompanyForm(nextCompany: Company): void {
  form.name = nextCompany.name
  form.email = nextCompany.email
  form.status = nextCompany.status
}

function resetCompanyForm(): void {
  if (!company.value) {
    return
  }

  resetFormMessages()
  syncCompanyForm(company.value)
}

function validateCompanyForm(): boolean {
  const errors = validateEditCompanyForm(form, t)

  Object.assign(fieldErrors, errors)

  return !hasEditCompanyFormErrors(errors)
}

function toggleCompanyStatus(): void {
  if (isCompanyDeleted.value) {
    return
  }

  form.status = isCompanyActive.value ? COMPANY_STATUS_INACTIVE : COMPANY_STATUS_ACTIVE
}

async function saveCompany(): Promise<void> {
  if (companySaving.value || !hasCompanyChanges.value) {
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
    syncCompanyForm(result.data.company)
    formSuccess.value = t('clients.details.form.success.updated')
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
    syncCompanyForm(result.data.company)
  } finally {
    companyLoading.value = false
  }
}

async function loadAccounts(): Promise<void> {
  accountsErrorCode.value = null
  clearActionBanner()
  accountsLoading.value = true

  try {
    const result = await loadCompanyAccountsService(companyId)

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
  clearActionBanner()

  const currentAccount = findAccountById(accounts.value, updatedAccount.id)
  const updatedStatus = toAccountStatus(updatedAccount.status)

  accounts.value = updateAccountInList(accounts.value, updatedAccount)

  const accountName =
    [updatedAccount.firstname, updatedAccount.lastname].filter(Boolean).join(' ').trim() ||
    updatedAccount.username ||
    currentAccount?.username ||
    `#${updatedAccount.id}`

  actionBanner.value = createSuccessBanner(getAccountUpdateSuccessCode(updatedStatus), {
    name: accountName,
  })
}

function handleAccountDeleted(accountId: number): void {
  clearActionBanner()

  const deletedAccount = findAccountById(accounts.value, accountId)

  actionBanner.value = createSuccessBanner('accountDeleted', {
    name: deletedAccount?.username ?? `#${accountId}`,
  })
}

function handleTableError(error: string): void {
  actionBanner.value = createErrorBanner(error)
}

function handleCreateAccount(): void {
  router.push(`/clients/${companyId}/accounts/create`)
}

function handleEditAccount(accountId: number): void {
  router.push(`/clients/${companyId}/accounts/${accountId}/edit`)
}

function goBack(): void {
  router.push('/clients')
}

onMounted(() => {
  if (!Number.isFinite(companyId)) {
    companyErrorCode.value = 'invalid_params'
    return
  }

  loadCompany()
  loadAccounts()
})
</script>

<style scoped>
.company-details-card {
  margin-bottom: 18px;
}

.company-form {
  display: grid;
  gap: 16px;
}

.company-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

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

.company-status__switch {
  position: relative;
  flex: 0 0 auto;
  width: 48px;
  height: 28px;
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

.company-status__switch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.company-status__switch--active {
  border-color: rgba(45, 255, 137, 0.45);
  background: rgba(45, 255, 137, 0.22);
}

.company-status__thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--text-0);
  transition: transform 0.2s ease;
}

.company-status__switch--active .company-status__thumb {
  transform: translateX(20px);
}

.company-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.accounts-section {
  scroll-margin-top: 90px;
}

.company-details-card {
  scroll-margin-top: 90px;
}

@media (max-width: 760px) {
  .company-form__grid {
    grid-template-columns: 1fr;
  }

  .company-status {
    align-items: flex-start;
    flex-direction: column;
  }

  .company-form__actions {
    flex-direction: column-reverse;
  }
}
</style>
