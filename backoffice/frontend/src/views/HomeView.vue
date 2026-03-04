<template>
  <section class="home">
    <HomeGuest v-if="!isAuthenticated" @login="goLogin" />
    <HomeAuthed v-else />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { getToken,TOKEN_KEY } from '@/utils/auth'
import HomeAuthed from '@/views/home/HomeAuthed.vue'
import HomeGuest from '@/views/home/HomeGuest.vue'

const router = useRouter()

const token = ref<string | null>(getToken())
const isAuthenticated = computed(() => Boolean(token.value))

function syncTokenFromStorage(): void {
  token.value = getToken()
}

watch(
  () => router.currentRoute.value.fullPath,
  () => syncTokenFromStorage()
)

function onStorage(event: StorageEvent) {
  if (event.key === TOKEN_KEY) token.value = event.newValue
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  syncTokenFromStorage()
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
})

function goLogin(): void {
  router.push({ path: '/login', query: { redirect: '/' } })
}
</script>

<style scoped>
.home {
  display: block;
}
</style>
