<template>
  <div class="app-shell">
    <div class="bg-gradient-mesh" aria-hidden="true"></div>

    <TopBar />

    <div class="main-layout" :class="{ 'main-layout--solo': !isAuthenticated }">
      <SideBar v-if="isAuthenticated" class="sidebar" />

      <main class="viewport">
        <UiCard class="content-wrapper">
          <RouterView />
        </UiCard>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import UiCard from '@/components/ui/UiCard.vue'
import { getToken,TOKEN_KEY } from '@/utils/auth'
import SideBar from '@/views/navbar/SideBar.vue'
import TopBar from '@/views/navbar/TopBar.vue'

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
</script>

<style scoped>
.app-shell {
  height: 100vh;
  padding: 20px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bg-gradient-mesh {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(0, 242, 255, 0.1) 0%, transparent 40%);
}

.main-layout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
  margin-top: 20px;
  overflow: hidden;
}

.main-layout--solo {
  grid-template-columns: 1fr;
}

.sidebar {
  min-height: 0;
  overflow: auto;
}

.viewport {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.content-wrapper {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 30px;
}
</style>
