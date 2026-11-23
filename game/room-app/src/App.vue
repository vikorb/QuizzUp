<template>
  <RouterView />
  <FocusLostOverlay v-if="showFocusAlert" />
  <ConfirmModal />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FocusLostOverlay from '@/components/game/FocusLostOverlay.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import { useRoomHardware } from '@/hardware/roomHardware'
import { useWindowFocus } from '@/hardware/useWindowFocus'
import { startRoomLive, stopRoomLive } from '@/live/roomLive'
import { isRoomConnected, isRoomReady } from '@/state/roomAuth'

const route = useRoute()
const router = useRouter()
const { hasFocus } = useWindowFocus()
const { usesGamepad } = useRoomHardware()

/**
 * Les buzzers ne comptent que dans le lobby et en jeu. Une carte manette se lit
 * sans le focus clavier : pas d'alerte pour elle.
 */
const showFocusAlert = computed(
  () => !hasFocus.value && !usesGamepad.value && (route.name === 'lobby' || route.name === 'play')
)
// Présence en direct : seulement avec un compte de salle connecté (jamais en démo).
watch(
  isRoomConnected,
  (connected) => (connected ? startRoomLive(() => route.name) : stopRoomLive()),
  { immediate: true }
)
onBeforeUnmount(stopRoomLive)

// Jeton devenu invalide en cours de route (session terminée) : retour à la connexion.
watch(isRoomReady, (ready) => {
  if (!ready && !route.meta.public) {
    void router.replace({ name: 'login' })
  }
})
</script>
