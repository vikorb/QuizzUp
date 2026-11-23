<template>
  <div class="paused" role="alertdialog" aria-live="assertive" data-test="paused-overlay">
    <div class="paused__card">
      <MdIcon :path="mdiPauseCircleOutline" :size="72" />
      <h2 class="paused__title">{{ $t('room.pause.title') }}</h2>
      <p class="paused__text">{{ $t('room.pause.text') }}</p>
      <UiButton data-test="paused-resume" @click="emit('resume')">
        <MdIcon :path="mdiPlay" :size="18" />
        {{ $t('room.pause.resume') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mdiPauseCircleOutline, mdiPlay } from '@mdi/js'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'

const emit = defineEmits<{ resume: [] }>()
</script>

<style scoped>
.paused {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: var(--overlay);
}

.paused__card {
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 640px;
  padding: 36px 40px;
  border-radius: 22px;
  border: 1px solid var(--border-2);
  background: var(--bg-elevated);
  color: var(--text-0);
  text-align: center;
}

.paused__title {
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
}

.paused__text {
  margin: 0 0 8px;
  color: var(--text-1);
  font-size: var(--stage-small);
}
</style>
