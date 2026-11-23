<template>
  <p
    v-if="state !== 'idle'"
    class="live-note"
    role="status"
    data-test="live-connection-note"
    :data-state="state"
  >
    {{ errorKey ? $t(errorKey) : $t(`live.connection.${state}`) }}
  </p>
</template>

<script setup lang="ts">
import type { LiveConnectionState } from '@/composables/useLiveCompany'

defineProps<{
  state: LiveConnectionState
  /** Clé i18n de l'erreur, quand `state` vaut `error`. */
  errorKey: string | null
}>()
</script>

<style scoped>
.live-note {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.live-note[data-state='error'] {
  color: var(--text-0);
  font-weight: 700;
}
</style>
