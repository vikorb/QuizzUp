<template>
  <SectionLayout :title="$t('clients.title')" :subtitle="$t('clients.subtitle')">
    <ClientToolBar
      v-model="searchQuery"
      v-model:status-filter="statusFilter"
    />

    <ClientsTable
      :companies="filteredCompanies"
      :loading="isLoading"
      :error="errorCode"
      @retry="loadCompanies"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import SectionLayout from '@/components/SectionLayout.vue'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@/CONSTANTS'
import type { ClientStatusFilter, Company } from '@/types/company'
import { apiRequestJson } from '@/utils/api'
import { filterCompanies, parseCompaniesResponse } from '@/utils/company'
import ClientsTable from '@/views/clients/ClientsTable.vue'
import ClientToolBar from '@/views/clients/ClientToolBar.vue'

const searchQuery = ref('')
const statusFilter = ref<ClientStatusFilter>(COMPANY_STATUS_ACTIVE)
const companies = ref<Company[]>([])
const isLoading = ref(false)
const errorCode = ref<string | null>(null)

const filteredCompanies = computed(() => {
  const searchedCompanies = filterCompanies(companies.value, searchQuery.value)

  switch (statusFilter.value) {
    case COMPANY_STATUS_ACTIVE:
    case COMPANY_STATUS_INACTIVE:
      return searchedCompanies.filter((company) => company.status === statusFilter.value)

    case 'all':
    default:
      return searchedCompanies.filter((company) => company.status !== COMPANY_STATUS_DELETED)
  }
})

async function loadCompanies(): Promise<void> {
  errorCode.value = null
  isLoading.value = true

  try {
    const result = await apiRequestJson<unknown>({
      path: '/companies',
      method: 'GET',
      authenticated: true,
    })

    if (!result.ok) {
      errorCode.value = result.error
      companies.value = []
      return
    }

    const parsed = parseCompaniesResponse(result.data)
    companies.value = parsed?.companies ?? []
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadCompanies()
})
</script>
