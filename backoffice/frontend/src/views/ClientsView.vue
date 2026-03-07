<template>
  <SectionLayout :title="$t('clients.title')" :subtitle="$t('clients.subtitle')">
    <ClientsFilters v-model="searchQuery" />

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

const searchQuery = ref('')
const companies = ref<Company[]>([])
const isLoading = ref(false)
const errorCode = ref<string | null>(null)

const filteredCompanies = computed(() => filterCompanies(companies.value, searchQuery.value))

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
