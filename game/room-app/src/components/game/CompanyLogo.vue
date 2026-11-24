<template>
  <img
    v-if="logoUrl && !failed"
    :src="logoUrl"
    :alt="roomCompany?.name ?? ''"
    class="company-logo"
    data-test="company-logo"
    @error="failed = true"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { roomCompany } from '@/state/roomAuth'

/**
 * Logo du centre. Rien (pas d'emplacement vide) sans logo ou si l'image ne charge pas ; la taille
 * maximale est donnée par l'écran qui l'accueille (`--company-logo-h`).
 */
const logoUrl = computed(() => roomCompany.value?.logoUrl ?? null)
const failed = ref(false)

watch(logoUrl, () => {
  failed.value = false
})
</script>

<style scoped>
.company-logo {
  display: block;
  width: auto;
  height: auto;
  max-width: var(--company-logo-w, 100%);
  max-height: var(--company-logo-h, 40px);
  object-fit: contain;
}
</style>
