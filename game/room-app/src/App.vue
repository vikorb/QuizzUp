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
import { useWindowFocus } from '@/hardware/useWindowFocus'

const route = useRoute()
const { hasFocus } = useWindowFocus()

/** Les buzzers ne comptent que dans le lobby et en jeu. */
const showFocusAlert = computed(
  () => !hasFocus.value && (route.name === 'lobby' || route.name === 'play')
)
</script>
