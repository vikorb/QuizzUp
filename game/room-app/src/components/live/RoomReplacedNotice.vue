<template>
  <section v-if="replaced" class="replaced-notice" role="alert" data-test="room-replaced">
    <p class="replaced-notice__text">{{ $t('room.live.errors.room_instance_replaced') }}</p>
    <UiButton data-test="room-live-resume" @click="startRoomLive()">
      {{ $t('room.live.resume') }}
    </UiButton>
  </section>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import { startRoomLive, useRoomLive } from '@/live/roomLive'

/** Un autre poste de la salle a pris la main : la partie continue, seul le suivi à distance est coupé. */
const { replaced } = useRoomLive()
</script>

<style scoped>
.replaced-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px 20px;
  padding: 16px 20px;
  border: 1px solid var(--border-ui);
  border-radius: 12px;
  background: var(--surface-1);
}

.replaced-notice__text {
  margin: 0;
  color: var(--text-1);
}
</style>
