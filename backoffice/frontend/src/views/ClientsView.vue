<template>
  <SectionLayout :title="$t('clients.title')" :subtitle="$t('clients.subtitle')">
    <ClientsFilters
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
import type { Company } from '@/types/company'
import { apiRequestJson } from '@/utils/api'
import { filterCompanies, parseCompaniesResponse } from '@/utils/company'
import ClientsFilters from '@/views/clients/ClientsFilters.vue'
import ClientsTable from '@/views/clients/ClientsTable.vue'

type ClientStatusFilter = 'active' | 'inactive' | 'all'

const searchQuery = ref('')
const statusFilter = ref<ClientStatusFilter>('active')
const companies = ref<Company[]>([])
const isLoading = ref(false)
const errorCode = ref<string | null>(null)

const filteredCompanies = computed(() => {
  const searchedCompanies = filterCompanies(companies.value, searchQuery.value)

  console.log('searchedCompanies', searchedCompanies)

  if (statusFilter.value === 'all') {
    return searchedCompanies
  }

  if (statusFilter.value === 'inactive') {
    return searchedCompanies.filter((company) => company.status === 2)
  }

  return searchedCompanies.filter((company) => company.status === 1)
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
