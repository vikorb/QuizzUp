<template>
  <SectionLayout :title="$t('clients.title')" :subtitle="$t('clients.subtitle')">
    <ClientToolBar
      v-model="searchQuery"
      v-model:status-filter="statusFilter"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <ClientsTable
      :companies="filteredCompanies"
      :loading="isLoading"
      :error="loadErrorCode"
      @view-accounts="handleViewAccounts"
      @edit="handleEditCompany"
      @updated="handleCompanyUpdated"
      @deleted="handleCompanyDeleted"
      @error="handleTableError"
      @retry="loadCompanies"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import { getCompanyAccountsRoute, getEditCompanyRoute } from '@/router/clients'
import { loadCompaniesService } from '@/services/companiesService'
import type { ActionBanner } from '@/types/banner'
import type { ClientStatusFilter, Company, CompanyTableRow } from '@/types/company'
import { createErrorBanner, createSuccessBanner, getBannerMessage, getBannerVariant } from '@/utils/banner'
import { filterCompanies, filterCompaniesByStatus } from '@/utils/company/filters'
import { findCompanyById, removeCompanyFromList, updateCompanyInList } from '@/utils/company/list'
import { getCompanyUpdateSuccessCode, toCompanyStatus } from '@/utils/company/status'
import ClientsTable from '@/views/clients/ClientsTable.vue'
import ClientToolBar from '@/views/clients/ClientToolBar.vue'

const { t } = useI18n()
const router = useRouter()
const searchQuery = ref('')
const statusFilter = ref<ClientStatusFilter>(COMPANY_STATUS_ACTIVE)
const companies = ref<Company[]>([])
const isLoading = ref(false)
const loadErrorCode = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const filteredCompanies = computed(() => {
  const searchedCompanies = filterCompanies(companies.value, searchQuery.value)

  return filterCompaniesByStatus(searchedCompanies, statusFilter.value)
})

function clearActionBanner(): void {
  actionBanner.value = null
}

function handleViewAccounts(companyId: number): void {
  router.push(getCompanyAccountsRoute(companyId))
}

function handleEditCompany(companyId: number): void {
  router.push(getEditCompanyRoute(companyId))
}

function handleCompanyUpdated(updatedCompany: CompanyTableRow): void {
  clearActionBanner()

  const currentCompany = findCompanyById(companies.value, Number(updatedCompany.id))
  const updatedStatus = toCompanyStatus(updatedCompany.status)
  companies.value = updateCompanyInList(companies.value, updatedCompany)
  const companyName = String(updatedCompany.name || currentCompany?.name || '')
  const successCode = getCompanyUpdateSuccessCode(updatedStatus)

  actionBanner.value = createSuccessBanner(successCode, {
    name: companyName,
  })
}

function handleCompanyDeleted(companyId: number): void {
  clearActionBanner()

  const deletedCompany = findCompanyById(companies.value, companyId)
  companies.value = removeCompanyFromList(companies.value, companyId)

  actionBanner.value = createSuccessBanner('companyDeleted', {
    name: deletedCompany?.name ?? `#${companyId}`,
  })
}

function handleTableError(error: string): void {
  actionBanner.value = createErrorBanner(error)
}

async function loadCompanies(): Promise<void> {
  loadErrorCode.value = null
  clearActionBanner()
  isLoading.value = true

  try {
    const result = await loadCompaniesService()

    if (!result.ok) {
      loadErrorCode.value = result.error
      companies.value = []
      return
    }

    companies.value = result.companies
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadCompanies()
})
</script>
