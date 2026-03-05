<template>
  <div>
    <HomeGuestHero @login="$emit('login')" @learn-more="scrollToFeatures" />

    <div ref="featuresRef">
      <HomeGuestFeatures />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import HomeGuestFeatures from '@/views/home/guest/HomeGuestFeatures.vue'
import HomeGuestHero from '@/views/home/guest/HomeGuestHero.vue'

defineEmits<{
  (event: 'login'): void
}>()

const featuresRef = ref<HTMLElement | null>(null)

function scrollToFeatures(): void {
  featuresRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>
