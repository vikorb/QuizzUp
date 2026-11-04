<template>
  <RouterView />
  <FocusLostOverlay v-if="showFocusAlert" />
  <ConfirmModal />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import FocusLostOverlay from '@/components/game/FocusLostOverlay.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import { useRoomHardware } from '@/hardware/roomHardware'
import { useWindowFocus } from '@/hardware/useWindowFocus'

const route = useRoute()
const { hasFocus } = useWindowFocus()
const { usesGamepad } = useRoomHardware()

/**
 * Les buzzers ne comptent que dans le lobby et en jeu. Une carte manette se lit
 * sans le focus clavier : pas d'alerte pour elle.
 */
const showFocusAlert = computed(
  () => !hasFocus.value && !usesGamepad.value && (route.name === 'lobby' || route.name === 'play')
)
</script>
