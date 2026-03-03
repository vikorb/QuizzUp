<template>
  <main style="padding: 24px; font-family: system-ui">
    <header style="display: flex; justify-content: space-between; align-items: center">
      <h1>{{ $t('home.appTitle') }}</h1>
      <LanguageSwitcher />
    </header>

    <section style="margin-top: 16px">
      <h2>{{ $t('home.title') }}</h2>
      <p>{{ $t('home.description') }}</p>

      <p style="margin-top: 12px">
        {{ $t('home.apiHealthLabel') }} :
        <b>
          <span v-if="apiHealthStatus === 'loading'">{{ $t('home.loading') }}</span>
          <span v-else-if="apiHealthStatus === 'unreachable'">{{ $t('home.unreachable') }}</span>
          <span v-else>{{ apiHealthStatus }}</span>
        </b>
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const apiBaseUrl = String(import.meta.env.VITE_API_URL)
const apiHealthStatus = ref<string>('loading')

onMounted(async () => {
  try {
    const response = await fetch(`${apiBaseUrl}/health`)
    const payload: { status: string } = await response.json()
    apiHealthStatus.value = payload.status
  } catch {
    apiHealthStatus.value = 'unreachable'
  }
})
</script>
